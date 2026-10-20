<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\AccountingException;
use App\Exceptions\MonthLockedException;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoiceItemBatchAllocation;
use App\Models\JournalEntry;
use App\Models\Loan;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Accounting\SaleJournal;
use App\Services\AccountingService;
use App\DTOs\SummaryDelta;
use App\Services\Summary\SummaryDeltaFactory;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Posts a POS sale: invoice + stock relief + journal + summaries, atomically.
 *
 * Mirrors PurchaseService's safety design:
 *  - 3-layer idempotency (pre-read, fast-path, unique-violation rescue)
 *  - one DB transaction, retried 3x on deadlock
 *  - snapshot rows locked up-front in ascending variant-id order (no deadlocks)
 *  - atomic per-store invoice numbering via sale_number_sequences
 *
 * Sale-specific rules:
 *  - Serialized lines name EXACT units (stock_unit_ids). Each is row-locked and
 *    verified (store match, status 'available', saleable) — a double-sell race
 *    fails with 422, never 500.
 *  - Bulk lines allocate FIFO across stock_batches (oldest remaining_qty > 0
 *    first). A line spanning batches becomes one invoice_items row per batch
 *    for auditability, plus invoice_item_batch_allocations rows.
 *  - Money is computed server-side by SaleGstEvaluationService from the user's
 *    choices (prices, discounts, GST flags — honored, never overridden) and DB
 *    truth (landed_cost / is_margin_scheme per unit & batch). The client preview
 *    must agree within 5 paise or the sale is rejected.
 */
final class SaleService
{
    private const TX_ATTEMPTS = 3;
    private const TOLERANCE_PAISE = 5;

    public function __construct(
        private readonly SaleJournal $journal,
        private readonly AccountingService $accounting,
        private readonly SummaryService $summaries,
        private readonly SaleGstEvaluationService $gst,
    ) {}

    /*
    |--------------------------------------------------------------------------
    | Preview invoice number — no lock, no guarantee. UI hint only.
    |--------------------------------------------------------------------------
    */
    public function previewInvoiceNumber(int $storeId): string
    {
        $seq = DB::table('sale_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number') ?? 1;

        return 'INV-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }

    /*
    |--------------------------------------------------------------------------
    | Main entry point — one atomic transaction, idempotent on idempotency_key.
    |--------------------------------------------------------------------------
    */
    public function processSale(Store $store, User $user, array $data): Invoice
    {
        $key = (string) $data['idempotency_key'];

        if ($existing = $this->findByIdempotencyKey($store->id, $key)) {
            return $existing;
        }

        Log::info('Processing sale', [
            'store_id'        => $store->id,
            'user_id'         => $user->id,
            'idempotency_key' => $key,
            'line_count'      => count($data['lines'] ?? []),
        ]);

        try {
            return DB::transaction(
                fn () => $this->createSale($store, $user, $data),
                self::TX_ATTEMPTS
            );
        } catch (UniqueConstraintViolationException $e) {
            // Two identical requests raced; the loser returns the winner's invoice.
            if ($existing = $this->findByIdempotencyKey($store->id, $key)) {
                return $existing;
            }
            throw $e;
        }
    }

    public function createSale(Store $store, User $user, array $data): Invoice
    {
        $invoiceDate = Carbon::parse($data['invoice_date']);

        // Fail fast (before consuming an invoice number / touching stock) on a locked month.
        if ($this->summaries->isMonthLocked($store->id, $invoiceDate->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $invoiceDate->format('Y-m'));
        }

        // S1: a store that is NOT GST-registered can never bill GST, whatever
        // the client sent. Non-registered sales are always a Bill of Supply.
        $data['is_gst_billed'] = $store->is_gst_registered && (bool) ($data['is_gst_billed'] ?? false);

        [$partyClass, $party] = $this->resolveParty($store, $data);

        // 1. Invoice number (atomic per-store reservation)
        $invoiceNumber = $this->reserveInvoiceNumber($store->id);

        // 2-4. Lock snapshots, build costings, evaluate fiscals, normalize payments.
        [$evaluated, $snapshots, $paid, $due, $payments, $status] = $this->prepareSalePosting($store, $data, $invoiceNumber);

        // 5. Header — evaluated (authoritative) totals are stored, not the preview.
        $invoice = Invoice::create([
            'uuid'            => Str::uuid()->toString(),
            'identity'        => $this->generateBarcodeIdentity(),
            'invoice_number'  => $invoiceNumber,
            'idempotency_key' => $data['idempotency_key'],
            'store_id'        => $store->id,
            'party_type'      => $partyClass,
            'party_id'        => $party->id,
            'invoice_date'    => $data['invoice_date'],
            'is_gst_billed'   => (bool) $data['is_gst_billed'],
            'is_intra_state'  => (bool) $data['is_intra_state'],
            'subtotal'        => $evaluated['subtotal'],
            'tax_amount'      => $evaluated['tax_amount'],
            'discount_amount' => $evaluated['discount_amount'],
            'shipping_charge' => $evaluated['shipping_charge'],
            'round_off'       => $evaluated['round_off'],
            'grand_total'     => $evaluated['grand_total'],
            'paid_amount'     => $paid,
            'due_amount'      => $due,
            'payment_status'  => $status,
            'payment_mode'    => $this->dominantPaymentMode($payments),
            'invoice_type'    => $data['invoice_type'],
            'notes'           => $data['notes'] ?? null,
            'created_by'      => $user->id,
        ]);

        // 5b. Payment breakdown — one row per mode used.
        $this->storeInvoicePayments($invoice, $payments, $user);

        // 6. Persist rows + relieve stock.
        $this->postSaleLines($store, $user, $invoice, $data, $evaluated, $snapshots);

        // 7. Journal + summaries LAST (summary row locks held for shortest time).
        $this->postSaleFinancials($store, $user, $invoice, $data, $evaluated, $paid, $due, $payments);

        return $invoice;
    }

    /**
     * Steps 2-4 of the sale flow, shared by create and edit-repost:
     * lock snapshots, build costings (locks + verifies stock), evaluate fiscals.
     *
     * @return array{0: array, 1: array<int, StockSnapshot>, 2: float, 3: float}
     *         [$evaluated, $snapshots, $paid, $due]
     */
    private function prepareSalePosting(Store $store, array $data, string $invoiceNumber): array
    {
        // 2. Lock every touched snapshot row up-front, ascending variant order.
        $snapshots = $this->lockSnapshots($store->id, $data['lines']);

        // 3. Lock serialized units & allocate bulk FIFO — builds the costings
        //    the fiscal evaluation needs (landed_cost + margin flag per row).
        $costings = $this->buildCostings($store, $data['lines'], $snapshots);

        // 4. Server-side fiscal evaluation (user's choices honored, money computed).
        $evaluated = $this->gst->evaluate($store, $data, $costings);
        $this->assertClientTotalsAgree($invoiceNumber, $data, $evaluated);

        // Payments: the splits are the truth; paid is their sum. Server derives
        // the status — never trust the client's payment_status.
        $payments = $this->normalizePayments($data);
        $paid = $this->r2(array_sum(array_column($payments, 'amount')));
        $clientPaid = $this->r2($data['paid_amount'] ?? 0);
        if (abs($paid - $clientPaid) > 0.011) {
            throw ValidationException::withMessages([
                'paid_amount' => 'Payment splits total ' . number_format($paid, 2) . ' but paid amount is ' . number_format($clientPaid, 2) . '.',
            ]);
        }

        $due    = $this->r2($evaluated['grand_total'] - $paid);
        $status = $due <= 0.009 ? 'paid' : ($paid > 0.009 ? 'partial' : 'unpaid');

        return [$evaluated, $snapshots, $paid, $due, $payments, $status];
    }

    /**
     * Normalize the payment splits. Back-compat: a lone paid_amount/payment_mode
     * without splits becomes a single split.
     *
     * @return list<array{mode: string, amount: float, reference: ?string, purchase_order_id: ?int}>
     */
    private function normalizePayments(array $data): array
    {
        $raw = $data['payments'] ?? [];
        if ($raw === [] && (float) ($data['paid_amount'] ?? 0) > 0) {
            $raw = [[
                'mode'   => $data['payment_mode'] ?? 'cash',
                'amount' => (float) $data['paid_amount'],
            ]];
        }

        $out = [];
        foreach ($raw as $p) {
            $amount = $this->r2($p['amount'] ?? 0);
            if ($amount <= 0) {
                continue;
            }
            $out[] = [
                'mode'              => strtolower((string) ($p['mode'] ?? 'cash')),
                'amount'            => $amount,
                'reference'         => isset($p['reference']) && trim((string) $p['reference']) !== '' ? trim((string) $p['reference']) : null,
                'purchase_order_id' => ! empty($p['purchase_order_id']) ? (int) $p['purchase_order_id'] : null,
            ];
        }

        return $out;
    }

    /**
     * Display-mode cache for invoices.payment_mode: dominant single mode, or
     * 'split' when more than one mode was used.
     */
    private function dominantPaymentMode(array $payments): string
    {
        if ($payments === []) {
            return 'cash';
        }
        $byMode = [];
        foreach ($payments as $p) {
            $byMode[$p['mode']] = ($byMode[$p['mode']] ?? 0) + $p['amount'];
        }
        if (count($byMode) === 1) {
            return (string) array_key_first($byMode);
        }
        arsort($byMode);

        return 'split';
    }

    /**
     * Persist the payment breakdown rows for an invoice.
     *
     * @param list<array{mode: string, amount: float, reference: ?string, purchase_order_id: ?int}> $payments
     */
    private function storeInvoicePayments(Invoice $invoice, array $payments, User $user): void
    {
        foreach ($payments as $p) {
            $invoice->payments()->create([
                'uuid'              => Str::uuid()->toString(),
                'payment_mode'      => $p['mode'],
                'amount'            => $p['amount'],
                'reference'         => $p['reference'],
                'purchase_order_id' => $p['purchase_order_id'],
                'created_by'        => $user->id,
            ]);
        }
    }

    /**
     * @return array{0: class-string, 1: Customer|Supplier}
     */
    private function resolveParty(Store $store, array $data): array
    {
        $partyClass = $data['party_type'] === 'supplier' ? Supplier::class : Customer::class;
        /** @var Customer|Supplier $party */
        $party = $partyClass::findOrFail((int) $data['party_id']);

        // Suppliers ("party" table) are store-scoped; customers are global.
        // Reject a tampered party_id pointing at another store's supplier here,
        // at the service boundary — the HTTP layer validates the same rule.
        if ($partyClass === Supplier::class && (int) $party->store_id !== (int) $store->id) {
            throw ValidationException::withMessages([
                'party_id' => 'The selected party does not belong to this store.',
            ]);
        }

        return [$partyClass, $party];
    }

    /**
     * Persist invoice rows + relieve stock. Shared by create and edit-repost.
     */
    private function postSaleLines(Store $store, User $user, Invoice $invoice, array $data, array $evaluated, array $snapshots): void
    {
        $runningBalances = [];
        foreach ($snapshots as $variantId => $snapshot) {
            $runningBalances[$variantId] = (int) $snapshot->quantity_on_hand;
        }

        foreach ($evaluated['rows'] as $row) {
            $line = $data['lines'][$row['line_index']];

            $item = InvoiceItem::create([
                'invoice_id'       => $invoice->id,
                'product_variant_id' => ! empty($line['product_variant_id']) ? (int) $line['product_variant_id'] : null,
                'manual_item_name' => $line['manual_item_name'] ?? null,
                // Customer-facing warranty for this line: defaults from the
                // sold unit / batch, but the POS lets the cashier override it.
                'warranty'         => $this->blankToNull($line['warranty'] ?? null),
                'stock_unit_id'    => $row['stock_unit_id'],
                'stock_batch_id'   => $row['stock_batch_id'],
                'quantity'         => $row['qty'],
                'unit_price'       => $row['unit_price'],
                'tax_type'         => $line['tax_type'],
                'is_margin_scheme' => $row['is_margin_scheme'],
                'landed_cost'      => $row['landed_cost'],
                'tax_pct'          => $row['tax_pct'],
                'tax_amount'       => $row['tax_amount'],
                'discount_amount'  => $row['discount_amount'],
                'line_total'       => $row['line_total'],
            ]);

            if ($row['stock_unit_id']) {
                $this->sellUnit($store, $user, (int) $row['stock_unit_id'], $item, $snapshots, $line);
            } elseif ($row['stock_batch_id']) {
                $this->sellFromBatch($store, $user, $invoice, $item, $row, $snapshots, $runningBalances);
            }
            // Manual (non-catalog) lines: invoice row only, no stock movement.
        }
    }

    /**
     * Journal + summaries. $journalSuffix (e.g. '-R1') marks re-posts after an edit.
     */
    /**
     * @param list<array{mode: string, amount: float, reference: ?string, purchase_order_id: ?int}> $payments
     */
    private function postSaleFinancials(Store $store, User $user, Invoice $invoice, array $data, array $evaluated, float $paid, float $due, array $payments, ?string $journalSuffix = null): void
    {
        $this->journal->post($invoice, $store, $user, [
            'subtotal'        => $evaluated['subtotal'],
            'tax_amount'      => $evaluated['tax_amount'],
            'discount_amount' => $evaluated['discount_amount'],
            'shipping_charge' => $evaluated['shipping_charge'],
            'round_off'       => $evaluated['round_off'],
            'grand_total'     => $evaluated['grand_total'],
            'paid_amount'     => $paid,
            'due_amount'      => $due,
        ], $evaluated['cogs_total'], $payments, (bool) $data['is_intra_state'], $journalSuffix);

        $this->summaries->record(SummaryDeltaFactory::forSale($store->id, $data, $evaluated, $payments));
    }

    /*
    |--------------------------------------------------------------------------
    | Edit / Delete — reverse-and-repost, never deltas.
    |--------------------------------------------------------------------------
    |
    | An edit fully reverses the original posting (stock, journals, summaries)
    | using the RECORDED allocations, then re-posts the new payload through the
    | same tested path as create, keeping the invoice number. A delete reverses
    | and removes the invoice; the audit trail (journals, ledger, summaries)
    | is never deleted.
    */

    public function updateSale(Store $store, User $user, Invoice $invoice, array $data): Invoice
    {
        $key = (string) $data['idempotency_key'];

        // Fast path: this exact edit was already applied (double-click / retry).
        $existing = Invoice::where('store_id', $store->id)
            ->where('edit_idempotency_key', $key)
            ->first();
        if ($existing && $existing->id === $invoice->id) {
            return $existing;
        }

        Log::info('Updating sale', [
            'store_id'        => $store->id,
            'user_id'         => $user->id,
            'invoice_id'      => $invoice->id,
            'invoice_number'  => $invoice->invoice_number,
            'idempotency_key' => $key,
            'line_count'      => count($data['lines'] ?? []),
        ]);

        // Fail fast on a locked month — the reversal + repost land in the
        // invoice's month, same as create.
        if ($this->summaries->isMonthLocked($store->id, $invoice->invoice_date->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $invoice->invoice_date->format('Y-m'));
        }

        try {
            return DB::transaction(function () use ($store, $user, $invoice, $data, $key) {
                $invoice = Invoice::where('store_id', $store->id)
                    ->where('id', $invoice->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                // Replay check under the row lock — closes the double-submit race.
                if ($invoice->edit_idempotency_key && hash_equals($invoice->edit_idempotency_key, $key)) {
                    return $invoice;
                }

                // S1 normalization (same as create).
                $data['is_gst_billed'] = $store->is_gst_registered && (bool) ($data['is_gst_billed'] ?? false);

                [$partyClass, $party] = $this->resolveParty($store, $data);

                // Gates: loan link, unit states, buyback conflicts.
                $this->assertSaleEditable($store, $invoice);

                $newRevision = $invoice->revision + 1;

                // 1. Reverse everything the original sale posted.
                $this->reverseSale($store, $user, $invoice, "Sale {$invoice->invoice_number} edited (R{$newRevision})");

                // 2-4. Re-evaluate the new payload against live (restored) stock.
                [$evaluated, $snapshots, $paid, $due, $payments, $status] = $this->prepareSalePosting($store, $data, $invoice->invoice_number);

                // 5. Update the header. Identity stays: same id, uuid, identity,
                //    invoice_number and invoice_date. Commercial terms change.
                $invoice->update([
                    'party_type'           => $partyClass,
                    'party_id'             => $party->id,
                    'is_gst_billed'        => (bool) $data['is_gst_billed'],
                    'is_intra_state'       => (bool) $data['is_intra_state'],
                    'subtotal'             => $evaluated['subtotal'],
                    'tax_amount'           => $evaluated['tax_amount'],
                    'discount_amount'      => $evaluated['discount_amount'],
                    'shipping_charge'      => $evaluated['shipping_charge'],
                    'round_off'            => $evaluated['round_off'],
                    'grand_total'          => $evaluated['grand_total'],
                    'paid_amount'          => $paid,
                    'due_amount'           => $due,
                    'payment_status'       => $status,
                    'payment_mode'         => $this->dominantPaymentMode($payments),
                    'invoice_type'         => $data['invoice_type'],
                    'notes'                => $data['notes'] ?? null,
                    'revision'             => $newRevision,
                    'revised_at'           => now(),
                    'revised_by'           => $user->id,
                    'revision_reason'      => $data['revision_reason'] ?? null,
                    'edit_idempotency_key' => $key,
                ]);

                // 5b. Fresh payment breakdown (reverseSale deleted the old rows).
                $this->storeInvoicePayments($invoice, $payments, $user);

                // 6. New rows + stock relief.
                $this->postSaleLines($store, $user, $invoice->fresh(), $data, $evaluated, $snapshots);

                // 7. Journal (suffixed entry numbers — the originals still exist)
                //    + summaries from the new payload.
                $this->postSaleFinancials($store, $user, $invoice->fresh(), $data, $evaluated, $paid, $due, $payments, '-R' . $newRevision);

                return $invoice->fresh();
            }, self::TX_ATTEMPTS);
        } catch (UniqueConstraintViolationException $e) {
            $replayed = Invoice::where('store_id', $store->id)->where('edit_idempotency_key', $key)->first();
            if ($replayed && $replayed->id === $invoice->id) {
                return $replayed;
            }
            // Residual race: a unit was bought back concurrently between the
            // buyback gate and the reversal. Translate to a clear 422.
            if ($this->isActiveIdentifierViolation($e)) {
                throw ValidationException::withMessages([
                    'invoice' => 'A device in this sale was bought back concurrently and is in active stock: '
                        . $this->duplicateIdentifier($e)
                        . '. Please review and retry.',
                ]);
            }
            throw $e;
        }
    }

    /**
     * True when the unique violation came from the active-only identifier
     * uniqueness (a unit restored to 'available' colliding with a concurrent
     * buyback row).
     */
    private function isActiveIdentifierViolation(UniqueConstraintViolationException $e): bool
    {
        $message = $e->getMessage();

        return str_contains($message, 'uniq_active_imei1')
            || str_contains($message, 'uniq_active_imei2')
            || str_contains($message, 'uniq_active_serial');
    }

    /**
     * Pull the offending identifier out of a unique-violation message
     * (MySQL: "Duplicate entry 'X' for key '...uniq_active_imei1'").
     */
    private function duplicateIdentifier(UniqueConstraintViolationException $e): string
    {
        if (preg_match("/Duplicate entry '([^']+)' for key '[^']*uniq_active_(imei1|imei2|serial)'/", $e->getMessage(), $m)) {
            return "'{$m[1]}' ({$m[2]})";
        }

        return 'unknown identifier';
    }

    public function deleteSale(Store $store, User $user, Invoice $invoice): void
    {
        Log::info('Deleting sale', [
            'store_id'       => $store->id,
            'user_id'        => $user->id,
            'invoice_id'     => $invoice->id,
            'invoice_number' => $invoice->invoice_number,
        ]);

        if ($this->summaries->isMonthLocked($store->id, $invoice->invoice_date->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $invoice->invoice_date->format('Y-m'));
        }

        DB::transaction(function () use ($store, $user, $invoice) {
            $invoice = Invoice::where('store_id', $store->id)
                ->where('id', $invoice->id)
                ->lockForUpdate()
                ->firstOrFail();

            $this->assertSaleEditable($store, $invoice);

            $this->reverseSale($store, $user, $invoice, "Sale {$invoice->invoice_number} deleted");

            $invoice->delete();
        }, self::TX_ATTEMPTS);
    }

    /**
     * Edit/delete gates. Throws ValidationException (422) when the sale's
     * effects can no longer be cleanly reversed.
     */
    private function assertSaleEditable(Store $store, Invoice $invoice): void
    {
        // A loan was issued against this invoice — the sale is frozen until
        // the loan is resolved. (Loans reference invoices; editing the sale
        // underneath would corrupt the loan's principal basis.)
        if (Loan::where('invoice_id', $invoice->id)->exists()) {
            throw ValidationException::withMessages([
                'invoice' => "Sale {$invoice->invoice_number} cannot be changed: a loan is linked to it.",
            ]);
        }

        $invoice->loadMissing(['items.stockUnit:id,imei1,imei2,serial_number,status,store_id,product_variant_id,device_condition']);

        foreach ($invoice->items as $item) {
            $unit = $item->stockUnit;
            if (! $item->stock_unit_id || ! $unit) {
                continue;
            }

            // The unit must still be in the exact state this sale left it.
            if ($unit->status !== 'sold') {
                throw ValidationException::withMessages([
                    'invoice' => "Sale {$invoice->invoice_number} cannot be changed: unit " .
                        ($unit->imei1 ?? $unit->serial_number ?? "#{$unit->id}") .
                        " is no longer in sold state (status: {$unit->status}).",
                ]);
            }

            // Buyback guard: restoring this unit to 'available' must not create
            // a duplicate active IMEI/serial (the unit was bought back and the
            // new row is in active stock). The DB unique constraint would catch
            // this, but a clear 422 beats a constraint violation.
            $identifiers = array_filter([$unit->imei1, $unit->imei2, $unit->serial_number]);
            if ($identifiers !== []) {
                $conflict = StockUnit::where('store_id', $store->id)
                    ->where('id', '!=', $unit->id)
                    ->whereIn('status', ['available', 'reserved'])
                    ->where(function ($q) use ($unit) {
                        $q->when($unit->imei1, fn ($q2) => $q2->orWhere('imei1', $unit->imei1))
                          ->when($unit->imei2, fn ($q2) => $q2->orWhere('imei2', $unit->imei2))
                          ->when($unit->serial_number, fn ($q2) => $q2->orWhere('serial_number', $unit->serial_number));
                    })
                    ->exists();

                if ($conflict) {
                    throw ValidationException::withMessages([
                        'invoice' => "Sale {$invoice->invoice_number} cannot be changed: unit " .
                            ($unit->imei1 ?? $unit->serial_number ?? "#{$unit->id}") .
                            " was bought back and is in active stock.",
                    ]);
                }
            }
        }
    }

    /**
     * Reverse a posted sale completely, inside the caller's transaction.
     * Driven by RECORDED allocations — nothing is recomputed.
     */
    /**
     * Record a later collection against a partial/unpaid sale.
     * Appends a payment split, updates paid/due/status, posts the
     * collection journal (Dr mode account / Cr receivables) and records
     * the collected bucket in the summaries.
     */
    public function collectPayment(Store $store, User $user, Invoice $invoice, array $payment): Invoice
    {
        return DB::transaction(function () use ($store, $user, $invoice, $payment) {
            $invoice = Invoice::where('store_id', $store->id)
                ->where('id', $invoice->id)
                ->lockForUpdate()
                ->firstOrFail();

            $amount = $this->r2($payment['amount'] ?? 0);
            if ($amount <= 0) {
                throw ValidationException::withMessages(['amount' => 'Collection amount must be positive.']);
            }

            $due = (float) $invoice->due_amount;
            if ($due <= 0.009) {
                throw ValidationException::withMessages(['amount' => 'This invoice has no due amount.']);
            }
            if ($amount - $due > 0.011) {
                throw ValidationException::withMessages(['amount' => 'Collection cannot exceed the due amount of ' . number_format($due, 2) . '.']);
            }

            if ($this->summaries->isMonthLocked($store->id, now()->format('Y-m'))) {
                throw MonthLockedException::for($store->id, now()->format('Y-m'));
            }

            $mode = strtolower((string) ($payment['mode'] ?? 'cash'));
            $reference = isset($payment['reference']) && trim((string) $payment['reference']) !== ''
                ? trim((string) $payment['reference'])
                : null;

            $invoice->payments()->create([
                'uuid'         => Str::uuid()->toString(),
                'payment_mode' => $mode,
                'amount'       => $amount,
                'reference'    => $reference,
                'created_by'   => $user->id,
            ]);

            $paid = $this->r2((float) $invoice->paid_amount + $amount);
            $newDue = $this->r2((float) $invoice->grand_total - $paid);
            $invoice->update([
                'paid_amount'    => $paid,
                'due_amount'     => $newDue,
                'payment_status' => $newDue <= 0.009 ? 'paid' : 'partial',
                'payment_mode'   => $this->dominantPaymentMode(
                    $invoice->payments()->get(['payment_mode', 'amount'])
                        ->map(fn ($p) => ['mode' => $p->payment_mode, 'amount' => (float) $p->amount])
                        ->all()
                ),
            ]);

            $this->journal->postCollection($invoice, $store, $user, $mode, $amount, $reference);
            $this->summaries->record(SummaryDeltaFactory::forCollection($store->id, now()->toDateString(), $mode, $amount));

            Log::info('Sale collection recorded', [
                'store_id' => $store->id, 'invoice_id' => $invoice->id,
                'mode' => $mode, 'amount' => $amount,
            ]);

            return $invoice->fresh();
        }, self::TX_ATTEMPTS);
    }

    private function reverseSale(Store $store, User $user, Invoice $invoice, string $reason): void
    {
        // 1. Journals — the originals stay; REV- mirror entries are posted.
        //    Dated at the invoice date so the reversal lands in the same period.
        $entries = JournalEntry::where('store_id', $store->id)
            ->where('reference_type', Invoice::class)
            ->where('reference_id', $invoice->id)
            ->where('entry_number', 'not like', 'REV-%')
            // Skip entries that already have a reversal: a 2nd edit/delete
            // would otherwise re-reverse the originals and collide on the
            // deterministic 'REV-…' entry number (unique per store).
            ->whereNotExists(function ($q) {
                $q->selectRaw('1')
                    ->from('journal_entries as rev')
                    ->whereColumn('rev.reverses_journal_id', 'journal_entries.id');
            })
            ->lockForUpdate()
            ->get();

        foreach ($entries as $entry) {
            $reversal = $this->accounting->reverse($entry, $user->id, $reason, $invoice->invoice_date);
            $reversal->update(['reverses_journal_id' => $entry->id]);
        }

        // 2. Summaries — negate the recorded posting, rebuilt from recorded rows.
        $invoice->loadMissing(['items.stockUnit:id,device_condition', 'items.batchAllocations']);
        $this->summaries->record($this->saleReversalDelta($invoice, $store));

        // 3. Stock — lock every touched snapshot row up-front (ascending id),
        //    then restore exactly what this sale consumed.
        $variantIds = $invoice->items->pluck('product_variant_id')->filter()->unique()->sort()->values();
        $snapshots  = [];
        foreach ($variantIds as $variantId) {
            $snapshots[$variantId] = StockSnapshot::where('store_id', $store->id)
                ->where('product_variant_id', $variantId)
                ->lockForUpdate()
                ->first(); // tolerant: sale created it, but never fail the reversal on it
        }

        $runningBalances = [];
        foreach ($snapshots as $variantId => $snapshot) {
            $runningBalances[$variantId] = $snapshot ? (int) $snapshot->quantity_on_hand : 0;
        }

        foreach ($invoice->items as $item) {
            if ($item->stock_unit_id && $item->stockUnit) {
                $this->restoreUnit($store, $user, $item->stockUnit, $item, $snapshots, $runningBalances);
            }
            foreach ($item->batchAllocations as $alloc) {
                $this->restoreBatchQty($store, $user, $invoice, $item, $alloc, $snapshots, $runningBalances);
            }
            $item->batchAllocations()->delete();
            $item->delete();
        }

        // Payment breakdown rows are reversed with the sale; the edit re-post
        // writes fresh ones (deleteSale relies on invoice cascade).
        $invoice->payments()->delete();
    }

    /**
     * @param array<string, int> $runningBalances variant_id => live on-hand balance
     */
    private function restoreUnit(Store $store, User $user, StockUnit $unit, InvoiceItem $item, array $snapshots, array &$runningBalances): void
    {
        $unit->update(['status' => 'available']);

        $event = StockUnitEvent::create([
            'stock_unit_id'  => $unit->id,
            'store_id'       => $store->id,
            'event_type'     => 'sale_reversed',
            'reference_type' => InvoiceItem::class,
            'reference_id'   => $item->id,
            'created_by'     => $user->id,
        ]);

        $variantId = $unit->product_variant_id;
        if ($variantId && isset($snapshots[$variantId]) && $snapshots[$variantId]) {
            $runningBalances[$variantId] += 1;
            $snapshots[$variantId]->update([
                'quantity_on_hand'           => $runningBalances[$variantId],
                'last_unit_event_id_applied' => $event->id,
            ]);
        }
    }

    /**
     * @param array<string, int> $runningBalances variant_id => live on-hand balance
     */
    private function restoreBatchQty(Store $store, User $user, Invoice $invoice, InvoiceItem $item, InvoiceItemBatchAllocation $alloc, array $snapshots, array &$runningBalances): void
    {
        $batch = StockBatch::where('store_id', $store->id)
            ->where('id', $alloc->stock_batch_id)
            ->lockForUpdate()
            ->first();

        if (! $batch) {
            throw ValidationException::withMessages([
                'invoice' => "Sale {$invoice->invoice_number} cannot be changed: a stock batch it consumed no longer exists.",
            ]);
        }

        $batch->increment('remaining_qty', $alloc->quantity);

        $variantId = (int) $batch->product_variant_id;
        $runningBalances[$variantId] = ($runningBalances[$variantId] ?? 0) + $alloc->quantity;

        $ledger = StockLedger::create([
            'idempotency_key'    => $invoice->uuid . ':reversal:' . $item->id . ':' . $batch->id,
            'store_id'           => $store->id,
            'product_variant_id' => $variantId,
            'stock_batch_id'     => $batch->id,
            'transaction_type'   => 'sale_reversal',
            'quantity_delta'     => $alloc->quantity,
            'balance_after'      => $runningBalances[$variantId],
            'base_cost'          => (float) $batch->base_cost,
            'landed_cost'        => (float) $batch->landed_cost,
            'reference_type'     => InvoiceItem::class,
            'reference_id'       => $item->id,
            'created_by'         => $user->id,
        ]);

        if (isset($snapshots[$variantId]) && $snapshots[$variantId]) {
            $snapshots[$variantId]->update([
                'quantity_on_hand'       => $runningBalances[$variantId],
                'last_ledger_id_applied' => $ledger->id,
            ]);
        }
    }

    /**
     * The summary delta that exactly negates this invoice's original posting,
     * rebuilt from the recorded item rows.
     */
    private function saleReversalDelta(Invoice $invoice, Store $store): SummaryDelta
    {
        $rows = [];
        $cogs = 0.0;

        foreach ($invoice->items as $item) {
            $rows[] = [
                'line_total'       => (float) $item->line_total,
                'qty'              => (int) $item->quantity,
                'stock_unit_id'    => $item->stock_unit_id,
                'device_condition' => $item->stockUnit->device_condition ?? 'NEW',
            ];
            $cogs += (float) $item->landed_cost * (int) $item->quantity;
        }

        $data = [
            'payment_mode' => $invoice->payment_mode,
            'paid_amount'  => (float) $invoice->paid_amount,
            'invoice_date' => $invoice->invoice_date,
        ];

        $evaluated = [
            'rows'            => $rows,
            'grand_total'     => (float) $invoice->grand_total,
            'tax_amount'      => (float) $invoice->tax_amount,
            'discount_amount' => (float) $invoice->discount_amount,
            'cogs_total'      => $cogs,
        ];

        // Reverse the per-mode buckets the payments were actually recorded
        // in — the scalar back-compat path would negate the whole paid
        // amount from one bucket and drift the collection buckets on
        // split-paid sales.
        $payments = $invoice->payments
            ->map(fn ($p) => ['mode' => (string) $p->payment_mode, 'amount' => (float) $p->amount])
            ->all();

        return SummaryDeltaFactory::forSale($store->id, $data, $evaluated, $payments)->reversed();
    }

    /*
    |--------------------------------------------------------------------------
    | Costings: lock stock, verify saleability, cost every row.
    |--------------------------------------------------------------------------
    |
    | Returns per line-index a list of cost entries:
    |   ['qty', 'landed_cost', 'is_margin_scheme', 'stock_unit_id',
    |    'stock_batch_id', 'device_condition']
    */

    /**
     * @return array<int, list<array{qty: int, landed_cost: float, is_margin_scheme: bool, stock_unit_id: ?int, stock_batch_id: ?int, device_condition: ?string}>>
     */
    private function buildCostings(Store $store, array $lines, array $snapshots): array
    {
        $costings = [];

        // Serialized: lock every named unit in one query, then verify.
        $allUnitIds = [];
        foreach ($lines as $i => $line) {
            if (! empty($line['is_serialized'])) {
                foreach ($line['stock_unit_ids'] ?? [] as $uid) {
                    $allUnitIds[$i][] = (int) $uid;
                }
            }
        }

        $lockedUnits = [];
        if ($allUnitIds !== []) {
            $flatIds = collect($allUnitIds)->flatten()->unique()->values()->all();

            $lockedUnits = StockUnit::query()
                ->where('store_id', $store->id)
                ->whereIn('id', $flatIds)
                ->lockForUpdate()
                ->get()
                ->keyBy('id')
                ->all();
        }

        foreach ($lines as $i => $line) {
            $variantId    = ! empty($line['product_variant_id']) ? (int) $line['product_variant_id'] : null;
            $isSerialized = ! empty($line['is_serialized']);
            $costings[$i] = [];

            if ($isSerialized) {
                foreach ($allUnitIds[$i] ?? [] as $uid) {
                    $unit = $lockedUnits[$uid] ?? null;

                    if (! $unit || $unit->status !== 'available' || ! $unit->is_saleable) {
                        // 422, never 500: the unit was sold/reserved by someone else,
                        // belongs to another store, or doesn't exist.
                        throw ValidationException::withMessages([
                            "lines.{$i}.stock_unit_ids" => "Unit #{$uid} is no longer available for sale.",
                        ]);
                    }

                    $costings[$i][] = [
                        'qty'              => 1,
                        'landed_cost'      => (float) $unit->landed_cost,
                        'is_margin_scheme' => (bool) $unit->is_margin_scheme,
                        'stock_unit_id'    => $unit->id,
                        'stock_batch_id'   => null,
                        'device_condition' => $unit->device_condition,
                    ];
                }
                continue;
            }

            // Bulk: FIFO across batches with remaining qty, oldest first.
            // The POS may pass a preferred_batch_id (cashier picked a batch);
            // it is allocated FIRST, the rest continues FIFO. Batches held
            // for QC (is_saleable = false) are never allocated.
            $qty = max(1, (int) ($line['qty'] ?? 1));

            if (! $variantId) {
                continue; // manual item: no stock behind it
            }

            $snapshot  = $snapshots[$variantId] ?? null;
            $available = $snapshot ? max(0, (int) $snapshot->quantity_on_hand - (int) $snapshot->quantity_reserved) : 0;

            if ($available < $qty) {
                throw ValidationException::withMessages([
                    "lines.{$i}.qty" => "Only {$available} unit(s) available in stock.",
                ]);
            }

            $needed  = $qty;
            $preferredBatchId = ! empty($line['preferred_batch_id']) ? (int) $line['preferred_batch_id'] : null;

            $batches = StockBatch::query()
                ->where('store_id', $store->id)
                ->where('product_variant_id', $variantId)
                ->where('remaining_qty', '>', 0)
                ->where('is_saleable', true)
                // Preferred batch first; the where-clauses above still apply,
                // so a foreign/empty batch id degrades to plain FIFO safely.
                ->when($preferredBatchId, fn ($q) => $q->orderByRaw('id = ? desc', [$preferredBatchId]))
                ->orderBy('created_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            if ($preferredBatchId && ! $batches->contains('id', $preferredBatchId)) {
                // The requested batch is not saleable stock of this
                // store/variant (foreign id, empty, or QC-held): fail loudly
                // rather than silently selling from a different batch.
                throw ValidationException::withMessages([
                    "lines.{$i}.preferred_batch_id" => 'The selected batch is not available for this store and product.',
                ]);
            }

            foreach ($batches as $batch) {
                if ($needed <= 0) {
                    break;
                }
                $take = min((int) $batch->remaining_qty, $needed);

                $costings[$i][] = [
                    'qty'              => $take,
                    'landed_cost'      => (float) $batch->landed_cost,
                    'is_margin_scheme' => (bool) $batch->is_margin_scheme,
                    'stock_unit_id'    => null,
                    'stock_batch_id'   => $batch->id,
                    'device_condition' => null,
                ];

                $needed -= $take;
            }

            if ($needed > 0) {
                // Snapshot said available but batches are short — data repair needed.
                throw ValidationException::withMessages([
                    "lines.{$i}.qty" => 'Stock batches are short for this variant. Please retry.',
                ]);
            }
        }

        return $costings;
    }

    /*
    |--------------------------------------------------------------------------
    | Stock relief
    |--------------------------------------------------------------------------
    */

    private function sellUnit(Store $store, User $user, int $unitId, InvoiceItem $item, array $snapshots, array $line): void
    {
        // Already locked + verified in buildCostings().
        $unit = StockUnit::find($unitId);
        $unit->update(['status' => 'sold']);

        $event = StockUnitEvent::create([
            'stock_unit_id'  => $unit->id,
            'store_id'       => $store->id,
            'event_type'     => 'sold',
            'reference_type' => InvoiceItem::class,
            'reference_id'   => $item->id,
            'created_by'     => $user->id,
        ]);

        $variantId = ! empty($line['product_variant_id']) ? (int) $line['product_variant_id'] : null;
        if ($variantId && isset($snapshots[$variantId])) {
            $snapshot = $snapshots[$variantId];
            $snapshot->update([
                // total_quantity is lifetime cumulative and never decrements.
                'quantity_on_hand'          => $snapshot->quantity_on_hand - 1,
                'last_unit_event_id_applied' => $event->id,
            ]);
        }
    }

    /**
     * @param array<string, int> $runningBalances variant_id => live on-hand balance
     */
    private function sellFromBatch(
        Store $store,
        User $user,
        Invoice $invoice,
        InvoiceItem $item,
        array $row,
        array $snapshots,
        array &$runningBalances,
    ): void {
        $batch = StockBatch::find($row['stock_batch_id']);

        // Already locked in buildCostings(); re-read is cheap and safe.
        $batch->decrement('remaining_qty', $row['qty']);

        $variantId = (int) $batch->product_variant_id;
        $runningBalances[$variantId] -= $row['qty'];

        $ledger = StockLedger::create([
            'idempotency_key'    => $invoice->uuid . ':alloc:' . $item->id . ':' . $batch->id,
            'store_id'           => $store->id,
            'product_variant_id' => $variantId,
            'stock_batch_id'     => $batch->id,
            'transaction_type'   => 'sale',
            'quantity_delta'     => -$row['qty'],
            'balance_after'      => $runningBalances[$variantId],
            'base_cost'          => (float) $batch->base_cost,
            'landed_cost'        => (float) $batch->landed_cost,
            'reference_type'     => InvoiceItem::class,
            'reference_id'       => $item->id,
            'created_by'         => $user->id,
        ]);

        InvoiceItemBatchAllocation::create([
            'invoice_item_id' => $item->id,
            'stock_batch_id'  => $batch->id,
            'quantity'        => $row['qty'],
            // COGS basis for this allocation (batch landed cost at sale time).
            'unit_cost'       => (float) $batch->landed_cost,
        ]);

        if (isset($snapshots[$variantId])) {
            $snapshot = $snapshots[$variantId];
            $snapshot->update([
                'quantity_on_hand'       => $snapshot->quantity_on_hand - $row['qty'],
                'last_ledger_id_applied' => $ledger->id,
            ]);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Snapshots — same deadlock-safe pattern as PurchaseService.
    |--------------------------------------------------------------------------
    */

    /**
     * @return array<int, StockSnapshot> keyed by product_variant_id
     */
    private function lockSnapshots(int $storeId, array $lines): array
    {
        $variantIds = collect($lines)
            ->pluck('product_variant_id')
            ->filter()
            ->map(fn ($v) => (int) $v)
            ->unique()
            ->sort()
            ->values()
            ->all();

        if ($variantIds === []) {
            return [];
        }

        $now = now();

        DB::table('stock_snapshots')->insertOrIgnore(array_map(fn (int $id) => [
            'store_id'           => $storeId,
            'product_variant_id' => $id,
            'quantity_on_hand'   => 0,
            'quantity_reserved'  => 0,
            'total_quantity'     => 0,
            'created_at'         => $now,
            'updated_at'         => $now,
        ], $variantIds));

        return StockSnapshot::query()
            ->where('store_id', $storeId)
            ->whereIn('product_variant_id', $variantIds)
            ->orderBy('product_variant_id')
            ->lockForUpdate()
            ->get()
            ->keyBy('product_variant_id')
            ->all();
    }

    /*
    |--------------------------------------------------------------------------
    | Guards & helpers
    |--------------------------------------------------------------------------
    */

    /**
     * The client preview (sale-context.tsx) implements the same formulas as
     * SaleGstEvaluationService, so agreement is expected. A drift beyond
     * 5 paise means a tampered request or stock that changed mid-sale —
     * reject loudly rather than booking wrong tax.
     */
    private function assertClientTotalsAgree(string $invoiceNumber, array $data, array $evaluated): void
    {
        $toPaise = fn ($n) => (int) round(((float) $n) * 100);

        $pairs = [
            'subtotal'      => [$data['subtotal'], $evaluated['subtotal']],
            'tax_amount'    => [$data['tax_amount'], $evaluated['tax_amount']],
            'discount_amount' => [$data['discount_amount'], $evaluated['discount_amount']],
            'grand_total'   => [$data['grand_total'], $evaluated['grand_total']],
        ];

        foreach ($pairs as $field => [$client, $server]) {
            if (abs($toPaise($client) - $toPaise($server)) > self::TOLERANCE_PAISE) {
                throw AccountingException::saleTotalsMismatch($invoiceNumber, abs($toPaise($client) - $toPaise($server)));
            }
        }
    }

    /**
     * Atomic per-store invoice numbering. The INSERT ... ON DUPLICATE KEY UPDATE
     * takes an exclusive lock on the sequence row held until this transaction
     * commits, so two sales can never receive the same number.
     */
    private function reserveInvoiceNumber(int $storeId): string
    {
        DB::statement(
            'INSERT INTO sale_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        $next = (int) DB::table('sale_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number');

        return 'INV-' . str_pad((string) ($next - 1), 6, '0', STR_PAD_LEFT);
    }

    private function findByIdempotencyKey(int $storeId, string $key): ?Invoice
    {
        return Invoice::query()
            ->where('store_id', $storeId)
            ->where('idempotency_key', $key)
            ->first();
    }

    /** 18 chars: 'IN' + 64 random bits (hex). invoices.identity is UNIQUE. */
    private function generateBarcodeIdentity(): string
    {
        return 'IN' . strtoupper(bin2hex(random_bytes(8)));
    }

    private function r2(float|int|string|null $n): float
    {
        return round((float) $n + 1e-10, 2);
    }

    private function blankToNull(mixed $v): ?string
    {
        $v = is_string($v) ? trim($v) : $v;

        return ($v === '' || $v === null) ? null : (string) $v;
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\JournalEntryData;
use App\Exceptions\AccountingException;
use App\Models\CreditNote;
use App\Models\CreditNoteItem;
use App\Models\Invoice;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\Summary\SummaryDeltaFactory;
use App\Services\SummaryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Sales returns (credit notes).
 *
 * A customer return is a FIRST-CLASS document — not an edit or delete of the
 * original sale. The sale stays intact (correct date attribution, audit trail);
 * the credit note restores stock, reverses revenue/tax/COGS, and either refunds
 * cash or adjusts the customer's dues.
 *
 * Refund modes:
 *   cash   — hand cash back now (Cr 1010)
 *   adjust — reduce the invoice's receivable (Cr 1030); if the invoice was
 *            already fully paid this becomes customer credit held on the note
 */
final class CreditNoteService
{
    private const TX_ATTEMPTS = 3;

    public function __construct(
        private readonly AccountingService $accounting,
        private readonly SummaryService $summaries,
    ) {}

    /**
     * @param array{items: list<array{invoice_item_id: int, quantity: int}>, reason: string, refund_mode: string, credit_note_date: string, notes?: ?string, idempotency_key?: ?string} $data
     */
    public function issue(Store $store, User $user, Invoice $invoice, array $data): CreditNote
    {
        return DB::transaction(function () use ($store, $user, $invoice, $data) {
            $invoice = Invoice::where('store_id', $store->id)
                ->where('id', $invoice->id)
                ->lockForUpdate()
                ->firstOrFail();

            // Idempotency: a retried request with the same key returns the original.
            if (! empty($data['idempotency_key'])) {
                $existing = CreditNote::where('store_id', $store->id)
                    ->where('idempotency_key', $data['idempotency_key'])
                    ->first();
                if ($existing) {
                    return $existing;
                }
            }

            $cnDate = \Carbon\Carbon::parse($data['credit_note_date'])->toDateString();
            if ($this->summaries->isMonthLocked($store->id, substr($cnDate, 0, 7))) {
                throw ValidationException::withMessages([
                    'credit_note_date' => 'The month ' . substr($cnDate, 0, 7) . ' is locked.',
                ]);
            }

            // 1. Validate return lines against live invoice state.
            $returnLines = $this->validateReturnLines($invoice, $data['items'] ?? []);

            $subtotal = $this->r2(array_sum(array_column($returnLines, 'refund_subtotal')));
            $taxTotal = $this->r2(array_sum(array_column($returnLines, 'refund_tax')));
            $grandTotal = $this->r2($subtotal + $taxTotal);
            $cogsTotal = $this->r2(array_sum(array_column($returnLines, 'cogs')));

            if ($grandTotal <= 0) {
                throw ValidationException::withMessages(['items' => 'The selected items have no returnable value.']);
            }

            $refundMode = $data['refund_mode'] ?? 'adjust';
            if (! in_array($refundMode, ['cash', 'adjust'], true)) {
                throw ValidationException::withMessages(['refund_mode' => 'Refund mode must be cash or adjust.']);
            }

            // A cash refund pays money back out — it can never exceed what the
            // customer actually paid on this invoice. Anything above the paid
            // amount has to settle against the outstanding due instead.
            if ($refundMode === 'cash' && $grandTotal > (float) $invoice->paid_amount + 0.005) {
                throw ValidationException::withMessages([
                    'refund_mode' => 'Cash refund of ' . number_format($grandTotal, 2) . ' exceeds the amount paid on this invoice (' . number_format((float) $invoice->paid_amount, 2) . '). Use Adjust mode to settle the return against the due amount.',
                ]);
            }

            // 2. Reserve the credit note number (atomic).
            $cnNumber = $this->reserveCreditNoteNumber($store->id);

            $cn = CreditNote::create([
                'uuid'              => Str::uuid()->toString(),
                'store_id'          => $store->id,
                'customer_id'       => $invoice->party_type === \App\Models\Customer::class ? $invoice->party_id : null,
                'invoice_id'        => $invoice->id,
                'credit_note_number' => $cnNumber,
                'credit_note_date'  => $cnDate,
                'subtotal'          => $subtotal,
                'tax_amount'        => $taxTotal,
                'grand_total'       => $grandTotal,
                'reason'            => $data['reason'],
                'status'            => 'issued',
                'notes'             => $data['notes'] ?? null,
                'idempotency_key'   => $data['idempotency_key'] ?? null,
                'created_by'        => $user->id,
            ]);

            foreach ($returnLines as $line) {
                CreditNoteItem::create([
                    'credit_note_id'     => $cn->id,
                    'invoice_item_id'    => $line['invoice_item_id'],
                    'product_variant_id' => $line['product_variant_id'],
                    'manual_item_name'   => $line['manual_item_name'],
                    'quantity'           => $line['quantity'],
                    'unit_price'         => $line['unit_price'],
                    'tax_pct'            => $line['tax_pct'],
                    'tax_amount'         => $line['refund_tax'],
                    'line_total'         => $line['refund_total'],
                ]);
            }

            // 3. Restore stock (units → available, batches += qty).
            $this->restoreStock($store, $user, $invoice, $cn, $returnLines);

            // 4. Journal: reverse revenue/tax/COGS, refund or adjust.
            $this->postJournal($cn, $store, $user, $invoice, $subtotal, $taxTotal, $grandTotal, $cogsTotal, $refundMode);

            // 5. Summaries: negate the sale's contribution, record the refund.
            $this->summaries->record(SummaryDeltaFactory::forCreditNote($store->id, $cnDate, $returnLines, $subtotal, $taxTotal, $grandTotal, $cogsTotal));

            // 6. Settle the invoice itself. Adjust mode credits the receivable
            //    in the journal (Cr 1030) — the invoice row must match, or the
            //    bill keeps showing the full due and Collect Payment would
            //    collect the adjusted amount a second time. Cash mode leaves
            //    the invoice untouched: invoice_payments is the money-in
            //    record and this credit note is the money-out record.
            if ($refundMode === 'adjust') {
                $newDue = max(0.0, $this->r2((float) $invoice->due_amount - $grandTotal));
                $invoice->update([
                    'due_amount'     => $newDue,
                    'payment_status' => $newDue <= 0.0
                        ? 'paid'
                        : ((float) $invoice->paid_amount > 0 ? 'partial' : 'unpaid'),
                ]);
            }

            Log::info('Credit note issued', [
                'store_id' => $store->id, 'credit_note_id' => $cn->id,
                'invoice_id' => $invoice->id, 'grand_total' => $grandTotal,
            ]);

            return $cn->fresh();
        }, self::TX_ATTEMPTS);
    }

    /**
     * Validate each return line: the item belongs to the invoice, the qty
     * hasn't already been returned, and serialized units are still sold.
     *
     * @return list<array>
     */
    private function validateReturnLines(Invoice $invoice, array $items): array
    {
        if ($items === []) {
            throw ValidationException::withMessages(['items' => 'Select at least one item to return.']);
        }

        $invoice->loadMissing(['items.stockUnit', 'items.batchAllocations']);

        // Already-returned qty per invoice item (from prior credit notes).
        $returnedQty = DB::table('credit_note_items')
            ->join('credit_notes', 'credit_notes.id', '=', 'credit_note_items.credit_note_id')
            ->where('credit_notes.invoice_id', $invoice->id)
            ->where('credit_notes.status', 'issued')
            ->groupBy('credit_note_items.invoice_item_id')
            ->pluck(DB::raw('SUM(credit_note_items.quantity)'), 'credit_note_items.invoice_item_id')
            ->all();

        $lines = [];
        foreach ($items as $idx => $req) {
            $item = $invoice->items->firstWhere('id', (int) ($req['invoice_item_id'] ?? 0));
            if (! $item) {
                throw ValidationException::withMessages(["items.$idx" => 'Item does not belong to this invoice.']);
            }

            $qty = (int) ($req['quantity'] ?? 0);
            $alreadyReturned = (int) ($returnedQty[$item->id] ?? 0);
            $available = (int) $item->quantity - $alreadyReturned;

            if ($qty <= 0 || $qty > $available) {
                throw ValidationException::withMessages([
                    "items.$idx" => "Return quantity must be between 1 and {$available} for this line.",
                ]);
            }

            // Serialized units must still be in 'sold' status (not resold,
            // not sent for buyback, not otherwise moved).
            $unit = $item->stock_unit_id ? $item->stockUnit : null;
            if ($unit && $unit->status !== 'sold') {
                throw ValidationException::withMessages([
                    "items.$idx" => "This unit is no longer marked sold (status: {$unit->status}) and cannot be returned.",
                ]);
            }

            // Pro-rata refund from the posted line values.
            $ratio = $qty / (int) $item->quantity;
            $lineBase = (float) $item->line_total - (float) $item->tax_amount;
            $refundSubtotal = $this->r2($lineBase * $ratio);
            $refundTax = $this->r2((float) $item->tax_amount * $ratio);

            $lines[] = [
                'invoice_item_id'    => $item->id,
                'product_variant_id' => $item->product_variant_id,
                'manual_item_name'   => $item->manual_item_name,
                'quantity'           => $qty,
                'unit_price'         => (float) $item->unit_price,
                'tax_pct'            => (float) $item->tax_pct,
                'refund_subtotal'    => $refundSubtotal,
                'refund_tax'         => $refundTax,
                'refund_total'       => $this->r2($refundSubtotal + $refundTax),
                'cogs'               => $this->r2((float) $item->landed_cost * $qty),
                'stock_unit_id'      => $item->stock_unit_id,
                'stock_unit'         => $unit,
                'allocations'        => $item->batchAllocations,
            ];
        }

        return $lines;
    }

    /**
     * Put the returned stock back: serialized units to available, batch
     * quantities restored with ledger rows.
     */
    private function restoreStock(Store $store, User $user, Invoice $invoice, CreditNote $cn, array $lines): void
    {
        $variantIds = collect($lines)->pluck('product_variant_id')->filter()->unique()->sort()->values()->all();
        $snapshots = $this->lockSnapshots($store->id, $variantIds);
        $running = [];

        foreach ($lines as $line) {
            $variantId = $line['product_variant_id'];

            if ($line['stock_unit']) {
                $unit = StockUnit::where('store_id', $store->id)->lockForUpdate()->findOrFail($line['stock_unit']->id);
                $unit->update(['status' => 'available']);
                StockUnitEvent::create([
                    'stock_unit_id'  => $unit->id,
                    'store_id'       => $store->id,
                    'event_type'     => 'return_received',
                    'reference_type' => CreditNote::class,
                    'reference_id'   => $cn->id,
                    'note'           => 'Customer return — ' . $cn->credit_note_number,
                    'created_by'     => $user->id,
                ]);
            }

            // Bulk: restore qty across the original allocations (FIFO order).
            $qtyToRestore = $line['quantity'];
            foreach ($line['allocations'] as $alloc) {
                if ($qtyToRestore <= 0) {
                    break;
                }
                $restore = min($qtyToRestore, (int) $alloc->quantity);
                $batch = StockBatch::where('store_id', $store->id)->lockForUpdate()->findOrFail($alloc->stock_batch_id);

                // Capture on-hand BEFORE the increment — liveOnHand re-sums from DB.
                if (! array_key_exists($variantId, $running)) {
                    $running[$variantId] = $this->liveOnHand($store->id, $variantId);
                }
                $batch->increment('remaining_qty', $restore);
                $running[$variantId] += $restore;

                StockLedger::create([
                    'idempotency_key'    => $cn->uuid . ':return:' . $line['invoice_item_id'] . ':' . $batch->id,
                    'store_id'           => $store->id,
                    'product_variant_id' => $variantId,
                    'stock_batch_id'     => $batch->id,
                    'transaction_type'   => 'sale_return',
                    'quantity_delta'     => $restore,
                    'balance_after'      => $running[$variantId],
                    'base_cost'          => (float) $batch->base_cost,
                    'landed_cost'        => (float) $batch->landed_cost,
                    'reference_type'     => CreditNote::class,
                    'reference_id'       => $cn->id,
                    'created_by'         => $user->id,
                ]);

                $qtyToRestore -= $restore;
            }

            // Snapshot: refresh the live on-hand balance.
            if ($variantId && isset($snapshots[$variantId])) {
                if (! array_key_exists($variantId, $running)) {
                    $running[$variantId] = $this->liveOnHand($store->id, $variantId);
                }
                $snapshots[$variantId]->update(['quantity_on_hand' => $running[$variantId]]);
            }
        }
    }

    private function liveOnHand(int $storeId, int $variantId): int
    {
        $units = (int) StockUnit::where('store_id', $storeId)
            ->where('product_variant_id', $variantId)
            ->where('status', 'available')
            ->count();
        $batches = (int) StockBatch::where('store_id', $storeId)
            ->where('product_variant_id', $variantId)
            ->sum('remaining_qty');

        return $units + $batches;
    }

    /**
     * Journal for the credit note.
     *   Dr 4016 Sales Returns            = subtotal
     *   Dr 2020 Output Tax Payable       = tax
     *     Cr 1010 Cash                  = grand  [cash refund]
     *     Cr 1030 Accounts Receivable   = grand  [adjust against dues]
     *   Dr 1040 Inventory / Cr 5010 COGS = cogs
     */
    private function postJournal(CreditNote $cn, Store $store, User $user, Invoice $invoice, float $subtotal, float $tax, float $grand, float $cogs, string $refundMode): void
    {
        $sub = JournalEntryData::toPaise($subtotal);
        $taxP = JournalEntryData::toPaise($tax);
        $grandP = JournalEntryData::toPaise($grand);

        if ($sub + $taxP !== $grandP) {
            throw new AccountingException('Credit note totals do not balance.');
        }

        $creditAccount = $refundMode === 'cash' ? '1010' : '1030';
        $creditMemo = $refundMode === 'cash'
            ? 'Cash refund — ' . $cn->credit_note_number
            : 'Adjusted against dues — ' . $cn->credit_note_number;

        $this->accounting->post(new JournalEntryData(
            storeId: $store->id,
            entryNumber: 'JE-' . $cn->credit_note_number,
            entryDate: (string) $cn->credit_note_date,
            referenceType: CreditNote::class,
            referenceId: $cn->id,
            narration: 'Sales return ' . $cn->credit_note_number . ' against ' . $invoice->invoice_number . ' — ' . $cn->reason,
            createdBy: $user->id,
            lines: [
                ['account' => '4016', 'debit' => JournalEntryData::fromPaise($sub), 'memo' => 'Sales return — ' . $cn->credit_note_number],
                ['account' => '2020', 'debit' => JournalEntryData::fromPaise($taxP), 'memo' => 'Output tax reversed — ' . $cn->credit_note_number],
                ['account' => $creditAccount, 'credit' => JournalEntryData::fromPaise($grandP), 'memo' => $creditMemo],
            ],
        ));

        if ($cogs > 0) {
            $cogsP = JournalEntryData::toPaise($cogs);
            $this->accounting->post(new JournalEntryData(
                storeId: $store->id,
                entryNumber: 'JE-COGS-' . $cn->credit_note_number,
                entryDate: (string) $cn->credit_note_date,
                referenceType: CreditNote::class,
                referenceId: $cn->id,
                narration: 'COGS reversal — ' . $cn->credit_note_number,
                createdBy: $user->id,
                lines: [
                    ['account' => '1040', 'debit' => JournalEntryData::fromPaise($cogsP), 'memo' => 'Inventory restored — ' . $cn->credit_note_number],
                    ['account' => '5010', 'credit' => JournalEntryData::fromPaise($cogsP), 'memo' => 'COGS reversed — ' . $cn->credit_note_number],
                ],
            ));
        }
    }

    private function reserveCreditNoteNumber(int $storeId): string
    {
        DB::statement(
            'INSERT INTO credit_note_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        $next = (int) DB::table('credit_note_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number');

        return 'CN-' . $storeId . '-' . str_pad((string) ($next - 1), 6, '0', STR_PAD_LEFT);
    }

    private function lockSnapshots(int $storeId, array $variantIds): array
    {
        if ($variantIds === []) {
            return [];
        }
        $now = now();
        DB::table('stock_snapshots')->insertOrIgnore(array_map(fn (int $id) => [
            'store_id' => $storeId,
            'product_variant_id' => $id,
            'quantity_on_hand' => 0,
            'quantity_reserved' => 0,
            'created_at' => $now,
            'updated_at' => $now,
        ], $variantIds));

        return \App\Models\StockSnapshot::query()
            ->where('store_id', $storeId)
            ->whereIn('product_variant_id', $variantIds)
            ->orderBy('product_variant_id')
            ->lockForUpdate()
            ->get()
            ->keyBy('product_variant_id')
            ->all();
    }

    private function r2(float $v): float
    {
        return round($v + 1e-9, 2);
    }
}

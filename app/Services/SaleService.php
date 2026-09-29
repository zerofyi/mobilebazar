<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\AccountingException;
use App\Exceptions\MonthLockedException;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoiceItemBatchAllocation;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Accounting\SaleJournal;
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

    private function createSale(Store $store, User $user, array $data): Invoice
    {
        $invoiceDate = Carbon::parse($data['invoice_date']);

        // Fail fast (before consuming an invoice number / touching stock) on a locked month.
        if ($this->summaries->isMonthLocked($store->id, $invoiceDate->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $invoiceDate->format('Y-m'));
        }

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

        // 1. Invoice number (atomic per-store reservation)
        $invoiceNumber = $this->reserveInvoiceNumber($store->id);

        // 2. Lock every touched snapshot row up-front, ascending variant order.
        $snapshots = $this->lockSnapshots($store->id, $data['lines']);

        // 3. Lock serialized units & allocate bulk FIFO — builds the costings
        //    the fiscal evaluation needs (landed_cost + margin flag per row).
        $costings = $this->buildCostings($store, $data['lines'], $snapshots);

        // 4. Server-side fiscal evaluation (user's choices honored, money computed).
        $evaluated = $this->gst->evaluate($store, $data, $costings);
        $this->assertClientTotalsAgree($invoiceNumber, $data, $evaluated);

        $paid = $this->r2($data['paid_amount']);
        $due  = $this->r2($evaluated['grand_total'] - $paid);

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
            'payment_status'  => $data['payment_status'],
            'payment_mode'    => $data['payment_mode'],
            'invoice_type'    => $data['invoice_type'],
            'notes'           => $data['notes'] ?? null,
            'created_by'      => $user->id,
        ]);

        // 6. Persist rows + relieve stock.
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

        // 7. Journal + summaries LAST (summary row locks held for shortest time).
        $this->journal->post($invoice, $store, $user, [
            'subtotal'        => $evaluated['subtotal'],
            'tax_amount'      => $evaluated['tax_amount'],
            'discount_amount' => $evaluated['discount_amount'],
            'shipping_charge' => $evaluated['shipping_charge'],
            'round_off'       => $evaluated['round_off'],
            'grand_total'     => $evaluated['grand_total'],
            'paid_amount'     => $paid,
            'due_amount'      => $due,
        ], $evaluated['cogs_total'], (string) $data['payment_mode'], (bool) $data['is_intra_state']);

        $this->summaries->record(SummaryDeltaFactory::forSale($store->id, $data, $evaluated));

        return $invoice;
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
            $batches = StockBatch::query()
                ->where('store_id', $store->id)
                ->where('product_variant_id', $variantId)
                ->where('remaining_qty', '>', 0)
                ->orderBy('created_at')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

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
}

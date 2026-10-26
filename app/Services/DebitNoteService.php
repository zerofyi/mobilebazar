<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\JournalEntryData;
use App\Models\DebitNote;
use App\Models\DebitNoteItem;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\Summary\SummaryDeltaFactory;
use App\Services\SummaryService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

final class DebitNoteService
{
    private const TX_ATTEMPTS = 3; // retries the whole transaction on deadlock

    public function __construct(
        private readonly AccountingService $accounting,
        private readonly SummaryService $summaries,
    ) {}

    /*
    |--------------------------------------------------------------------------
    | Main entry point — one atomic transaction.
    |
    | Removes returned stock (serialized units are deleted outright; bulk
    | batches are decremented with a compensating ledger row), writes the
    | debit note + items, and posts the AP reversal journal:
    |
    |   Dr 2010 Accounts Payable   = grand_total (what the supplier owes back)
    |   Dr 5015 Purchase Discounts = the returned lines' bill-discount share [if > 0]
    |   Cr 1040 Inventory          = subtotal (base-cost portion)
    |   Cr 1050 Input Tax Credit   = tax_amount (ITC reversal) [if > 0]
    |
    | Return values come from the originating PO lines: base at carrying
    | cost, tax as the ITC actually claimed pro-rata, less the line's
    | pro-rata share of the bill-level discount — never more than the
    | supplier actually charged for the goods.
    |
    | Limitations (by design, see docblock on controller):
    | - Supplier vendors only. debit_notes.supplier_id is non-polymorphic, so a
    |   purchase billed by a Customer (unregistered vendor) is rejected with 422.
    |
    | @throws \App\Exceptions\AccountingException  unbalanced totals / missing accounts
    */

    /**
     * @param  array{
     *     purchase_order_id: int,
     *     debit_note_date: string,
     *     reason: string,
     *     notes?: ?string,
     *     units?: list<array{stock_unit_id: int}>,
     *     batches?: list<array{stock_batch_id: int, quantity: int}>,
     * }  $data
     */
    public function createDebitNote(Store $store, User $user, array $data): DebitNote
    {
        Log::info('Creating debit note', [
            'store_id'          => $store->id,
            'user_id'           => $user->id,
            'purchase_order_id' => $data['purchase_order_id'],
            'unit_count'        => count($data['units'] ?? []),
            'batch_line_count'  => count($data['batches'] ?? []),
        ]);

        return DB::transaction(
            fn () => $this->createInsideTransaction($store, $user, $data),
            self::TX_ATTEMPTS
        );
    }

    private function createInsideTransaction(Store $store, User $user, array $data): DebitNote
    {
        // 1. Purchase + vendor validation (locked first — the PO is the anchor
        //    every other check hangs off).
        $po = PurchaseOrder::where('id', (int) $data['purchase_order_id'])
            ->lockForUpdate()
            ->first();

        $fail = fn (string $field, string $msg) => throw ValidationException::withMessages([$field => $msg]);

        if (! $po || (int) $po->store_id !== (int) $store->id) {
            $fail('purchase_order_id', 'The selected purchase does not belong to this store.');
        }
        if ($po->status === 'draft') {
            $fail('purchase_order_id', 'Draft purchases have no stock to return.');
        }
        if ($po->vendor_type !== Supplier::class) {
            $fail('purchase_order_id', 'Purchase returns are currently supported only for Supplier vendors. This purchase was billed by an unregistered vendor (Customer), so a debit note cannot be issued against it.');
        }

        // 2. Validate + lock every touched unit / batch. Lock order: units by
        //    ascending id, then batches by ascending id — consistent, no deadlocks.
        $unitIds  = collect($data['units'] ?? [])->pluck('stock_unit_id')->map(fn ($v) => (int) $v)->unique()->sort()->values()->all();
        $batchReq = collect($data['batches'] ?? [])
            ->mapWithKeys(fn ($b) => [(int) $b['stock_batch_id'] => max(1, (int) $b['quantity'])])
            ->sortKeys()
            ->all();

        if ($unitIds === [] && $batchReq === []) {
            $fail('items', 'Select at least one unit or batch to return.');
        }

        $units = $unitIds === [] ? collect()
            : StockUnit::whereIn('id', $unitIds)->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        $batches = $batchReq === [] ? collect()
            : StockBatch::whereIn('id', array_keys($batchReq))->orderBy('id')->lockForUpdate()->get()->keyBy('id');

        // Return-value economics from the originating PO lines. A return is
        // worth what the supplier actually charged for those goods:
        //   base  = the stock's carrying cost (already net of line discounts)
        //   tax   = the ITC actually claimed for the line, pro-rata
        //           (item.tax_amount / qty) — not base × rate recomputed,
        //           which overstates tax on GST-inclusive lines
        //   minus this line's share of the bill-level discount, allocated
        //   pro-rata by line_total (the purchase credited it to 5015, so the
        //   return debits that slice back — see postJournal).
        $poItems      = $po->items()->get()->keyBy('id');
        $poLinesTotal = (float) $poItems->sum('line_total');
        $billDiscount = (float) $po->discount_amount;
        $economics = function (?int $itemId) use ($poItems, $poLinesTotal, $billDiscount): array {
            $item = $itemId ? $poItems->get($itemId) : null;
            if (! $item || (int) $item->ordered_qty <= 0 || (float) $item->line_total <= 0) {
                return ['tax_per_unit' => null, 'bill_share_per_unit' => 0.0];
            }
            $share = $poLinesTotal > 0 ? $billDiscount * ((float) $item->line_total / $poLinesTotal) : 0.0;

            return [
                'tax_per_unit'        => (float) $item->tax_amount / (int) $item->ordered_qty,
                'bill_share_per_unit' => $share / (int) $item->ordered_qty,
            ];
        };

        $returnLines = []; // normalized line rows, built once, used for items + totals

        foreach ($unitIds as $unitId) {
            $unit = $units->get($unitId);
            if (! $unit) {
                $fail('units', "Unit #{$unitId} does not exist.");
            }
            if ((int) $unit->store_id !== (int) $store->id || (int) $unit->purchase_order_id !== (int) $po->id) {
                $fail('units', "Unit #{$unitId} does not belong to purchase {$po->po_number}.");
            }
            if ($unit->status !== 'available') {
                $fail('units', "Unit #{$unitId}" . ($unit->imei1 ? " (IMEI {$unit->imei1})" : '') . " cannot be returned: its status is '{$unit->status}' (only 'available' stock can be returned).");
            }

            $eco       = $economics($unit->purchase_order_item_id);
            $taxPct    = $this->lineTaxPct($unit->purchase_order_item_id);
            $unitCost  = $this->r2($unit->base_cost);
            $taxAmount = $eco['tax_per_unit'] !== null
                ? $this->r2($eco['tax_per_unit'])
                : $this->r2($unitCost * $taxPct / 100);
            $billShare = $this->r2($eco['bill_share_per_unit']);

            $returnLines[] = [
                'kind'             => 'unit',
                'unit'             => $unit,
                'product_variant_id' => $unit->product_variant_id,
                'manual_item_name' => $unit->manual_item_name,
                'quantity'         => 1,
                'unit_cost'        => $unitCost,
                'landed_cost'      => $this->r2($unit->landed_cost),
                'tax_pct'          => $taxPct,
                'tax_amount'       => $taxAmount,
                'bill_share'       => $billShare,
                'line_total'       => $this->r2($unitCost + $taxAmount - $billShare),
            ];
        }

        foreach ($batchReq as $batchId => $qty) {
            $batch = $batches->get($batchId);
            if (! $batch) {
                $fail('batches', "Batch #{$batchId} does not exist.");
            }
            if ((int) $batch->store_id !== (int) $store->id || (int) $batch->purchase_order_id !== (int) $po->id) {
                $fail('batches', "Batch #{$batchId} does not belong to purchase {$po->po_number}.");
            }
            if ((int) $batch->remaining_qty < $qty) {
                $fail('batches', "Batch {$batch->batch_number}: only {$batch->remaining_qty} unit(s) in stock, cannot return {$qty}.");
            }

            $eco       = $economics($batch->purchase_order_item_id);
            $taxPct    = $this->lineTaxPct($batch->purchase_order_item_id);
            $unitCost  = $this->r2($batch->base_cost);
            $taxAmount = $eco['tax_per_unit'] !== null
                ? $this->r2($eco['tax_per_unit'] * $qty)
                : $this->r2($unitCost * $qty * $taxPct / 100);
            $billShare = $this->r2($eco['bill_share_per_unit'] * $qty);

            $returnLines[] = [
                'kind'             => 'batch',
                'batch'            => $batch,
                'qty'              => $qty,
                'product_variant_id' => $batch->product_variant_id,
                'manual_item_name' => $batch->manual_item_name,
                'quantity'         => $qty,
                'unit_cost'        => $unitCost,
                'landed_cost'      => $this->r2($batch->landed_cost),
                'tax_pct'          => $taxPct,
                'tax_amount'       => $taxAmount,
                'bill_share'       => $billShare,
                'line_total'       => $this->r2($unitCost * $qty + $taxAmount - $billShare),
            ];
        }

        // 3. Totals — derived entirely from the validated lines above.
        //    grand = Σ line_total = subtotal + tax − bill-discount share, so
        //    the journal (Dr 2010 grand + Dr 5015 share = Cr 1040 + Cr 1050)
        //    balances by construction.
        $subtotal       = $this->r2(collect($returnLines)->sum(fn ($l) => $l['unit_cost'] * $l['quantity']));
        $taxTotal       = $this->r2(collect($returnLines)->sum('tax_amount'));
        $billShareTotal = $this->r2(collect($returnLines)->sum('bill_share'));
        $grandTotal     = $this->r2(collect($returnLines)->sum('line_total'));

        if ($grandTotal <= 0) {
            $fail('items', 'The selected stock has no returnable value.');
        }

        // 4. Debit note number (atomic reservation).
        $dnNumber = $this->reserveDebitNoteNumber($store->id);

        $dn = DebitNote::create([
            'store_id'          => $store->id,
            'supplier_id'       => (int) $po->vendor_id,
            'purchase_order_id' => $po->id,
            'debit_note_number' => $dnNumber,
            'debit_note_date'   => $data['debit_note_date'],
            'subtotal'          => $subtotal,
            'tax_amount'        => $taxTotal,
            'grand_total'       => $grandTotal,
            'reason'            => $data['reason'],
            'status'            => 'issued',
            'notes'             => $data['notes'] ?? null,
            'created_by'        => $user->id,
        ]);

        foreach ($returnLines as $line) {
            DebitNoteItem::create([
                'debit_note_id'     => $dn->id,
                'product_variant_id' => $line['product_variant_id'],
                'manual_item_name'  => $line['manual_item_name'],
                'quantity'          => $line['quantity'],
                'unit_cost'         => $line['unit_cost'],
                'tax_pct'           => $line['tax_pct'],
                'tax_amount'        => $line['tax_amount'],
                'line_total'        => $line['line_total'],
            ]);
        }

        // 5. Stock removal — lock snapshots up-front (ascending variant id),
        //    then remove exactly what was validated.
        $variantIds = collect($returnLines)
            ->pluck('product_variant_id')->filter()
            ->map(fn ($v) => (int) $v)->unique()->sort()->values()->all();
        $snapshots = $this->lockSnapshots($store->id, $variantIds);

        $this->removeUnitStock($returnLines, $snapshots);
        $this->removeBatchStock($returnLines, $store, $user, $dn, $snapshots);

        // 6. Journal: Dr AP / Cr Inventory (base) / Cr ITC (tax reversal).
        $this->postJournal($dn, $store, $user, $po, $subtotal, $taxTotal, $grandTotal, $billShareTotal);

        $this->summaries->record(
            SummaryDeltaFactory::forDebitNote(
                $store->id, $dn->debit_note_date, $subtotal, $taxTotal, $grandTotal,
                array_sum(array_column($returnLines, 'quantity'))
            )
        );

        // 7. Settle the PO itself: the journal debits AP for the return value,
        //    so the PO's outstanding due must drop by the same amount (floor
        //    0) — otherwise Supplier Payments would let staff pay the
        //    returned goods' value to the supplier a second time. Paid stays
        //    as the historical money-out record; if the PO was already fully
        //    paid, the excess is a supplier receivable in the GL only.
        $newDue = max(0.0, round((float) $po->due_amount - $grandTotal, 2));
        $po->update([
            'due_amount'     => $newDue,
            'payment_status' => $newDue <= 0.0
                ? 'paid'
                : ((float) $po->paid_amount > 0 ? 'partial' : 'unpaid'),
        ]);

        return $dn->fresh();
    }

    /*
    |--------------------------------------------------------------------------
    | Stock removal (local implementations — PurchaseService is untouched)
    |--------------------------------------------------------------------------
    */

    /** Delete returned units (+ health/events), decrementing snapshots. */
    private function removeUnitStock(array $returnLines, array $snapshots): void
    {
        $byVariant = [];

        foreach ($returnLines as $line) {
            if ($line['kind'] !== 'unit') {
                continue;
            }

            /** @var StockUnit $unit */
            $unit = $line['unit'];
            $unit->deviceHealth?->delete();
            $unit->events()->delete();
            $variantId = $unit->product_variant_id;
            $unit->delete();

            if ($variantId) {
                $byVariant[(int) $variantId] = ($byVariant[(int) $variantId] ?? 0) + 1;
            }
        }

        foreach ($byVariant as $variantId => $count) {
            if (isset($snapshots[$variantId])) {
                $this->applyToSnapshot($snapshots[$variantId], -$count);
            }
        }
    }

    /** Decrement batch remaining_qty with a compensating ledger row per batch. */
    private function removeBatchStock(array $returnLines, Store $store, User $user, DebitNote $dn, array $snapshots): void
    {
        foreach ($returnLines as $line) {
            if ($line['kind'] !== 'batch') {
                continue;
            }

            /** @var StockBatch $batch */
            $batch = $line['batch'];
            $qty   = $line['qty'];

            $variantId = $batch->product_variant_id;
            $snapshot  = $variantId ? ($snapshots[(int) $variantId] ?? null) : null;

            $ledger = StockLedger::create([
                'idempotency_key'    => $dn->uuid . ':purchase_return:batch:' . $batch->id,
                'store_id'           => $store->id,
                'product_variant_id' => $variantId,
                'stock_batch_id'     => $batch->id,
                'transaction_type'   => 'purchase_return',
                'quantity_delta'     => -$qty,
                'balance_after'      => $snapshot ? (int) $snapshot->quantity_on_hand - $qty : (int) $batch->remaining_qty - $qty,
                'base_cost'          => $batch->base_cost,
                'landed_cost'        => $batch->landed_cost,
                'reference_type'     => DebitNote::class,
                'reference_id'       => $dn->id,
                'created_by'         => $user->id,
            ]);

            $batch->decrement('remaining_qty', $qty);

            if ($snapshot) {
                $this->applyToSnapshot($snapshot, -$qty, $ledger->id);
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Journal
    |--------------------------------------------------------------------------
    */

    private function postJournal(DebitNote $dn, Store $store, User $user, PurchaseOrder $po, float $subtotal, float $taxTotal, float $grandTotal, float $billShareTotal = 0.0): void
    {
        $lines = [
            ['account' => '2010', 'debit' => $grandTotal, 'memo' => 'Debit note ' . $dn->debit_note_number . ' — purchase return'],
        ];

        // The returned goods carried a slice of the bill-level discount the
        // purchase credited to 5015 — that slice was never owed to the
        // supplier, so it comes back as a debit here instead of inflating
        // the AP reversal.
        if ($billShareTotal > 0) {
            $lines[] = ['account' => '5015', 'debit' => $billShareTotal, 'memo' => 'Purchase discount reversed — ' . $dn->debit_note_number];
        }

        $lines[] = ['account' => '1040', 'credit' => $subtotal, 'memo' => 'Inventory returned to vendor'];

        if ($taxTotal > 0) {
            $lines[] = ['account' => '1050', 'credit' => $taxTotal, 'memo' => 'ITC reversal — purchase return'];
        }

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-' . $dn->debit_note_number,
            entryDate:     (string) $dn->debit_note_date,
            referenceType: DebitNote::class,
            referenceId:   (int) $dn->id,
            narration:     'Purchase return ' . $dn->debit_note_number . ' against ' . $po->po_number . ' — ' . $dn->reason,
            createdBy:     $user->id,
            lines:         $lines,
        ));
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    /** Tax % from the originating PO line (fallback 0 when untraceable). */
    private function lineTaxPct(?int $purchaseOrderItemId): float
    {
        if (! $purchaseOrderItemId) {
            return 0.0;
        }

        $pct = PurchaseOrderItem::where('id', $purchaseOrderItemId)->value('tax_pct');

        return $this->r2($pct ?? 0);
    }

    /**
     * Debit note number reservation (atomic; requires PK on store_id).
     * Same INSERT ... ON DUPLICATE KEY UPDATE pattern as purchase numbers —
     * the exclusive row lock is held until commit, so the read-back is exact.
     */
    private function reserveDebitNoteNumber(int $storeId): string
    {
        DB::statement(
            'INSERT INTO debit_note_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        $next = (int) DB::table('debit_note_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number');

        return 'DN-' . $storeId . '-' . str_pad((string) ($next - 1), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Ensure + lock snapshot rows for every involved variant, ascending id.
     * Requires UNIQUE(store_id, product_variant_id) on stock_snapshots.
     *
     * @return array<int, StockSnapshot> keyed by product_variant_id
     */
    private function lockSnapshots(int $storeId, array $variantIds): array
    {
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

    private function applyToSnapshot(StockSnapshot $snapshot, int $qty, ?int $ledgerId = null): void
    {
        $update = [
            'quantity_on_hand' => $snapshot->quantity_on_hand + $qty,
            'total_quantity'   => $snapshot->total_quantity + $qty,
        ];

        if ($ledgerId) {
            $update['last_ledger_id_applied'] = $ledgerId;
        }

        $snapshot->update($update);
    }

    private function r2(float|int|string|null $n): float
    {
        return round((float) $n + 1e-10, 2);
    }
}

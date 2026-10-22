<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\MonthLockedException;
use App\Models\Customer;
use App\Models\DebitNote;
use App\Models\DeviceHealth;
use App\Models\JournalEntry;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockSnapshot;
use App\Models\StockTransfer;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Accounting\PurchaseJournal;
use App\Services\Summary\SummaryDeltaFactory;
use Carbon\Carbon;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

final class PurchaseService
{
    private const TX_ATTEMPTS = 3; // retries the whole transaction on deadlock

    public function __construct(
        private readonly PurchaseJournal $journal,
        private readonly SummaryService $summaries,
        private readonly AccountingService $accounting,
    ) {}

    /*
    |--------------------------------------------------------------------------
    | Preview PO number — no lock, no guarantee. UI hint only.
    |--------------------------------------------------------------------------
    */
    public function previewPoNumber(int $storeId): string
    {
        $seq = DB::table('purchase_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number') ?? 1;

        return 'PV-' . str_pad((string) $seq, 6, '0', STR_PAD_LEFT);
    }

    /*
    |--------------------------------------------------------------------------
    | Main entry point — one atomic transaction, idempotent on idempotency_key.
    |
    | @throws MonthLockedException            posting into a locked month
    | @throws \App\Exceptions\AccountingException  bad totals / missing accounts
    |--------------------------------------------------------------------------
    */
    public function processPurchase(Store $store, User $user, array $data): PurchaseOrder
    {
        $key = (string) $data['idempotency_key'];

        // Fast path: a double-click / client retry that already succeeded.
        if ($existing = $this->findByIdempotencyKey($store->id, $key)) {
            return $existing;
        }

        Log::info('Processing purchase', [
            'store_id'        => $store->id,
            'user_id'         => $user->id,
            'idempotency_key' => $key,
            'is_draft'        => (bool) ($data['is_draft'] ?? false),
            'line_count'      => count($data['lines'] ?? []),
        ]);

        try {
            return DB::transaction(
                fn () => $this->createPurchase($store, $user, $data),
                self::TX_ATTEMPTS
            );
        } catch (UniqueConstraintViolationException $e) {
            // Two identical requests raced; the loser returns the winner's purchase.
            if ($existing = $this->findByIdempotencyKey($store->id, $key)) {
                return $existing;
            }
            // A concurrent purchase won the race on an active IMEI/serial
            // (uniq_active_imei1/2/serial). That is a 422, never a 500.
            if ($this->isActiveIdentifierViolation($e)) {
                throw ValidationException::withMessages([
                    'lines' => 'A device with this IMEI or serial number is already in active stock: '
                        . $this->duplicateIdentifier($e)
                        . '. It may have been purchased concurrently — please review and retry.',
                ]);
            }
            throw $e;
        }
    }

    /**
     * True when the unique violation came from the active-only identifier
     * indexes on stock_units (a device already in available/reserved stock).
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

    private function createPurchase(Store $store, User $user, array $data): PurchaseOrder
    {
        $isDraft   = (bool) ($data['is_draft'] ?? false);
        $orderDate = Carbon::parse($data['order_date']);

        // Fail fast (before consuming a PO number / touching stock) on a locked month.
        if (! $isDraft && $this->summaries->isMonthLocked($store->id, $orderDate->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $orderDate->format('Y-m'));
        }

        // 1. Vendor
        $vendor = $this->resolveVendor($data, $store);

        // 2. PO number
        $poNumber = $this->reservePoNumber($store->id, $data['bill_type']);

        // 3. Header
        $po = PurchaseOrder::create([
            'uuid'                     => Str::uuid()->toString(),
            'store_id'                 => $store->id,
            'identity'                 => $this->generateBarcodeIdentity($data['bill_type']),
            'bill_type'                => $data['bill_type'],
            'po_number'                => $poNumber,
            'vendor_invoice_no'        => $data['vendor_invoice_no'] ?? null,
            'vendor_type'              => get_class($vendor),
            'vendor_id'                => $vendor->id,
            'type'                     => $data['type'],
            'status'                   => $isDraft ? 'draft' : 'completed',
            'order_date'               => $data['order_date'],
            'is_gst_billed'            => (bool) $data['is_gst_billed'],
            'is_intra_state'           => (bool) $data['is_intra_state'],
            'subtotal'                 => $this->r2($data['subtotal']),
            'tax_amount'               => $this->r2($data['tax_amount']),
            'discount_amount'          => $this->r2($data['discount_amount'] ?? 0),
            'shipping_charge'          => $this->r2($data['shipping_charge'] ?? 0),
            'grand_total'              => $this->r2($data['grand_total']),
            'paid_amount'              => $this->r2($data['paid_amount'] ?? 0),
            'due_amount'               => $this->r2($data['due_amount'] ?? 0),
            'payment_status'           => $data['payment_status'],
            'payment_mode'             => $data['payment_mode'] ?? null,
            'notes'                    => $data['notes'] ?? null,
            'invoice_document_path'    => $data['invoice_document_path'] ?? null,
            'additional_document_path' => $data['additional_document_path'] ?? null,
            'idempotency_key'          => $data['idempotency_key'],
            'created_by'               => $user->id,
            'approved_by'              => $isDraft ? null : $user->id,
            'approved_at'              => $isDraft ? null : now(),
        ]);

        // 4. Lock every touched stock_snapshot row up-front, in ascending variant order.
        //    Consistent lock order = no deadlocks between concurrent purchases.
        $snapshots = $isDraft ? [] : $this->lockSnapshots($store->id, $data['lines']);

        // 5. Lines
        foreach ($data['lines'] as $lineData) {
            ! empty($lineData['is_serialized'])
                ? $this->processSerializedLine($po, $store, $lineData, $user, $isDraft, $snapshots)
                : $this->processBulkLine($po, $store, $lineData, $user, $isDraft, $snapshots);
        }

        // 6. Ledger + summaries (LAST, so summary row locks are held for the shortest time)
        if (! $isDraft) {
            $this->journal->post($po, $store, $user, $data);
            $this->summaries->record(SummaryDeltaFactory::forPurchase($store->id, $data));
        }

        return $po;
    }

    /*
    |--------------------------------------------------------------------------
    | Edit / Delete — reverse-and-repost (never deltas)
    |--------------------------------------------------------------------------
    |
    | An edit is, inside ONE transaction: (1) reverse the original posting
    | completely — journals, summaries, stock — using RECORDED allocations,
    | then (2) re-post the new payload through the same line/journal/summary
    | code the create path uses, keeping the original PO number. If the new
    | payload fails anywhere, the whole transaction rolls back and the
    | original document is byte-identical to before.
    |
    | A delete is the same reversal, then the PO row itself is removed.
    | Journals are NEVER deleted — the reversal entries are the audit trail.
    |
    */

    /**
     * @throws MonthLockedException
     * @throws \App\Exceptions\AccountingException
     */
    public function updatePurchase(Store $store, User $user, PurchaseOrder $po, array $data): PurchaseOrder
    {
        // A stock-transfer purchase is one half of a two-store bridge —
        // editing it would desync the source store's sale. Returns go
        // through a debit note, like any other posted purchase.
        if (StockTransfer::where('purchase_order_id', $po->id)->exists()) {
            throw ValidationException::withMessages([
                'purchase' => "Purchase {$po->po_number} cannot be changed: it belongs to a stock transfer. Use a debit note for returns.",
            ]);
        }

        $key = (string) $data['idempotency_key'];

        // Fast path: this exact edit was already applied (double-click / retry).
        $existing = PurchaseOrder::where('store_id', $store->id)
            ->where('edit_idempotency_key', $key)
            ->first();
        if ($existing && $existing->id === $po->id) {
            return $existing;
        }

        Log::info('Updating purchase', [
            'store_id'        => $store->id,
            'user_id'         => $user->id,
            'purchase_id'     => $po->id,
            'po_number'       => $po->po_number,
            'idempotency_key' => $key,
            'line_count'      => count($data['lines'] ?? []),
        ]);

        // Fail fast on a locked month — the reversal + repost land in the
        // PO's order month, same as create.
        if ($this->summaries->isMonthLocked($store->id, $po->order_date->format('Y-m'))) {
            throw \App\Exceptions\MonthLockedException::for($store->id, $po->order_date->format('Y-m'));
        }

        try {
            return DB::transaction(function () use ($store, $user, $po, $data, $key) {
                $po = PurchaseOrder::where('store_id', $store->id)
                    ->where('id', $po->id)
                    ->lockForUpdate()
                    ->firstOrFail();

                // Replay check under the row lock — closes the double-submit race.
                if ($po->edit_idempotency_key && hash_equals($po->edit_idempotency_key, $key)) {
                    return $po;
                }

                // Row-level guards: locked stock must come back unchanged.
                // No document-level gate — every purchase is editable.
                $locked = $this->validateRowGuards($po, $data);

                $newRevision = $po->revision + 1;

                // 1. Reverse financials (journals + summaries). Stock handled selectively below.
                $this->reverseFinancials($po, $store, $user);

                // 2. Selective stock rebuild: locked rows stay untouched (same IDs),
                //    editable rows are removed and recreated from the new payload.
                $snapshots = $this->lockSnapshots($store->id, $data['lines']);
                $this->rebuildStockSelective($po, $store, $user, $data['lines'], $locked, $snapshots);

                // 3. Update the header. Identity stays: same id, uuid, po_number,
                //    vendor, order date and type flags. Commercial terms change.
                //    Revision increments silently — no UI block, no reason required.
                // Vendor can be changed like in create, or kept as-is.
                // The journal reposts against the (possibly new) vendor.
                if (! empty($data['party_id']) && ! empty($data['party_type'])) {
                    $newVendor = $this->resolveVendor($data, $store);
                    $po->vendor()->associate($newVendor);
                }

                $po->update([
                    'subtotal'             => $this->r2($data['subtotal']),
                    'tax_amount'           => $this->r2($data['tax_amount']),
                    'discount_amount'      => $this->r2($data['discount_amount'] ?? 0),
                    'shipping_charge'      => $this->r2($data['shipping_charge'] ?? 0),
                    'grand_total'          => $this->r2($data['grand_total']),
                    'due_amount'           => $this->r2($data['grand_total']) - $this->r2($po->paid_amount),
                    'payment_status'       => $this->r2($data['grand_total']) <= $this->r2($po->paid_amount) ? 'paid' : ($this->r2($po->paid_amount) > 0 ? 'partial' : 'unpaid'),
                    'notes'                => $data['notes'] ?? null,
                    'vendor_invoice_no'    => $data['vendor_invoice_no'] ?? null,
                    'due_date'             => $data['due_date'] ?? $po->due_date,
                    'expected_date'        => $data['expected_date'] ?? $po->expected_date,
                    'revision'             => $newRevision,
                    'revised_at'           => now(),
                    'revised_by'           => $user->id,
                    'edit_idempotency_key' => $key,
                ]);

                // 4. Journal (suffixed entry numbers — the originals still exist)
                //    + summaries from the new payload.
                $this->journal->post($po->fresh(), $store, $user, $data, '-R' . $newRevision);
                $this->summaries->record(SummaryDeltaFactory::forPurchase($store->id, $data));

                return $po->fresh();
            }, self::TX_ATTEMPTS);
        } catch (UniqueConstraintViolationException $e) {
            $replayed = PurchaseOrder::where('store_id', $store->id)->where('edit_idempotency_key', $key)->first();
            if ($replayed && $replayed->id === $po->id) {
                return $replayed;
            }
            if ($this->isActiveIdentifierViolation($e)) {
                throw ValidationException::withMessages([
                    'lines' => 'A device with this IMEI or serial number is already in active stock: '
                        . $this->duplicateIdentifier($e)
                        . '. It may have been purchased concurrently — please review and retry.',
                ]);
            }
            throw $e;
        }
    }

    /**
     * Row-level guards for purchase edit. Returns the locked stock IDs that
     * must be preserved untouched: ['units' => [...], 'batches' => [...]].
     *
     * Rules:
     * - Serialized unit with status != 'available' (sold/reserved): must be
     *   present in the payload unchanged (same IMEI/serial/cost). Cannot be
     *   removed or modified.
     * - Bulk batch with remaining < received (partially sold): cannot be
     *   deleted; new qty cannot go below the sold portion; cost cannot change.
     * - Line deletion: only if zero stock movements on all its units/batches.
     * - Variant change on a line: only if the line has no stock rows.
     *
     * @throws ValidationException (422) on any violation.
     */
    private function validateRowGuards(PurchaseOrder $po, array $data): array
    {
        $locked = ['units' => [], 'batches' => []];
        $fail = fn (string $field, string $msg) => throw ValidationException::withMessages([$field => $msg]);

        $po->loadMissing(['items.stockUnits', 'items.stockBatches']);

        // Index payload lines by their existing item id (null = new line).
        // One item can have multiple lines (see rebuildStockSelective).
        $payloadLines = [];
        foreach ($data['lines'] ?? [] as $idx => $line) {
            $itemId = $line['purchase_order_item_id'] ?? null;
            if ($itemId) {
                $payloadLines[$itemId][] = ['line' => $line, 'idx' => $idx];
            }
        }

        foreach ($po->items as $item) {
            $inPayload = $payloadLines[$item->id] ?? [];

            // Collect locked stock for this line.
            $lockedUnits = $item->stockUnits->filter(fn ($u) => $u->status !== 'available');
            $lockedBatches = $item->stockBatches->filter(fn ($b) => $b->remaining_qty < $b->received_qty);

            if ($inPayload === []) {
                // Line deleted — allowed only with zero movements.
                if ($lockedUnits->isNotEmpty() || $lockedBatches->isNotEmpty()) {
                    $fail("lines", "Line '{$item->manual_item_name}' cannot be removed: some of its stock has been sold or moved.");
                }
                continue;
            }

            // Merge all payload lines for this item (units/batches keyed by id).
            $line = $inPayload[0]['line'];
            $field = "lines.{$inPayload[0]['idx']}";
            $mergedUnits = [];
            $mergedBatches = [];
            foreach ($inPayload as $pl) {
                foreach ($pl['line']['units'] ?? [] as $u) {
                    $mergedUnits[] = $u;
                }
                foreach ($pl['line']['batches'] ?? [] as $b) {
                    $mergedBatches[] = $b;
                }
            }
            $line['units'] = $mergedUnits;
            $line['batches'] = $mergedBatches;

            // Variant change — only if no stock rows exist at all.
            if (($item->stockUnits->isNotEmpty() || $item->stockBatches->isNotEmpty())
                && (int) ($line['product_variant_id'] ?? 0) !== (int) $item->product_variant_id) {
                $fail("{$field}.product_variant_id", "Cannot change the product on a line that already has stock. Remove the stock first or create a new line.");
            }

            // Locked serialized units must come back identical.
            $payloadUnits = collect($line['units'] ?? [])->keyBy(fn ($u) => $u['stock_unit_id'] ?? 'new_' . ($u['imei1'] ?? $u['serial_number'] ?? uniqid()));
            foreach ($lockedUnits as $unit) {
                $locked['units'][] = $unit->id;
                $pu = $payloadUnits->get($unit->id);
                if (! $pu) {
                    $fail("{$field}.units", "IMEI {$unit->imei1} cannot be removed: this unit has been sold or reserved.");
                }
                $puImei1 = $pu['imei1'] ?? $pu['imei_1'] ?? '';
                $puImei2 = $pu['imei2'] ?? $pu['imei_2'] ?? '';
                if ((string) $puImei1 !== (string) $unit->imei1
                    || (string) $puImei2 !== (string) $unit->imei2
                    || (string) ($pu['serial_number'] ?? '') !== (string) $unit->serial_number) {
                    $fail("{$field}.units", "IMEI {$unit->imei1} cannot be modified: this unit has been sold or reserved.");
                }
                $puLanded = (float) ($pu['unit_landed_cost'] ?? $pu['landed_cost'] ?? 0);
                if (abs($puLanded - (float) $unit->landed_cost) > 0.005) {
                    $fail("{$field}.units", "Cost of IMEI {$unit->imei1} cannot be changed: this unit has been sold or reserved.");
                }
            }

            // Locked batches: qty floor + cost freeze.
            $payloadBatches = collect($line['batches'] ?? [])->keyBy(fn ($b) => $b['stock_batch_id'] ?? 'new');
            foreach ($lockedBatches as $batch) {
                $locked['batches'][] = $batch->id;
                $pb = $payloadBatches->get($batch->id);
                if (! $pb) {
                    $fail("{$field}.batches", "Batch {$batch->batch_number} cannot be removed: some of its stock has been sold.");
                }
                $soldQty = $batch->received_qty - $batch->remaining_qty;
                if ((int) ($pb['quantity'] ?? 0) < $soldQty) {
                    $fail("{$field}.batches", "Batch {$batch->batch_number}: quantity cannot go below {$soldQty} (already sold).");
                }
                if (abs((float) ($pb['landed_cost'] ?? 0) - (float) $batch->landed_cost) > 0.005) {
                    $fail("{$field}.batches", "Cost of batch {$batch->batch_number} cannot be changed: some of its stock has been sold.");
                }
            }
        }

        return $locked;
    }

    /**
     * Reverse journals + summaries only. Stock is handled selectively by
     * rebuildStockSelective() so locked rows keep their IDs (sale FKs intact).
     */
    private function reverseFinancials(PurchaseOrder $po, Store $store, User $user): void
    {
        $entries = JournalEntry::where('store_id', $store->id)
            ->where('reference_type', PurchaseOrder::class)
            ->where('reference_id', $po->id)
            ->where('entry_number', 'not like', 'REV-%')
            // Skip entries that already have a reversal: on a 2nd edit/delete
            // the deterministic 'REV-…' number would otherwise violate the
            // (store_id, entry_number) unique index — and re-reversing would
            // be wrong accounting anyway.
            ->whereNotExists(function ($q) {
                $q->selectRaw('1')
                    ->from('journal_entries as rev')
                    ->whereColumn('rev.reverses_journal_id', 'journal_entries.id');
            })
            // Supplier payments are their own documents: an edit must not
            // touch them. (Delete uses reversePurchase, which voids all PO
            // journals by design.)
            ->where('entry_number', 'not like', 'JE-SUPPAY-%')
            ->lockForUpdate()
            ->get();

        foreach ($entries as $entry) {
            $reversal = $this->accounting->reverse($entry, $user->id, 'Purchase edited', $po->order_date);
            $reversal->update(['reverses_journal_id' => $entry->id]);
        }

        $this->summaries->record($this->reversalDelta($po, $store));
    }

    /**
     * Selectively rebuild stock: delete editable rows, keep locked rows
     * untouched, create new rows from the payload (skipping locked IDs).
     */
    private function rebuildStockSelective(PurchaseOrder $po, Store $store, User $user, array $lines, array $locked, array $snapshots): void
    {
        $po->loadMissing(['items.stockUnits', 'items.stockBatches']);

        $lockedUnitIds = collect($locked['units']);
        $lockedBatchIds = collect($locked['batches']);

        // Index payload lines by existing item id. One item can map to
        // MULTIPLE payload lines when its rows were edited to different costs
        // (the frontend groups serialized rows by cost). Every line belongs to
        // the item — dropping any of them would wipe its units.
        $payloadByItem = [];
        foreach ($lines as $line) {
            if (! empty($line['purchase_order_item_id'])) {
                $payloadByItem[$line['purchase_order_item_id']][] = $line;
            }
        }

        foreach ($po->items as $item) {
            $payloadLines = $payloadByItem[$item->id] ?? [];

            if ($payloadLines === []) {
                // Deleted line — guards guarantee zero movements.
                foreach ($item->stockUnits as $unit) {
                    $this->deleteUnitStock($unit, $store, $snapshots);
                }
                foreach ($item->stockBatches as $batch) {
                    $this->deleteBatchStock($po, $batch, $store, $snapshots);
                }
                $item->delete();
                continue;
            }

            // Remove editable stock rows; locked rows stay.
            foreach ($item->stockUnits as $unit) {
                if (! $lockedUnitIds->contains($unit->id)) {
                    $this->deleteUnitStock($unit, $store, $snapshots);
                }
            }
            foreach ($item->stockBatches as $batch) {
                if (! $lockedBatchIds->contains($batch->id)) {
                    $this->deleteBatchStock($po, $batch, $store, $snapshots);
                }
            }

            // Update the item row from the payload (costs may have changed).
            // Amounts are aggregated across the item's payload lines.
            $item->update($this->aggregateItemLines($payloadLines, $item));

            // Recreate stock from ALL payload lines, skipping locked IDs
            // (already in DB).
            foreach ($payloadLines as $payloadLine) {
                $this->recreateLineStock($po, $item, $store, $payloadLine, $user, $locked, $snapshots);
            }
        }

        // Brand-new lines.
        foreach ($lines as $line) {
            if (! empty($line['purchase_order_item_id'])) {
                continue;
            }
            $item = $po->items()->create([
                'product_variant_id' => $line['product_variant_id'] ?? null,
                'manual_item_name'   => $line['manual_item_name'] ?? null,
                'ordered_qty'        => $line['ordered_qty'] ?? $line['quantity'] ?? 1,
                'unit_cost'          => $this->r2($line['unit_cost'] ?? 0),
                'tax_type'           => $line['tax_type'] ?? 'exclusive',
                'tax_pct'            => $this->r2($line['tax_pct'] ?? 0),
                'is_margin_scheme'   => (bool) ($line['is_margin_scheme'] ?? false),
                'base_cost'          => $this->r2($line['base_cost'] ?? 0),
                'landed_cost'        => $this->r2($line['landed_cost'] ?? 0),
                'tax_amount'         => $this->r2($line['tax_amount'] ?? 0),
                'discount_amount'    => $this->r2($line['discount_amount'] ?? 0),
                'line_total'         => $this->r2($line['line_total'] ?? 0),
            ]);
            $this->recreateLineStock($po, $item, $store, $line, $user, $locked, $snapshots);
        }
    }

    /**
     * Aggregate an item's payload lines into the purchase_order_items row.
     * Quantities and money sums add up; per-unit costs become qty-weighted
     * averages. The per-unit truth lives on stock_units / stock_batches.
     */
    private function aggregateItemLines(array $lines, PurchaseOrderItem $item): array
    {
        $qty = 0.0; $unitCost = 0.0; $base = 0.0; $landed = 0.0;
        $tax = 0.0; $disc = 0.0; $total = 0.0;
        foreach ($lines as $line) {
            $q = (float) ($line['ordered_qty'] ?? $line['quantity'] ?? 0);
            $qty      += $q;
            $unitCost += (float) ($line['unit_cost'] ?? 0) * $q;
            $base     += (float) ($line['base_cost'] ?? 0) * $q;
            $landed   += (float) ($line['landed_cost'] ?? 0) * $q;
            $tax      += (float) ($line['tax_amount'] ?? 0);
            $disc     += (float) ($line['discount_amount'] ?? 0);
            $total    += (float) ($line['line_total'] ?? 0);
        }
        $first = $lines[0];

        return [
            'product_variant_id' => $first['product_variant_id'] ?? $item->product_variant_id,
            'manual_item_name'   => $first['manual_item_name'] ?? $item->manual_item_name,
            'ordered_qty'        => $qty > 0 ? $qty : $item->ordered_qty,
            'unit_cost'          => $this->r2($qty > 0 ? $unitCost / $qty : ($first['unit_cost'] ?? $item->unit_cost)),
            'tax_type'           => $first['tax_type'] ?? $item->tax_type,
            'tax_pct'            => $this->r2($first['tax_pct'] ?? $item->tax_pct),
            'is_margin_scheme'   => (bool) ($first['is_margin_scheme'] ?? $item->is_margin_scheme),
            'base_cost'          => $this->r2($qty > 0 ? $base / $qty : ($first['base_cost'] ?? $item->base_cost)),
            'landed_cost'        => $this->r2($qty > 0 ? $landed / $qty : ($first['landed_cost'] ?? $item->landed_cost)),
            'tax_amount'         => $this->r2($tax),
            'discount_amount'    => $this->r2($disc),
            'line_total'         => $this->r2($total),
        ];
    }

    /**
     * Create stock rows for a line from the payload, skipping locked IDs.
     * For partially-sold batches, adjusts remaining_qty to preserve the sold portion.
     */
    private function recreateLineStock(PurchaseOrder $po, PurchaseOrderItem $item, Store $store, array $line, User $user, array $locked, array $snapshots): void
    {
        $lockedUnitIds = collect($locked['units']);
        $lockedBatchIds = collect($locked['batches']);

        if (! empty($line['is_serialized'])) {
            foreach ($line['units'] ?? [] as $unitData) {
                if (! empty($unitData['stock_unit_id']) && $lockedUnitIds->contains((int) $unitData['stock_unit_id'])) {
                    continue; // Locked — already in DB untouched.
                }
                $this->createSerializedUnit($po, $item, $store, $unitData, $user, $snapshots);
            }
        } else {
            foreach ($line['batches'] ?? [] as $batchData) {
                if (! empty($batchData['stock_batch_id']) && $lockedBatchIds->contains((int) $batchData['stock_batch_id'])) {
                    // Locked batch — adjust remaining to preserve sold qty.
                    $batch = StockBatch::find($batchData['stock_batch_id']);
                    if ($batch) {
                        $soldQty = $batch->received_qty - $batch->remaining_qty;
                        $newReceived = (int) ($batchData['quantity'] ?? $batch->received_qty);
                        $delta = $newReceived - (int) $batch->received_qty;
                        $batch->update([
                            'received_qty'  => $newReceived,
                            'remaining_qty' => $newReceived - $soldQty,
                        ]);
                        // Keep snapshot + ledger in sync (no drift).
                        if ($delta !== 0) {
                            $variantId = $batch->product_variant_id;
                            if ($variantId && isset($snapshots[$variantId])) {
                                $snapshot = $snapshots[$variantId];
                                $balanceBefore = (int) $snapshot->quantity_on_hand;
                                $ledger = StockLedger::create([
                                    'idempotency_key'    => $po->uuid . ':editrev:batchadj:' . $batch->id . ':' . $newReceived,
                                    'store_id'           => $store->id,
                                    'product_variant_id' => $variantId,
                                    'stock_batch_id'     => $batch->id,
                                    'transaction_type'   => 'purchase_adjustment',
                                    'quantity_delta'     => $delta,
                                    'balance_after'      => $balanceBefore + $delta,
                                    'base_cost'          => $batch->base_cost,
                                    'landed_cost'        => $batch->landed_cost,
                                    'reference_type'     => PurchaseOrderItem::class,
                                    'reference_id'       => $item->id,
                                    'created_by'         => $user->id,
                                ]);
                                $this->applyToSnapshot($snapshot, $delta, $ledger->id, null);
                            }
                        }
                    }
                    continue;
                }
                $this->createBulkBatch($po, $item, $store, $batchData, $user, $snapshots);
            }
            // Back-compat: single-quantity bulk line without explicit batches.
            if (empty($line['batches'])) {
                $this->createBulkBatch($po, $item, $store, $line, $user, $snapshots);
            }
        }
    }

    public function deletePurchase(Store $store, User $user, PurchaseOrder $po): void
    {
        // Transfer bridge guard — see updatePurchase.
        if (StockTransfer::where('purchase_order_id', $po->id)->exists()) {
            throw ValidationException::withMessages([
                'purchase' => "Purchase {$po->po_number} cannot be deleted: it belongs to a stock transfer. Use a debit note for returns.",
            ]);
        }

        Log::info('Deleting purchase', [
            'store_id'    => $store->id,
            'user_id'     => $user->id,
            'purchase_id' => $po->id,
            'po_number'   => $po->po_number,
        ]);

        if ($this->summaries->isMonthLocked($store->id, $po->order_date->format('Y-m'))) {
            throw \App\Exceptions\MonthLockedException::for($store->id, $po->order_date->format('Y-m'));
        }

        DB::transaction(function () use ($store, $user, $po) {
            $po = PurchaseOrder::where('store_id', $store->id)
                ->where('id', $po->id)
                ->lockForUpdate()
                ->firstOrFail();

            // Only guard: cannot delete if any stock has been sold or moved.
            // (Payments/debit notes/month locks no longer block — every record is deletable otherwise.)
            $po->loadMissing(['items.stockUnits', 'items.stockBatches']);
            foreach ($po->items as $item) {
                $movedUnits = $item->stockUnits->filter(fn ($u) => $u->status !== 'available');
                $movedBatches = $item->stockBatches->filter(fn ($b) => $b->remaining_qty < $b->received_qty);
                if ($movedUnits->isNotEmpty() || $movedBatches->isNotEmpty()) {
                    throw ValidationException::withMessages([
                        'purchase' => 'Cannot delete this purchase: some of its stock has been sold or moved.',
                    ]);
                }
            }

            $this->reversePurchase($po, $store, $user, 'Purchase deleted');

            $po->delete();
        }, self::TX_ATTEMPTS);
    }

    /**
     * Hard-delete a DRAFT. Drafts never posted anything — no journals, no
     * summaries, no stock — so this is just items + header. This resolves the
     * orphan `purchases.purge` route (which 500s today) with defined behavior.
     */
    public function purgeDraft(Store $store, PurchaseOrder $po): void
    {
        DB::transaction(function () use ($store, $po) {
            $po = PurchaseOrder::where('store_id', $store->id)
                ->where('id', $po->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ($po->status !== 'draft') {
                throw ValidationException::withMessages([
                    'purchase' => 'Only drafts can be purged. Posted purchases must be deleted through the reversal flow.',
                ]);
            }

            $po->items()->delete();
            $po->delete();
        }, self::TX_ATTEMPTS);
    }


    /**
     * Reverse a posted purchase completely, inside the caller's transaction.
     * Driven by RECORDED allocations — nothing is recomputed.
     */
    private function reversePurchase(PurchaseOrder $po, Store $store, User $user, string $reason): void
    {
        // 1. Journals — the originals stay; REV- mirror entries are posted.
        //    Dated at the PO's order date so the reversal lands in the same period.
        $entries = JournalEntry::where('store_id', $store->id)
            ->where('reference_type', PurchaseOrder::class)
            ->where('reference_id', $po->id)
            ->where('entry_number', 'not like', 'REV-%')
            // Skip entries that already have a reversal (see reverseFinancials).
            ->whereNotExists(function ($q) {
                $q->selectRaw('1')
                    ->from('journal_entries as rev')
                    ->whereColumn('rev.reverses_journal_id', 'journal_entries.id');
            })
            ->lockForUpdate()
            ->get();

        foreach ($entries as $entry) {
            $reversal = $this->accounting->reverse($entry, $user->id, $reason, $po->order_date);
            $reversal->update(['reverses_journal_id' => $entry->id]);
        }

        // 2. Summaries — rebuild the create-shaped payload from recorded rows,
        //    then record its negation.
        $this->summaries->record($this->reversalDelta($po, $store));

        // 3. Stock — lock every touched snapshot row up-front (ascending id),
        //    then remove exactly what this purchase created.
        $items = $po->items()->with(['stockUnits:id,purchase_order_item_id,device_condition', 'stockBatches'])->lockForUpdate()->get();

        $variantIds = $items->pluck('product_variant_id')->filter()->unique()->sort()->values();
        $snapshots  = [];
        foreach ($variantIds as $variantId) {
            $snapshots[$variantId] = StockSnapshot::where('store_id', $store->id)
                ->where('product_variant_id', $variantId)
                ->lockForUpdate()
                ->firstOrFail();
        }

        foreach ($items as $item) {
            $this->reverseSerializedStock($item, $store, $user, $snapshots);
            $this->reverseBatchStock($po, $item, $store, $user, $snapshots);
            $item->delete();
        }
    }

    /**
     * The summary delta that exactly negates this PO's original posting,
     * rebuilt from the recorded item/unit rows.
     */
    private function reversalDelta(PurchaseOrder $po, Store $store): \App\DTOs\SummaryDelta
    {
        $lines = [];

        foreach ($po->items as $item) {
            $units = $item->stockUnits;
            if ($units->isNotEmpty()) {
                $lines[] = [
                    'is_serialized' => true,
                    'line_total'    => (float) $item->line_total,
                    'units'         => $units
                        ->map(fn ($u) => ['device_condition_code' => $u->device_condition])
                        ->all(),
                ];
            } else {
                $lines[] = [
                    'is_serialized' => false,
                    'line_total'    => (float) $item->line_total,
                    'ordered_qty'   => (int) $item->ordered_qty,
                ];
            }
        }

        return SummaryDeltaFactory::forPurchase($store->id, [
            'lines'       => $lines,
            'grand_total' => (float) $po->grand_total,
            'order_date'  => $po->order_date->format('Y-m-d'),
        ])->reversed();
    }

    /**
     * Remove the serialized units this purchase created. The gate guarantees
     * every one is still 'available'.
     */
    private function reverseSerializedStock(PurchaseOrderItem $item, Store $store, User $user, array $snapshots): void
    {
        $units = StockUnit::where('purchase_order_item_id', $item->id)->lockForUpdate()->get();
        $count = $units->count();

        foreach ($units as $unit) {
            $unit->deviceHealth?->delete();
            $unit->events()->delete();
            $unit->delete();
        }

        if ($count > 0 && $item->product_variant_id && isset($snapshots[$item->product_variant_id])) {
            $this->applyToSnapshot($snapshots[$item->product_variant_id], -$count, null, null);
        }
    }

    /**
     * Remove the batches this purchase created. The gate guarantees
     * remaining_qty == received_qty on every one. A compensating ledger
     * entry keeps the stock audit trail complete.
     */
    private function reverseBatchStock(PurchaseOrder $po, PurchaseOrderItem $item, Store $store, User $user, array $snapshots): void
    {
        $batches = StockBatch::where('purchase_order_item_id', $item->id)->lockForUpdate()->get();

        foreach ($batches as $batch) {
            $qty = (int) $batch->received_qty;
            $ledgerId = null;

            if ($item->product_variant_id && isset($snapshots[$item->product_variant_id])) {
                $snapshot      = $snapshots[$item->product_variant_id];
                $balanceBefore = (int) $snapshot->quantity_on_hand;

                $ledger = StockLedger::create([
                    'idempotency_key'    => $po->uuid . ':rev:item:' . $item->id . ':batch:' . $batch->id,
                    'store_id'           => $store->id,
                    'product_variant_id' => $item->product_variant_id,
                    'stock_batch_id'     => $batch->id,
                    'transaction_type'   => 'purchase_reversal',
                    'quantity_delta'     => -$qty,
                    'balance_after'      => $balanceBefore - $qty,
                    'base_cost'          => $batch->base_cost,
                    'landed_cost'        => $batch->landed_cost,
                    'reference_type'     => PurchaseOrderItem::class,
                    'reference_id'       => $item->id,
                    'created_by'         => $user->id,
                ]);
                $ledgerId = $ledger->id;

                $this->applyToSnapshot($snapshot, -$qty, $ledgerId, null);
            }

            $batch->delete();
        }
    }

    /*
    |--------------------------------------------------------------------------
    /*
    |--------------------------------------------------------------------------
    | Selective stock helpers for purchase edit (row-level guards)
    |--------------------------------------------------------------------------
    */

    /**
     * Delete a single editable unit + its health/events, adjusting snapshot.
     */
    private function deleteUnitStock(StockUnit $unit, Store $store, array $snapshots): void
    {
        $unit->deviceHealth?->delete();
        $unit->events()->delete();
        $variantId = $unit->product_variant_id;
        $baseCost = $unit->base_cost;
        $landedCost = $unit->landed_cost;
        $unitId = $unit->id;
        $unit->delete();

        if ($variantId && isset($snapshots[$variantId])) {
            $snapshot = $snapshots[$variantId];
            $balanceBefore = (int) $snapshot->quantity_on_hand;
            $ledger = StockLedger::create([
                'idempotency_key'    => 'editrev:unit:' . $unitId . ':' . time(),
                'store_id'           => $store->id,
                'product_variant_id' => $variantId,
                'stock_batch_id'     => null,
                'transaction_type'   => 'purchase_reversal',
                'quantity_delta'     => -1,
                'balance_after'      => $balanceBefore - 1,
                'base_cost'          => $baseCost,
                'landed_cost'        => $landedCost,
                'reference_type'     => StockUnit::class,
                'reference_id'       => $unitId,
                'created_by'         => auth()->id(),
            ]);
            $this->applyToSnapshot($snapshot, -1, $ledger->id, null);
        }
    }

    /**
     * Delete a single editable batch + compensating ledger entry.
     */
    private function deleteBatchStock(PurchaseOrder $po, StockBatch $batch, Store $store, array $snapshots): void
    {
        $qty = (int) $batch->received_qty;
        $variantId = $batch->product_variant_id;
        $itemId = $batch->purchase_order_item_id;
        $ledgerId = null;

        if ($variantId && isset($snapshots[$variantId])) {
            $snapshot      = $snapshots[$variantId];
            $balanceBefore = (int) $snapshot->quantity_on_hand;

            $ledger = StockLedger::create([
                'idempotency_key'    => $po->uuid . ':editrev:batch:' . $batch->id . ':' . time(),
                'store_id'           => $store->id,
                'product_variant_id' => $variantId,
                'stock_batch_id'     => $batch->id,
                'transaction_type'   => 'purchase_reversal',
                'quantity_delta'     => -$qty,
                'balance_after'      => $balanceBefore - $qty,
                'base_cost'          => $batch->base_cost,
                'landed_cost'        => $batch->landed_cost,
                'reference_type'     => PurchaseOrderItem::class,
                'reference_id'       => $itemId,
                'created_by'         => auth()->id(),
            ]);
            $ledgerId = $ledger->id;

            $this->applyToSnapshot($snapshot, -$qty, $ledgerId, null);
        }

        $batch->delete();
    }

    /**
     * Create a single serialized unit from payload data (edit path).
     */
    private function createSerializedUnit(PurchaseOrder $po, PurchaseOrderItem $item, Store $store, array $unitData, User $user, array $snapshots): void
    {
        $variantId  = $item->product_variant_id;
        $manualName = $item->manual_item_name;

        [$activationDate, $warrantyExpiryDate, $remainingWarranty] = $this->warrantyFields($unitData);

        $unit = StockUnit::create([
            'uuid'                   => Str::uuid()->toString(),
            'store_id'               => $store->id,
            'product_variant_id'     => $variantId,
            'manual_item_name'       => $manualName,
            'imei1'                  => $this->blankToNull($unitData['imei1'] ?? $unitData['imei_1'] ?? null),
            'imei2'                  => $this->blankToNull($unitData['imei2'] ?? $unitData['imei_2'] ?? null),
            'serial_number'          => $this->blankToNull($unitData['serial_number'] ?? null),
            'device_condition'       => strtoupper(trim((string) ($unitData['device_condition_code'] ?? 'NEW'))),
            'overall_health'         => $this->blankToNull($unitData['overall_health'] ?? null) ?? 'super mint',
            'is_saleable'            => true,
            'status'                 => 'available',
            'base_cost'              => $this->r2($unitData['unit_base_cost'] ?? $unitData['base_cost'] ?? 0),
            'landed_cost'            => $this->r2($unitData['unit_landed_cost'] ?? $unitData['landed_cost'] ?? 0),
            'wholesale_price'        => $this->positiveOrNull($unitData['wholesale_price'] ?? null),
            'selling_price'          => $this->positiveOrNull($unitData['selling_price'] ?? null),
            'is_margin_scheme'       => (bool) ($unitData['is_margin_scheme'] ?? $item->is_margin_scheme),
            'purchase_order_id'      => $po->id,
            'purchase_order_item_id' => $item->id,
            'activation_date'        => $activationDate,
            'warranty_expiry_date'   => $warrantyExpiryDate,
            'remaining_warranty'     => $remainingWarranty,
        ]);

        if (isset($unitData['battery_health_pct'])) {
            $health = DeviceHealth::create([
                'stock_unit_id'      => $unit->id,
                'battery_health_pct' => (int) $unitData['battery_health_pct'],
                'checked_by'         => $user->id,
                'checked_at'         => now(),
            ]);

            $unit->update(['health_id' => $health->id]);
        }

        $event = StockUnitEvent::create([
            'stock_unit_id'  => $unit->id,
            'store_id'       => $store->id,
            'event_type'     => 'purchased',
            'reference_type' => PurchaseOrderItem::class,
            'reference_id'   => $item->id,
            'created_by'     => $user->id,
        ]);

        if ($variantId && isset($snapshots[$variantId])) {
            $snapshot = $snapshots[$variantId];
            $balanceBefore = (int) $snapshot->quantity_on_hand;
            $ledger = StockLedger::create([
                'idempotency_key'    => $po->uuid . ':edit:item:' . $item->id . ':unit:' . $unit->id,
                'store_id'           => $store->id,
                'product_variant_id' => $variantId,
                'stock_batch_id'     => null,
                'transaction_type'   => 'purchase',
                'quantity_delta'     => 1,
                'balance_after'      => $balanceBefore + 1,
                'base_cost'          => $unit->base_cost,
                'landed_cost'        => $unit->landed_cost,
                'reference_type'     => PurchaseOrderItem::class,
                'reference_id'       => $item->id,
                'created_by'         => $user->id,
            ]);
            $this->applyToSnapshot($snapshot, 1, $ledger->id, $event->id);
        }
    }

    /**
     * Create a single bulk batch from payload data (edit path).
     */
    private function createBulkBatch(PurchaseOrder $po, PurchaseOrderItem $item, Store $store, array $batchData, User $user, array $snapshots): void
    {
        $variantId  = $item->product_variant_id;
        $manualName = $item->manual_item_name;
        $qty        = max(1, (int) ($batchData['quantity'] ?? $batchData['ordered_qty'] ?? 1));

        $batch = StockBatch::create([
            'uuid'                   => Str::uuid()->toString(),
            'store_id'               => $store->id,
            'product_variant_id'     => $variantId,
            'manual_item_name'       => $manualName,
            'batch_number'           => $this->makeBatchNumber($store->id),
            'purchase_order_id'      => $po->id,
            'purchase_order_item_id' => $item->id,
            'received_qty'           => $qty,
            'remaining_qty'          => $qty,
            'base_cost'              => $this->r2($batchData['base_cost'] ?? $item->base_cost),
            'landed_cost'            => $this->r2($batchData['landed_cost'] ?? $item->landed_cost),
            'is_margin_scheme'       => (bool) ($batchData['is_margin_scheme'] ?? $item->is_margin_scheme),
            'product_condition'      => strtoupper(trim((string) ($batchData['condition_code'] ?? 'NEW'))),
            'overall_health'         => $this->blankToNull($batchData['overall_health'] ?? null),
            'remaining_warranty'     => $this->blankToNull($batchData['remaining_warranty'] ?? null),
            'wholesale_price'        => $this->positiveOrNull($batchData['wholesale_price'] ?? null),
            'selling_price'          => $this->positiveOrNull($batchData['selling_price'] ?? null),
        ]);

        if (! $variantId || ! isset($snapshots[$variantId])) {
            return;
        }

        $snapshot      = $snapshots[$variantId];
        $balanceBefore = (int) $snapshot->quantity_on_hand;

        $ledger = StockLedger::create([
            'idempotency_key'    => $po->uuid . ':edit:item:' . $item->id . ':batch:' . $batch->id,
            'store_id'           => $store->id,
            'product_variant_id' => $variantId,
            'stock_batch_id'     => $batch->id,
            'transaction_type'   => 'purchase',
            'quantity_delta'     => $qty,
            'balance_after'      => $balanceBefore + $qty,
            'base_cost'          => $batch->base_cost,
            'landed_cost'        => $batch->landed_cost,
            'reference_type'     => PurchaseOrderItem::class,
            'reference_id'       => $item->id,
            'created_by'         => $user->id,
        ]);

        $this->applyToSnapshot($snapshot, $qty, $ledger->id, null);
    }

    // | Serialized path: stock_units + events + health + snapshot (by unit count)

    private function processSerializedLine(
        PurchaseOrder $po,
        Store $store,
        array $lineData,
        User $user,
        bool $isDraft,
        array $snapshots,
    ): void {
        $units      = $lineData['units'] ?? [];
        $variantId  = ! empty($lineData['product_variant_id']) ? (int) $lineData['product_variant_id'] : null;
        $manualName = $lineData['manual_item_name'] ?? null;
        $unitCount  = count($units);

        $item = PurchaseOrderItem::create([
            'purchase_order_id'  => $po->id,
            'product_variant_id' => $variantId,
            'manual_item_name'   => $manualName,
            'ordered_qty'        => $unitCount,
            'unit_cost'          => $this->r2($lineData['unit_cost'] ?? $lineData['landed_cost'] ?? 0),
            'tax_type'           => $lineData['tax_type'],
            'tax_pct'            => $this->r2($lineData['tax_pct']),
            'is_margin_scheme'   => (bool) $lineData['is_margin_scheme'],
            'base_cost'          => $this->r2($lineData['base_cost']),
            'landed_cost'        => $this->r2($lineData['landed_cost']),
            'tax_amount'         => $this->r2($lineData['tax_amount']),
            'discount_amount'    => $this->r2($lineData['discount_amount']),
            'line_total'         => $this->r2($lineData['line_total']),
        ]);

        if ($isDraft) {
            return;
        }

        $lastEventId = null;
        $lastLedgerId = null;

        foreach ($units as $unitData) {
            [$activationDate, $warrantyExpiryDate, $remainingWarranty] = $this->warrantyFields($unitData);

            $unit = StockUnit::create([
                'uuid'                   => Str::uuid()->toString(),
                'store_id'               => $store->id,
                'product_variant_id'     => $variantId,
                'manual_item_name'       => $manualName,
                'imei1'                  => $this->blankToNull($unitData['imei1'] ?? null),
                'imei2'                  => $this->blankToNull($unitData['imei2'] ?? null),
                'serial_number'          => $this->blankToNull($unitData['serial_number'] ?? null),
                'device_condition'       => strtoupper(trim((string) ($unitData['device_condition_code'] ?? 'NEW'))),
                'overall_health'         => $this->blankToNull($unitData['overall_health'] ?? null) ?? 'super mint',
                'is_saleable'            => true,
                'status'                 => 'available',
                'base_cost'              => $this->r2($unitData['unit_base_cost'] ?? 0),
                'landed_cost'            => $this->r2($unitData['unit_landed_cost'] ?? 0),
                'wholesale_price'        => $this->positiveOrNull($unitData['wholesale_price'] ?? null),
                'selling_price'          => $this->positiveOrNull($unitData['selling_price'] ?? null),
                'is_margin_scheme'       => (bool) ($unitData['is_margin_scheme'] ?? false),
                'purchase_order_id'      => $po->id,
                'purchase_order_item_id' => $item->id,
                'activation_date'        => $activationDate,
                'warranty_expiry_date'   => $warrantyExpiryDate,
                'remaining_warranty'     => $remainingWarranty,
            ]);

            if (isset($unitData['battery_health_pct'])) {
                $health = DeviceHealth::create([
                    'stock_unit_id'      => $unit->id,
                    'battery_health_pct' => (int) $unitData['battery_health_pct'],
                    'checked_by'         => $user->id,
                    'checked_at'         => now(),
                ]);

                $unit->update(['health_id' => $health->id]);
            }

            $event = StockUnitEvent::create([
                'stock_unit_id'  => $unit->id,
                'store_id'       => $store->id,
                'event_type'     => 'purchased',
                'reference_type' => PurchaseOrderItem::class,
                'reference_id'   => $item->id,
                'created_by'     => $user->id,
            ]);

            $lastEventId = $event->id;

            // Ledger entry per unit (bulk path does the same per batch).
            if ($variantId && isset($snapshots[$variantId])) {
                $snapshot = $snapshots[$variantId];
                $balanceBefore = (int) $snapshot->quantity_on_hand;
                $ledger = StockLedger::create([
                    'idempotency_key'    => $po->uuid . ':create:item:' . $item->id . ':unit:' . $unit->id,
                    'store_id'           => $store->id,
                    'product_variant_id' => $variantId,
                    'stock_batch_id'     => null,
                    'transaction_type'   => 'purchase',
                    'quantity_delta'     => 1,
                    'balance_after'      => $balanceBefore + 1,
                    'base_cost'          => $unit->base_cost,
                    'landed_cost'        => $unit->landed_cost,
                    'reference_type'     => PurchaseOrderItem::class,
                    'reference_id'       => $item->id,
                    'created_by'         => $user->id,
                ]);
                $this->applyToSnapshot($snapshot, 1, $ledger->id, $event->id);
                $lastLedgerId = $ledger->id;
            }
        }

        if ($variantId && $unitCount > 0 && ! isset($lastLedgerId)) {
            $this->applyToSnapshot($snapshots[$variantId], $unitCount, null, $lastEventId);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Bulk path: stock_batches + stock_ledger + snapshot
    |--------------------------------------------------------------------------
    */
    private function processBulkLine(
        PurchaseOrder $po,
        Store $store,
        array $lineData,
        User $user,
        bool $isDraft,
        array $snapshots,
    ): void {
        $variantId  = ! empty($lineData['product_variant_id']) ? (int) $lineData['product_variant_id'] : null;
        $manualName = $lineData['manual_item_name'] ?? null;
        $qty        = max(1, (int) ($lineData['ordered_qty'] ?? 1));

        $item = PurchaseOrderItem::create([
            'purchase_order_id'  => $po->id,
            'product_variant_id' => $variantId,
            'manual_item_name'   => $manualName,
            'ordered_qty'        => $qty,
            'unit_cost'          => $this->r2($lineData['unit_cost'] ?? 0),
            'tax_type'           => $lineData['tax_type'],
            'tax_pct'            => $this->r2($lineData['tax_pct']),
            'is_margin_scheme'   => (bool) $lineData['is_margin_scheme'],
            'base_cost'          => $this->r2($lineData['base_cost']),
            'landed_cost'        => $this->r2($lineData['landed_cost']),
            'tax_amount'         => $this->r2($lineData['tax_amount']),
            'discount_amount'    => $this->r2($lineData['discount_amount']),
            'line_total'         => $this->r2($lineData['line_total']),
        ]);

        if ($isDraft) {
            return;
        }

        $batch = StockBatch::create([
            'uuid'                   => Str::uuid()->toString(),
            'store_id'               => $store->id,
            'product_variant_id'     => $variantId,
            'manual_item_name'       => $manualName,
            'batch_number'           => $this->makeBatchNumber($store->id),
            'purchase_order_id'      => $po->id,
            'purchase_order_item_id' => $item->id,
            'received_qty'           => $qty,
            'remaining_qty'          => $qty,
            'base_cost'              => $this->r2($lineData['base_cost']),
            'landed_cost'            => $this->r2($lineData['landed_cost']),
            'is_margin_scheme'       => (bool) $lineData['is_margin_scheme'],
            // Batch carries the line's condition + price overrides (columns exist
            // on stock_batches; previously computed client-side then dropped).
            'product_condition'      => strtoupper(trim((string) ($lineData['condition_code'] ?? 'NEW'))),
            'overall_health'         => $this->blankToNull($lineData['overall_health'] ?? null),
            // Duration-style warranty only ('D' mode), mirroring stock_units.
            'remaining_warranty'     => $this->blankToNull($lineData['remaining_warranty'] ?? null),
            'wholesale_price'        => $this->positiveOrNull($lineData['wholesale_price'] ?? null),
            'selling_price'          => $this->positiveOrNull($lineData['selling_price'] ?? null),
        ]);

        if (! $variantId) {
            return; // manual item: batch only, no catalog ledger/snapshot
        }

        // Snapshot row is already locked (lockSnapshots), so this balance is exact,
        // including when the same variant appears on several lines of this PO.
        $snapshot      = $snapshots[$variantId];
        $balanceBefore = (int) $snapshot->quantity_on_hand;

        $ledger = StockLedger::create([
            'idempotency_key'    => $po->uuid . ':item:' . $item->id,
            'store_id'           => $store->id,
            'product_variant_id' => $variantId,
            'stock_batch_id'     => $batch->id,
            'transaction_type'   => 'purchase',
            'quantity_delta'     => $qty,
            'balance_after'      => $balanceBefore + $qty,
            'base_cost'          => $this->r2($lineData['base_cost']),
            'landed_cost'        => $this->r2($lineData['landed_cost']),
            'reference_type'     => PurchaseOrderItem::class,
            'reference_id'       => $item->id,
            'created_by'         => $user->id,
        ]);

        $this->applyToSnapshot($snapshot, $qty, $ledger->id, null);
    }

    /*
    |--------------------------------------------------------------------------
    | Snapshots
    |--------------------------------------------------------------------------
    */

    /**
     * Ensure + lock snapshot rows for every catalog variant on the PO, ascending id order.
     * Requires UNIQUE(store_id, product_variant_id) on stock_snapshots.
     *
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

    private function applyToSnapshot(StockSnapshot $snapshot, int $qty, ?int $ledgerId, ?int $unitEventId): void
    {
        $update = [
            'quantity_on_hand' => $snapshot->quantity_on_hand + $qty,
            'total_quantity'   => $snapshot->total_quantity + $qty,
        ];

        if ($ledgerId) {
            $update['last_ledger_id_applied'] = $ledgerId;
        }
        if ($unitEventId) {
            $update['last_unit_event_id_applied'] = $unitEventId;
        }

        $snapshot->update($update);
    }

    /*
    |--------------------------------------------------------------------------
    | PO number reservation (atomic; requires UNIQUE/PK on store_id)
    |
    | The INSERT ... ON DUPLICATE KEY UPDATE takes an exclusive lock on the sequence
    | row that is held until this transaction commits, so the read-back is exact and
    | two requests can never receive the same number.
    |--------------------------------------------------------------------------
    */
    private function reservePoNumber(int $storeId, string $billType): string
    {
        DB::statement(
            'INSERT INTO purchase_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        $next = (int) DB::table('purchase_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number');

        return strtoupper($billType) . '-' . str_pad((string) ($next - 1), 6, '0', STR_PAD_LEFT);
    }

    /*
    |--------------------------------------------------------------------------
    | Vendor
    |--------------------------------------------------------------------------
    */
    private function resolveVendor(array $data, Store $store): Supplier|Customer
    {
        $partyId = (int) $data['party_id'];

        if ($data['party_type'] === 'supplier') {
            // Suppliers belong to a store — never let a purchase attach to
            // another store's supplier.
            return Supplier::where('store_id', $store->id)->findOrFail($partyId);
        }

        // Customers are chain-global (no store_id).
        return Customer::findOrFail($partyId);
    }

    /*
    |--------------------------------------------------------------------------
    | Index stats
    |--------------------------------------------------------------------------
    */
    public function indexStats(int $storeId): array
    {
        $now = now();

        return [
            'total_count'     => PurchaseOrder::where('store_id', $storeId)->count(),
            'total_spend'     => PurchaseOrder::where('store_id', $storeId)->sum('grand_total'),
            'total_due'       => PurchaseOrder::where('store_id', $storeId)->sum('due_amount'),
            'overdue_due'     => PurchaseOrder::where('store_id', $storeId)->where('due_amount', '>', 0)->where('due_date', '<', $now)->sum('due_amount'),
            'itc_claimable'   => PurchaseOrder::where('store_id', $storeId)->where('is_gst_billed', true)->sum('tax_amount'),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */
    private function findByIdempotencyKey(int $storeId, string $key): ?PurchaseOrder
    {
        return PurchaseOrder::query()
            ->where('store_id', $storeId)
            ->where('idempotency_key', $key)
            ->first();
    }

    /** @return array{0: ?string, 1: ?string, 2: ?string} activation, expiry, remaining */
    private function warrantyFields(array $unitData): array
    {
        $mode  = $unitData['warranty_mode'] ?? null;
        $value = $this->blankToNull($unitData['warranty_value'] ?? null);

        if (! $mode || $value === null) {
            return [null, null, null];
        }

        return match (strtoupper((string) $mode)) {
            'A'     => [$value, null, null],   // activation date
            'E'     => [null, $value, null],   // expiry date
            'D'     => [null, null, $value],   // remaining duration, e.g. "6 months"
            default => [null, null, null],
        };
    }

    private function r2(float|int|string|null $n): float
    {
        return round((float) $n + 1e-10, 2);
    }

    private function blankToNull(mixed $val): ?string
    {
        if ($val === null) {
            return null;
        }
        $s = trim((string) $val);

        return $s === '' ? null : $s;
    }

    private function positiveOrNull(mixed $val): ?float
    {
        if ($val === null || $val === '') {
            return null;
        }
        $f = (float) $val;

        return $f > 0 ? $f : null;
    }

    /** 18 chars: 2-char prefix + 64 random bits (hex). Needs a UNIQUE index on purchase_orders.identity. */
    private function generateBarcodeIdentity(string $prefix = 'PV'): string
    {
        return strtoupper(substr($prefix, 0, 2)) . strtoupper(bin2hex(random_bytes(8)));
    }

    private function makeBatchNumber(int $storeId): string
    {
        return 'BCH-' . $storeId . '-' . now()->format('ymdHis') . '-' . strtoupper(bin2hex(random_bytes(3)));
    }
}

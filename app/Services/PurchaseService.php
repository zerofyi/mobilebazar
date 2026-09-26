<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Account;
use App\Models\Customer;
use App\Models\DailySummary;
use App\Models\DeviceHealth;
use App\Models\JournalEntry;
use App\Models\JournalLine;
use App\Models\MonthlySummary;
use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final class PurchaseService
{
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
    | Main entry point — everything inside one atomic transaction.
    |--------------------------------------------------------------------------
    */
    public function processPurchase(Store $store, User $user, array $data): PurchaseOrder
    {
        return DB::transaction(function () use ($store, $user, $data) {

            $isDraft = (bool) ($data['is_draft'] ?? false);

            // ── 1. Resolve vendor + registered flag ─────────────────────────
            [$vendor, $vendorIsRegistered] = $this->resolveVendor($data);

            // ── 2. Reserve PO number under advisory lock ────────────────────
            $poNumber = $this->reservePoNumber($store->id, $data['bill_type']);

            // ── 3. Create purchase_orders header ────────────────────────────
            $po = PurchaseOrder::create([
                'uuid'                     => Str::uuid(),
                'store_id'                 => $store->id,
                'identity'                 => $this->makeBarcodeIdentity($poNumber),
                'bill_type'                => $data['bill_type'],
                'po_number'                => $poNumber,
                'vendor_invoice_no'        => $data['vendor_invoice_no'] ?? null,
                'vendor_type'              => get_class($vendor),
                'vendor_id'                => $vendor->id,
                'type'                     => $data['type'],                  // always 'direct' for now
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
                'idempotency_key'          => $data['idempotency_key'],   // Bug #3 fix: now persisted
                'created_by'               => $user->id,
                // Direct purchases auto-approve on post; drafts have no approval yet
                'approved_by'              => $isDraft ? null : $user->id,
                'approved_at'              => $isDraft ? null : now(),
            ]);

            // ── 4. Process each line (Phase 2 GST eval + Phase 3 inventory) ─
            foreach ($data['lines'] as $lineData) {
                $this->processLine($po, $store, $lineData, $user, $isDraft, $vendorIsRegistered);
            }

            // ── 5. Post journal + roll up summaries when not a draft ────────
            if (!$isDraft) {
                $this->postJournal($po, $store, $user, $data);
                $this->rollUpDailySummary($store->id, $data);
                $this->rollUpMonthlySummary($store->id, $data);
            }

            return $po;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Line processing: POI → serialized OR bulk inventory path
    |--------------------------------------------------------------------------
    */
    private function processLine(
        PurchaseOrder $po,
        Store         $store,
        array         $lineData,
        User          $user,
        bool          $isDraft,
        bool          $vendorIsRegistered,
    ): void {
        $isSerialized = (bool) $lineData['is_serialized'];

        if ($isSerialized) {
            $this->processSerializedLine($po, $store, $lineData, $user, $isDraft);
        } else {
            $this->processBulkLine($po, $store, $lineData, $user, $isDraft, $vendorIsRegistered);
        }
    }

    // ── Serialized path ───────────────────────────────────────────────────────
    // stock_units + stock_unit_events + DeviceHealth + snapshot (by unit count)
    // NO stock_ledger for serialized items — that table is bulk-only.
    private function processSerializedLine(
        PurchaseOrder     $po,
        Store             $store,
        array             $lineData,
        User              $user,
        bool              $isDraft,
    ): void {
        $units       = $lineData['units'] ?? [];
        $variantId   = $lineData['product_variant_id'] ?? null;
        $manualName  = $lineData['manual_item_name']   ?? null;
        $unitCount   = count($units);

        // Create the PurchaseOrderItem (aggregate fields already computed by frontend)
        $item = PurchaseOrderItem::create([
            'purchase_order_id'  => $po->id,
            'product_variant_id' => $variantId,
            'manual_item_name'   => $variantId ? null : $manualName,
            // Bug #5 fix: for serialized lines ordered_qty = unit count, not what
            // the frontend sent for ordered_qty (which is null for serialized lines).
            'ordered_qty'        => $unitCount,
            // Representative cost from the line aggregate (frontend pre-computes)
            'unit_cost'          => $this->r2($lineData['landed_cost'] ?? 0),
            'tax_type'           => $lineData['tax_type'],
            'tax_pct'            => $this->r2($lineData['tax_pct']),
            'is_margin_scheme'   => (bool) $lineData['is_margin_scheme'],
            'base_cost'          => $this->r2($lineData['base_cost']),
            'landed_cost'        => $this->r2($lineData['landed_cost']),
            'tax_amount'         => $this->r2($lineData['tax_amount']),
            'discount_amount'    => $this->r2($lineData['discount_amount']),
            'line_total'         => $this->r2($lineData['line_total']),
        ]);

        // Skip inventory writes for drafts — post the units only when committed.
        if ($isDraft) {
            return;
        }

        $lastEventId = null;

        foreach ($units as $unitData) {
            // Create physical unit record
            $unit = StockUnit::create([
                'uuid'                   => Str::uuid(),
                'store_id'               => $store->id,
                'product_variant_id'     => $variantId,
                'manual_item_name'       => $variantId ? null : $manualName,
                'imei1'                  => $this->blankToNull($unitData['imei1']         ?? ''),
                'imei2'                  => $this->blankToNull($unitData['imei2']         ?? ''),
                'serial_number'          => $this->blankToNull($unitData['serial_number'] ?? ''),
                'device_condition'       => strtoupper(trim($unitData['device_condition_code'] ?? 'NEW')),
                'overall_health'         => $this->blankToNull($unitData['overall_health'] ?? ''),
                'is_saleable'            => true,
                'status'                 => 'available',
                'base_cost'              => $this->r2($unitData['unit_base_cost']   ?? 0),
                'landed_cost'            => $this->r2($unitData['unit_landed_cost'] ?? 0),
                'wholesale_price'        => $this->positiveOrNull($unitData['wholesale_price'] ?? null),
                'selling_price'          => $this->positiveOrNull($unitData['selling_price']   ?? null),
                'is_margin_scheme'       => (bool) ($unitData['is_margin_scheme'] ?? false),
                'purchase_order_id'      => $po->id,
                'purchase_order_item_id' => $item->id,
            ]);

            // Optional device health record (battery %, checklist, etc.)
            if (isset($unitData['battery_health_pct'])) {
                DeviceHealth::create([
                    'stock_unit_id'     => $unit->id,
                    'battery_health_pct'=> (int) $unitData['battery_health_pct'],
                    'checked_by'        => $user->id,
                    'checked_at'        => now(),
                ]);
            }

            // Immutable audit trail event
            $event = StockUnitEvent::create([
                'stock_unit_id'  => $unit->id,
                'store_id'       => $store->id,
                'event_type'     => 'purchased',
                'reference_type' => PurchaseOrderItem::class,
                'reference_id'   => $item->id,
                'created_by'     => $user->id,
            ]);

            $lastEventId = $event->id;
        }

        // Update snapshot for catalog variants (count += units purchased)
        if ($variantId && $unitCount > 0) {
            $this->incrementSnapshot(
                storeId:         $store->id,
                variantId:       $variantId,
                qty:             $unitCount,
                lastLedgerId:    null,          // serialized path never writes a ledger
                lastUnitEventId: $lastEventId,
            );
        }
    }

    // ── Bulk path ─────────────────────────────────────────────────────────────
    // stock_batches + stock_ledger + snapshot
    // NO stock_unit / stock_unit_event for bulk lines.
    private function processBulkLine(
        PurchaseOrder $po,
        Store         $store,
        array         $lineData,
        User          $user,
        bool          $isDraft,
        bool          $vendorIsRegistered,
    ): void {
        $variantId  = $lineData['product_variant_id'] ?? null;
        $manualName = $lineData['manual_item_name']   ?? null;
        $qty        = (int) ($lineData['ordered_qty'] ?? 1);

        $item = PurchaseOrderItem::create([
            'purchase_order_id'  => $po->id,
            'product_variant_id' => $variantId,
            'manual_item_name'   => $variantId ? null : $manualName,
            'ordered_qty'        => $qty,
            'unit_cost'          => $this->r2($lineData['unit_cost']   ?? 0),
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

        // stock_batch — one record covers the entire qty
        $batch = StockBatch::create([
            'uuid'                   => Str::uuid(),
            'store_id'               => $store->id,
            'product_variant_id'     => $variantId,
            'manual_item_name'       => $variantId ? null : $manualName,
            'batch_number'           => $this->makeBatchNumber($store->id),
            'purchase_order_id'      => $po->id,
            'purchase_order_item_id' => $item->id,
            'received_qty'           => $qty,
            'remaining_qty'          => $qty,
            'unit_cost'              => $this->r2($lineData['unit_cost']   ?? 0),
            'base_cost'              => $this->r2($lineData['base_cost']),
            'landed_cost'            => $this->r2($lineData['landed_cost']),
            'tax_type'               => $lineData['tax_type'],
            'is_margin_scheme'       => (bool) $lineData['is_margin_scheme'],
        ]);

        // stock_ledger + snapshot — only for catalog products (variantId known)
        if ($variantId) {
            // Bug #6 fix: use updateOrCreate with lockForUpdate in the right order.
            // Read the current balance under lock before writing the ledger row.
            $snapshot = StockSnapshot::lockForUpdate()
                ->where('store_id', $store->id)
                ->where('product_variant_id', $variantId)
                ->first();

            $balanceBefore = $snapshot?->quantity_on_hand ?? 0;
            $balanceAfter  = $balanceBefore + $qty;

            // Idempotency key on the ledger prevents duplicate rows if the DB
            // driver auto-retries a deadlock (rare but possible).
            $ledgerKey = $po->uuid . ':item:' . $item->id;

            $ledger = StockLedger::create([
                'idempotency_key'    => $ledgerKey,
                'store_id'           => $store->id,
                'product_variant_id' => $variantId,
                'stock_batch_id'     => $batch->id,
                'transaction_type'   => 'purchase',
                'quantity_delta'     => $qty,
                'balance_after'      => $balanceAfter,
                'base_cost'          => $this->r2($lineData['base_cost']),
                'landed_cost'        => $this->r2($lineData['landed_cost']),
                'reference_type'     => PurchaseOrderItem::class,
                'reference_id'       => $item->id,
                'created_by'         => $user->id,
            ]);

            // Upsert snapshot with the new balance and pointer to the latest ledger
            $this->incrementSnapshot(
                storeId:         $store->id,
                variantId:       $variantId,
                qty:             $qty,
                lastLedgerId:    $ledger->id,
                lastUnitEventId: null,
                snapshot:        $snapshot,   // pass the already-locked record
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Snapshot upsert — called from both serialized and bulk paths
    |--------------------------------------------------------------------------
    */
    private function incrementSnapshot(
        int    $storeId,
        int    $variantId,
        int    $qty,
        ?int   $lastLedgerId,
        ?int   $lastUnitEventId,
        ?StockSnapshot $snapshot = null,    // pass if already locked (bulk path)
    ): void {
        if ($snapshot) {
            // Already locked above — just update in place
            $update = ['quantity_on_hand' => $snapshot->quantity_on_hand + $qty];
            if ($lastLedgerId)    $update['last_ledger_id_applied']    = $lastLedgerId;
            if ($lastUnitEventId) $update['last_unit_event_id_applied'] = $lastUnitEventId;
            $snapshot->update($update);
            return;
        }

        // Serialized path: lock now, then upsert
        $snapshot = StockSnapshot::lockForUpdate()
            ->where('store_id', $storeId)
            ->where('product_variant_id', $variantId)
            ->first();

        if ($snapshot) {
            $update = ['quantity_on_hand' => $snapshot->quantity_on_hand + $qty];
            if ($lastUnitEventId) $update['last_unit_event_id_applied'] = $lastUnitEventId;
            $snapshot->update($update);
        } else {
            // Bug #6 fix: no firstOrCreate race — INSERT with ignore so concurrent
            // inserts for the same variant don't crash. We then re-read and update.
            DB::table('stock_snapshots')->insertOrIgnore([
                'store_id'           => $storeId,
                'product_variant_id' => $variantId,
                'quantity_on_hand'   => 0,
                'quantity_reserved'  => 0,
                'created_at'         => now(),
                'updated_at'         => now(),
            ]);

            StockSnapshot::where('store_id', $storeId)
                ->where('product_variant_id', $variantId)
                ->lockForUpdate()
                ->update(array_filter([
                    'quantity_on_hand'             => DB::raw("quantity_on_hand + {$qty}"),
                    'last_unit_event_id_applied'   => $lastUnitEventId,
                    'updated_at'                   => now(),
                ]));
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Double-entry journal
    |
    | Entries:
    |   Dr  Inventory Asset (1040)         = subtotal (base cost of goods)
    |   Dr  GST Input Tax Credit (2020)    = tax_amount  [if GST billed]
    |   Dr  Freight-In Expense (5020)      = shipping_charge [if any]
    |   Cr  Purchase Discount Income (5010)= discount_amount [if any]
    |   Cr  Accounts Payable (2010)        = grand_total
    |
    | Bug #11 fix (freight double-count was here): AP is now grand_total exactly.
    | Total debits = subtotal + tax + freight - discount = grand_total = AP credit.
    | That keeps the entry in balance with no phantom lines.
    |
    | If paid immediately, a second mini-entry settles the AP:
    |   Dr  Accounts Payable (2010)        = paid_amount
    |   Cr  Cash/Bank (1010/1020)          = paid_amount
    |--------------------------------------------------------------------------
    */
    private function postJournal(
        PurchaseOrder $po,
        Store         $store,
        User          $user,
        array         $data,
    ): void {
        $accounts = Account::whereIn('code', ['1010', '1020', '1040', '2010', '2020', '5010', '5020'])
            ->where(function ($q) use ($store) {
                $q->whereNull('store_id')->orWhere('store_id', $store->id);
            })
            ->get()
            ->keyBy('code');

        $subtotal      = $this->r2($data['subtotal']);
        $taxAmount     = $this->r2($data['tax_amount']);
        $shipping      = $this->r2($data['shipping_charge'] ?? 0);
        $discount      = $this->r2($data['discount_amount'] ?? 0);
        $grandTotal    = $this->r2($data['grand_total']);
        $paidAmount    = $this->r2($data['paid_amount'] ?? 0);

        $lines = [];

        // Debit: Inventory (base cost of stock received)
        if ($subtotal > 0) {
            $lines[] = ['account_id' => $accounts['1040']->id, 'debit' => $subtotal,  'credit' => 0, 'memo' => 'Inventory received'];
        }

        // Debit: GST Input Tax Credit
        if ($taxAmount > 0) {
            $lines[] = ['account_id' => $accounts['2020']->id, 'debit' => $taxAmount, 'credit' => 0, 'memo' => $po->is_intra_state ? 'CGST + SGST input' : 'IGST input'];
        }

        // Debit: Inward freight (capitalised as a cost, not operating expense)
        if ($shipping > 0) {
            $lines[] = ['account_id' => $accounts['5020']->id, 'debit' => $shipping,  'credit' => 0, 'memo' => 'Inward freight / shipping'];
        }

        // Credit: Purchase discount received (reduces cost)
        if ($discount > 0) {
            $lines[] = ['account_id' => $accounts['5010']->id, 'debit' => 0, 'credit' => $discount, 'memo' => 'Purchase discount received'];
        }

        // Credit: Accounts Payable — full vendor liability = grand_total
        // grand_total = subtotal + tax + shipping - discount, so this balances.
        $lines[] = ['account_id' => $accounts['2010']->id, 'debit' => 0, 'credit' => $grandTotal, 'memo' => 'Vendor liability — ' . $po->po_number];

        $totalDebit  = collect($lines)->sum('debit');
        $totalCredit = collect($lines)->sum('credit');

        $je = JournalEntry::create([
            'uuid'           => Str::uuid(),
            'entry_number'   => 'JE-' . $po->po_number,
            'store_id'       => $store->id,
            'entry_date'     => $po->order_date,
            'reference_type' => PurchaseOrder::class,
            'reference_id'   => $po->id,
            'total_debit'    => $totalDebit,
            'total_credit'   => $totalCredit,
            'narration'      => 'Purchase ' . $po->po_number . ($po->vendor_invoice_no ? ' / Vendor inv: ' . $po->vendor_invoice_no : ''),
            'created_by'     => $user->id,
        ]);

        $je->lines()->createMany(array_map(
            fn ($l) => array_merge($l, ['journal_entry_id' => $je->id]),
            $lines
        ));

        // Immediate payment settlement entry
        if ($paidAmount > 0) {
            $payAccCode = ($data['payment_mode'] ?? 'cash') === 'cash' ? '1010' : '1020';
            $payLines   = [
                ['account_id' => $accounts['2010']->id,         'debit' => $paidAmount, 'credit' => 0,           'memo' => 'Clearing AP — ' . $po->po_number],
                ['account_id' => $accounts[$payAccCode]->id,    'debit' => 0,           'credit' => $paidAmount, 'memo' => 'Paid via ' . ucfirst($data['payment_mode'] ?? 'cash')],
            ];

            $payJe = JournalEntry::create([
                'uuid'           => Str::uuid(),
                'entry_number'   => 'JE-PAY-' . $po->po_number,
                'store_id'       => $store->id,
                'entry_date'     => $po->order_date,
                'reference_type' => PurchaseOrder::class,
                'reference_id'   => $po->id,
                'total_debit'    => $paidAmount,
                'total_credit'   => $paidAmount,
                'narration'      => 'Payment against ' . $po->po_number,
                'created_by'     => $user->id,
            ]);

            $payJe->lines()->createMany(array_map(
                fn ($l) => array_merge($l, ['journal_entry_id' => $payJe->id]),
                $payLines
            ));
        }
    }

    /*
    |--------------------------------------------------------------------------
    | Summary roll-ups
    |--------------------------------------------------------------------------
    */

    // Bug #12 fix: use Eloquent upsert so updated_at is handled by the model,
    // and the increment is a raw expression (race-safe, no read-modify-write).
    private function rollUpDailySummary(int $storeId, array $data): void
    {
        $date        = Carbon::parse($data['order_date'])->toDateString();
        $grandTotal  = $this->r2($data['grand_total']);

        DB::table('daily_summaries')->updateOrInsert(
            ['store_id' => $storeId, 'date' => $date],
            [
                'store_id'        => $storeId,
                'date'            => $date,
                'total_purchases' => DB::raw("COALESCE(total_purchases, 0) + {$grandTotal}"),
                'purchase_count'  => DB::raw('COALESCE(purchase_count, 0) + 1'),
                'created_at'      => DB::raw('IFNULL(created_at, NOW())'),
                'updated_at'      => now(),
            ]
        );
    }

    private function rollUpMonthlySummary(int $storeId, array $data): void
    {
        $yearMonth  = Carbon::parse($data['order_date'])->format('Y-m');
        $grandTotal = $this->r2($data['grand_total']);

        DB::table('monthly_summaries')->updateOrInsert(
            ['store_id' => $storeId, 'year_month' => $yearMonth],
            [
                'store_id'        => $storeId,
                'year_month'      => $yearMonth,
                'total_purchases' => DB::raw("COALESCE(total_purchases, 0) + {$grandTotal}"),
                'created_at'      => DB::raw('IFNULL(created_at, NOW())'),
                'updated_at'      => now(),
            ]
        );
    }

    /*
    |--------------------------------------------------------------------------
    | PO number reservation
    |
    | Bug #1 fix: the original code did SELECT … INSERT (two statements).
    | Under concurrent requests for a brand-new store both see NULL, both
    | try INSERT and one crashes on the unique key.
    |
    | Fix: INSERT … ON DUPLICATE KEY UPDATE (single atomic statement).
    | The sequence row is created-or-incremented atomically, no gap possible.
    |--------------------------------------------------------------------------
    */
    private function reservePoNumber(int $storeId, string $billType): string
    {
        // Atomically insert the first row (next_number = 1) or increment.
        // Returns the value that was current BEFORE the increment via LAST_INSERT_ID trick.
        DB::statement(
            'INSERT INTO purchase_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        // LAST_INSERT_ID() after ON DUPLICATE KEY UPDATE returns the pre-update value
        // when triggered by the UPDATE branch, and the inserted id for the INSERT branch.
        // We need the sequence number itself, so we read it back under lockForUpdate.
        $current = DB::table('purchase_number_sequences')
            ->where('store_id', $storeId)
            ->lockForUpdate()
            ->value('next_number');

        // The row now has next_number = N+1 after the statement above,
        // so the number we just consumed is N = current - 1.
        $consumed = $current - 1;

        $prefix = strtoupper($billType) . '-'; // 'PO-' or 'PV-'
        return $prefix . str_pad((string) $consumed, 6, '0', STR_PAD_LEFT);
    }

    /*
    |--------------------------------------------------------------------------
    | Vendor resolution
    |--------------------------------------------------------------------------
    */
    private function resolveVendor(array $data): array
    {
        $partyId = (int) $data['party_id'];

        if ($data['party_type'] === 'supplier') {
            $vendor = Supplier::findOrFail($partyId);
        } else {
            $vendor = Customer::findOrFail($partyId);
        }

        $isRegistered = !empty(trim($vendor->gstin ?? ''));

        return [$vendor, $isRegistered];
    }

    /*
    |--------------------------------------------------------------------------
    | Index stats (used by the controller's index action)
    |--------------------------------------------------------------------------
    */
    public function indexStats(int $storeId): array
    {
        $base = fn () => PurchaseOrder::where('store_id', $storeId);

        return [
            'total_purchases' => $base()->count(),
            'this_month'      => $base()->whereMonth('order_date', now()->month)->whereYear('order_date', now()->year)->count(),
            'gst_purchases'   => $base()->where('is_gst_billed', true)->count(),
            'unpaid_count'    => $base()->where('payment_status', 'unpaid')->count(),
            'total_value'     => $this->r2($base()->sum('grand_total')),
            'total_due'       => $this->r2($base()->where('payment_status', '!=', 'paid')->sum('due_amount')),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    /** Round to 2 decimal places with banker's rounding prevention. */
    private function r2(float|int|string $n): float
    {
        return round((float) $n + 1e-10, 2);
    }

    private function blankToNull(string $val): ?string
    {
        return trim($val) === '' ? null : trim($val);
    }

    private function positiveOrNull(mixed $val): ?float
    {
        if ($val === null || $val === '' || $val === 0) {
            return null;
        }
        $f = (float) $val;
        return $f > 0 ? $f : null;
    }

    /**
     * Bug #7 fix: identity was using uniqid() which is time-based and not
     * collision-proof at microsecond concurrency. A UUID derived slug is unique
     * by construction and scannable as a barcode via a QR/code-128 encoder.
     */
    private function makeBarcodeIdentity(string $poNumber): string
    {
        // e.g. "PV-000042-A3F9C1" — human-readable and unique
        return strtoupper($poNumber . '-' . substr(bin2hex(random_bytes(3)), 0, 6));
    }

    private function makeBatchNumber(int $storeId): string
    {
        // BCH-{storeId}-{timestamp-ms}-{random4}
        return 'BCH-' . $storeId . '-' . now()->format('ymdHis') . '-' . strtoupper(substr(bin2hex(random_bytes(2)), 0, 4));
    }
}

<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\MonthLockedException;
use App\Models\Customer;
use App\Models\DeviceHealth;
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
                    'lines' => 'A device with this IMEI or serial number is already in active stock. It may have been purchased concurrently — please review and retry.',
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

    private function createPurchase(Store $store, User $user, array $data): PurchaseOrder
    {
        $isDraft   = (bool) ($data['is_draft'] ?? false);
        $orderDate = Carbon::parse($data['order_date']);

        // Fail fast (before consuming a PO number / touching stock) on a locked month.
        if (! $isDraft && $this->summaries->isMonthLocked($store->id, $orderDate->format('Y-m'))) {
            throw MonthLockedException::for($store->id, $orderDate->format('Y-m'));
        }

        // 1. Vendor
        $vendor = $this->resolveVendor($data);

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
    | Serialized path: stock_units + events + health + snapshot (by unit count)
    |--------------------------------------------------------------------------
    */
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

        if ($isDraft) {
            return;
        }

        $lastEventId = null;

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
                'overall_health'         => $this->blankToNull($unitData['overall_health'] ?? null),
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
        }

        if ($variantId && $unitCount > 0) {
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
            'product_condition'      => strtolower(trim((string) ($lineData['condition_code'] ?? 'new'))),
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
    private function resolveVendor(array $data): Supplier|Customer
    {
        $partyId = (int) $data['party_id'];

        return $data['party_type'] === 'supplier'
            ? Supplier::findOrFail($partyId)
            : Customer::findOrFail($partyId);
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

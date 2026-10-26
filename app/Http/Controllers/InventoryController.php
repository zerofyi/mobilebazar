<?php

namespace App\Http\Controllers;

use App\Models\InvoiceItem;
use App\Models\ProductVariant;
use App\Models\StockBatch;
use App\Models\StockLedger;
use App\Models\StockUnit;
use App\Models\StockUnitEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class InventoryController extends Controller
{
    /**
     * Store-wide stock inventory — serialized units + non-serialized batches.
     */
    public function index(Request $request): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $tab = $request->query('tab', 'serialized');
        if (! in_array($tab, ['serialized', 'batches'], true)) {
            $tab = 'serialized';
        }

        $filters = $request->only(['search', 'status', 'condition', 'filter']);

        // "Low stock" deep-link from the dashboard "Needs attention" feed —
        // the alert counts saleable batches at 2 or fewer remaining, so force
        // the batches tab and mirror that definition in the query below.
        $isLowStock = ($filters['filter'] ?? null) === 'low';
        if ($isLowStock) {
            $tab = 'batches';
        }

        // ── Summary (store-wide, unfiltered) ──────────────────────────────
        $unitBase = StockUnit::where('store_id', $store->id)->whereIn('status', ['available', 'reserved']);
        $batchBase = StockBatch::where('store_id', $store->id)->where('remaining_qty', '>', 0);

        $summary = [
            'units_available'      => (clone $unitBase)->where('status', 'available')->count(),
            'units_reserved'       => (clone $unitBase)->where('status', 'reserved')->count(),
            'units_value'          => round((clone $unitBase)->sum('landed_cost'), 2),
            'batches_count'        => (clone $batchBase)->count(),
            'batches_remaining'    => (int) (clone $batchBase)->sum('remaining_qty'),
            'batches_value'        => round(StockBatch::where('store_id', $store->id)
                ->where('remaining_qty', '>', 0)
                ->selectRaw('COALESCE(SUM(remaining_qty * landed_cost), 0) as v')
                ->value('v'), 2),
        ];

        // ── Serialized units ──────────────────────────────────────────────
        $units = null;
        if ($tab === 'serialized') {
            $units = StockUnit::with(['productVariant:id,product_id,variant_name,sku,barcode', 'productVariant.product:id,name'])
                ->where('store_id', $store->id)
                ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                    ->where('manual_item_name', 'like', "%{$v}%")
                    ->orWhere('imei1', 'like', "%{$v}%")
                    ->orWhere('imei2', 'like', "%{$v}%")
                    ->orWhere('serial_number', 'like', "%{$v}%")
                    ->orWhereHas('productVariant', fn ($q3) => $q3
                        ->where('variant_name', 'like', "%{$v}%")
                        ->orWhere('sku', 'like', "%{$v}%")
                        ->orWhere('barcode', 'like', "%{$v}%"))))
                ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
                ->when($filters['condition'] ?? null, fn ($q, $v) => $q->where('device_condition', $v))
                ->latest('id')
                ->paginate(25)
                ->withQueryString();
        }

        // ── Non-serialized batches ────────────────────────────────────────
        $batches = null;
        if ($tab === 'batches') {
            $batches = StockBatch::with(['productVariant:id,product_id,variant_name,sku,barcode', 'productVariant.product:id,name'])
                ->where('store_id', $store->id)
                ->when($isLowStock, fn ($q) => $q->where('is_saleable', true)
                    ->where('remaining_qty', '<=', 2)
                    ->where('remaining_qty', '>', 0))
                ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                    ->where('manual_item_name', 'like', "%{$v}%")
                    ->orWhere('batch_number', 'like', "%{$v}%")
                    ->orWhereHas('productVariant', fn ($q3) => $q3
                        ->where('variant_name', 'like', "%{$v}%")
                        ->orWhere('sku', 'like', "%{$v}%")
                        ->orWhere('barcode', 'like', "%{$v}%"))))
                ->when($filters['condition'] ?? null, fn ($q, $v) => $q->where('product_condition', $v))
                ->orderByDesc('remaining_qty')
                ->paginate(25)
                ->withQueryString();
        }

        return inertia('App/Inventory/Index', [
            'tab'     => $tab,
            'filters' => $filters,
            'summary' => $summary,
            'units'   => $units,
            'batches' => $batches,
        ]);
    }

    /**
     * Print Inventory — full in-stock list for an A4 stock sheet.
     * In stock = serialized units available/reserved + batches with
     * remaining_qty > 0. No pagination: the page is meant to be printed whole.
     * Price-column visibility is a client-side (print-options) concern.
     */
    public function printInventory(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user->can('inventory.view'), 403);

        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        /** @var \Illuminate\Database\Eloquent\Collection<int, StockUnit> $unitModels */
        $unitModels = StockUnit::with(['productVariant:id,product_id,variant_name,sku', 'productVariant.product:id,name'])
            ->where('store_id', $store->id)
            ->whereIn('status', ['available', 'reserved'])
            ->orderBy('id')
            ->get();
        $units = $unitModels
            ->map(fn (StockUnit $u) => [
                'id'              => $u->id,
                'product_name'    => $u->productVariant?->product?->name ?? $u->manual_item_name ?? '—',
                'variant_name'    => $u->productVariant?->variant_name,
                'sku'             => $u->productVariant?->sku,
                'imei'            => $u->imei1 ?? $u->serial_number,
                'condition'       => $u->device_condition,
                'status'          => $u->status,
                'cost'            => (float) $u->landed_cost,
                'wholesale_price' => $u->wholesale_price !== null ? (float) $u->wholesale_price : null,
                'retail_price'    => $u->selling_price !== null ? (float) $u->selling_price : null,
            ])->values();

        /** @var \Illuminate\Database\Eloquent\Collection<int, StockBatch> $batchModels */
        $batchModels = StockBatch::with(['productVariant:id,product_id,variant_name,sku', 'productVariant.product:id,name'])
            ->where('store_id', $store->id)
            ->where('remaining_qty', '>', 0)
            ->orderByDesc('remaining_qty')
            ->get();
        $batches = $batchModels
            ->map(fn (StockBatch $b) => [
                'id'              => $b->id,
                'product_name'    => $b->productVariant?->product?->name ?? $b->manual_item_name ?? '—',
                'variant_name'    => $b->productVariant?->variant_name,
                'sku'             => $b->productVariant?->sku,
                'batch_number'    => $b->batch_number,
                'qty'             => (int) $b->remaining_qty,
                'cost'            => (float) $b->landed_cost,
                'wholesale_price' => $b->wholesale_price !== null ? (float) $b->wholesale_price : null,
                'retail_price'    => $b->selling_price !== null ? (float) $b->selling_price : null,
            ])->values();

        return inertia('Billing/Inventory/Print', [
            'store' => ['name' => $store->name, 'code' => $store->code],
            'printed_at' => now()->format('d M Y, h:i A'),
            'units' => $units,
            'batches' => $batches,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Label printing — same stock dataset as the print sheet, plus the fields
    | a sticky label needs (variant barcode + MRP, both IMEIs, serial). The
    | Labels page renders/previews everything client-side and persists the
    | operator's setup in the browser; this endpoint is read-only data.
    |--------------------------------------------------------------------------
    */
    public function labels(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user->can('inventory.view'), 403);

        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $variantCols = 'productVariant:id,product_id,variant_name,sku,barcode,mrp,selling_price';

        /** @var \Illuminate\Database\Eloquent\Collection<int, StockUnit> $unitModels */
        $unitModels = StockUnit::with([$variantCols, 'productVariant.product:id,name,warranty_months'])
            ->where('store_id', $store->id)
            ->whereIn('status', ['available', 'reserved'])
            ->orderBy('id')
            ->get();
        $units = $unitModels
            ->map(fn (StockUnit $u) => [
                'id'              => $u->id,
                'product_name'    => $u->productVariant?->product?->name ?? $u->manual_item_name ?? '—',
                'variant_name'    => $u->productVariant?->variant_name,
                'sku'             => $u->productVariant?->sku,
                'barcode'         => $u->productVariant?->barcode,
                'imei1'           => $u->imei1,
                'imei2'           => $u->imei2,
                'serial_number'   => $u->serial_number,
                'condition'       => $u->device_condition,
                'warranty'        => $this->labelWarrantyText($u),
                'status'          => $u->status,
                'mrp'             => $u->productVariant?->mrp !== null ? (float) $u->productVariant->mrp : null,
                'wholesale_price' => $u->wholesale_price !== null ? (float) $u->wholesale_price : null,
                'retail_price'    => $u->selling_price !== null
                    ? (float) $u->selling_price
                    : ($u->productVariant?->selling_price !== null ? (float) $u->productVariant->selling_price : null),
            ])->values();

        /** @var \Illuminate\Database\Eloquent\Collection<int, StockBatch> $batchModels */
        $batchModels = StockBatch::with([$variantCols, 'productVariant.product:id,name'])
            ->where('store_id', $store->id)
            ->where('remaining_qty', '>', 0)
            ->orderByDesc('remaining_qty')
            ->get();
        $batches = $batchModels
            ->map(fn (StockBatch $b) => [
                'id'              => $b->id,
                'product_name'    => $b->productVariant?->product?->name ?? $b->manual_item_name ?? '—',
                'variant_name'    => $b->productVariant?->variant_name,
                'sku'             => $b->productVariant?->sku,
                'barcode'         => $b->productVariant?->barcode,
                'batch_number'    => $b->batch_number,
                'qty'             => (int) $b->remaining_qty,
                'warranty'        => $b->remaining_warranty,
                'mrp'             => $b->productVariant?->mrp !== null ? (float) $b->productVariant->mrp : null,
                'wholesale_price' => $b->wholesale_price !== null ? (float) $b->wholesale_price : null,
                'retail_price'    => $b->selling_price !== null
                    ? (float) $b->selling_price
                    : ($b->productVariant?->selling_price !== null ? (float) $b->productVariant->selling_price : null),
            ])->values();

        return inertia('Billing/Inventory/Labels', [
            'store' => ['name' => $store->name, 'code' => $store->code],
            'units' => $units,
            'batches' => $batches,
        ]);
    }

    /**
     * Warranty text for a unit's label — same priority as the sale flow
     * (SaleEntryController::unitWarrantyText): free-text remaining_warranty,
     * else activation + product warranty months, else the expiry date.
     */
    private function labelWarrantyText(StockUnit $u): ?string
    {
        if ($u->remaining_warranty) {
            return $u->remaining_warranty;
        }

        $today = now()->startOfDay();
        $end = null;

        $months = $u->productVariant?->product?->warranty_months;
        if ($u->activation_date && $months) {
            $end = $u->activation_date->copy()->startOfDay()->addMonths((int) $months);
        } elseif ($u->warranty_expiry_date) {
            $end = $u->warranty_expiry_date->copy()->startOfDay();
        }

        if ($end === null) {
            return null;
        }

        if ($end->lt($today)) {
            return 'Out of warranty';
        }

        $m = (int) $today->diffInMonths($end);
        $d = (int) $today->copy()->addMonths($m)->diffInDays($end);

        return $m > 0 ? "{$m} mo" . ($d > 0 ? " {$d} d" : '') . ' left' : "{$d} d left";
    }

    /*
    |--------------------------------------------------------------------------
    | Verify — global stock search (IMEI / serial / name / SKU / barcode /
    | batch). Powers the Verify Stock modal. Store-scoped, read-only.
    |--------------------------------------------------------------------------
    */
    public function verifySearch(Request $request): JsonResponse
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $q = trim($request->validate(['q' => ['required', 'string', 'min:2', 'max:60']])['q']);

        // 1. Serialized units — exact identifier hits first (scanner fast-path).
        $units = StockUnit::with(['productVariant:id,product_id,variant_name,sku', 'productVariant.product:id,name'])
            ->where('store_id', $store->id)
            ->where(fn ($w) => $w
                ->where('imei1', $q)->orWhere('imei2', $q)->orWhere('serial_number', $q)
                ->orWhere('imei1', 'like', "%{$q}%")->orWhere('imei2', 'like', "%{$q}%")
                ->orWhere('serial_number', 'like', "%{$q}%")
                ->orWhere('manual_item_name', 'like', "%{$q}%"))
            ->orderByRaw('(imei1 = ? or imei2 = ? or serial_number = ?) desc', [$q, $q, $q])
            ->limit(12)
            ->get()
            ->map(fn ($u) => [
                'kind'       => 'unit',
                'id'         => $u->id,
                'title'      => $u->manual_item_name ?? ($u->productVariant?->product?->name . ($u->productVariant ? ' · ' . $u->productVariant->variant_name : '')),
                'identifier' => $u->imei1 ?? $u->imei2 ?? $u->serial_number ?? '—',
                'status'     => $u->status,
                'meta'       => ucfirst($u->device_condition ?? '—'),
            ]);

        // 2. Batches.
        $batches = StockBatch::with(['productVariant:id,product_id,variant_name,sku', 'productVariant.product:id,name'])
            ->where('store_id', $store->id)
            ->where(fn ($w) => $w
                ->where('batch_number', 'like', "%{$q}%")
                ->orWhere('manual_item_name', 'like', "%{$q}%"))
            ->limit(12)
            ->get()
            ->map(fn ($b) => [
                'kind'       => 'batch',
                'id'         => $b->id,
                'title'      => $b->manual_item_name ?? ($b->productVariant?->product?->name . ($b->productVariant ? ' · ' . $b->productVariant->variant_name : '')),
                'identifier' => $b->batch_number,
                'status'     => $b->remaining_qty > 0 ? 'in_stock' : 'empty',
                'meta'       => $b->remaining_qty . ' / ' . $b->received_qty . ' left',
            ]);

        // 3. Product variants (aggregate view).
        $variants = ProductVariant::with('product:id,name')
            ->where(fn ($w) => $w
                ->where('variant_name', 'like', "%{$q}%")
                ->orWhere('sku', 'like', "%{$q}%")
                ->orWhere('barcode', 'like', "%{$q}%"))
            ->limit(10)
            ->get()
            ->map(fn ($v) => [
                'kind'       => 'variant',
                'id'         => $v->id,
                'title'      => $v->product?->name . ' · ' . $v->variant_name,
                'identifier' => $v->sku,
                'status'     => '—',
                'meta'       => '',
            ]);

        return response()->json([
            'units'    => $units,
            'batches'  => $batches,
            'variants' => $variants,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Verify — A-Z detail for one unit / batch / variant: product, purchase,
    | sales, and the full movement timeline.
    |--------------------------------------------------------------------------
    */
    public function verifyShow(string $kind, int $id): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);
        abort_unless(in_array($kind, ['unit', 'batch', 'variant'], true), 404);

        $detail = match ($kind) {
            'unit'    => $this->unitDetail($store->id, $id),
            'batch'   => $this->batchDetail($store->id, $id),
            'variant' => $this->variantDetail($store->id, $id),
        };

        return Inertia::render('App/Inventory/Verify', [
            'kind'   => $kind,
            'detail' => $detail,
        ]);
    }

    private function unitDetail(int $storeId, int $id): array
    {
        $u = StockUnit::with([
                'productVariant:id,product_id,variant_name,sku,barcode',
                'productVariant.product:id,name,hsn_code',
                'purchaseOrder:id,po_number,order_date,vendor_id',
                'purchaseOrder.vendor:id,name,company_name',
            ])
            ->where('store_id', $storeId)
            ->findOrFail($id);

        // Every sale this unit ever appeared in (via its invoice items).
        $sales = InvoiceItem::with(['invoice:id,uuid,invoice_number,invoice_date,party_type,party_id,grand_total', 'invoice.party'])
            ->where('stock_unit_id', $u->id)
            ->orderByDesc('id')
            ->get()
            ->map(function ($item) {
                $inv = $item->invoice;
                $party = $inv?->party;
                return [
                    'invoice_number' => $inv?->invoice_number,
                    'invoice_uuid'   => $inv?->uuid,
                    'date'           => $inv?->invoice_date?->format('Y-m-d'),
                    'customer'       => $party?->name ?? $party?->company_name ?? '—',
                    'price'          => (float) $item->unit_price,
                ];
            });

        $events = StockUnitEvent::where('stock_unit_id', $u->id)
            ->orderBy('created_at')
            ->get(['event_type', 'note', 'created_at'])
            ->map(fn ($e) => [
                'type' => $e->event_type,
                'note' => $e->note,
                'at'   => $e->created_at?->format('Y-m-d H:i'),
            ]);

        return [
            'title'      => $u->manual_item_name ?? ($u->productVariant?->product?->name . ' · ' . $u->productVariant?->variant_name),
            'subtitle'   => $u->productVariant?->sku,
            'status'     => $u->status,
            'identifiers' => array_filter([
                'IMEI 1' => $u->imei1, 'IMEI 2' => $u->imei2, 'Serial' => $u->serial_number,
            ]),
            'condition'  => $u->device_condition,
            'health'     => $u->overall_health,
            'warranty'   => $u->remaining_warranty,
            'cost'       => ['landed' => (float) $u->landed_cost, 'base' => (float) $u->base_cost],
            'price'      => ['selling' => $u->selling_price !== null ? (float) $u->selling_price : null, 'wholesale' => $u->wholesale_price !== null ? (float) $u->wholesale_price : null],
            'margin'     => (bool) $u->is_margin_scheme,
            'saleable'   => (bool) $u->is_saleable,
            'purchase'   => $u->purchaseOrder ? [
                'po_number' => $u->purchaseOrder->po_number,
                'uuid'      => $u->purchaseOrder->uuid,
                'date'      => $u->purchaseOrder->order_date?->format('Y-m-d'),
                'vendor'    => $u->purchaseOrder->vendor?->company_name ?? $u->purchaseOrder->vendor?->name ?? '—',
            ] : null,
            'sales'  => $sales,
            'events' => $events,
        ];
    }

    private function batchDetail(int $storeId, int $id): array
    {
        $b = StockBatch::with([
                'productVariant:id,product_id,variant_name,sku,barcode',
                'productVariant.product:id,name,hsn_code',
                'purchaseOrder:id,po_number,order_date,vendor_id',
                'purchaseOrder.vendor:id,name,company_name',
            ])
            ->where('store_id', $storeId)
            ->findOrFail($id);

        // Every sale that consumed from this batch (via allocations).
        $sales = InvoiceItem::with(['invoice:id,uuid,invoice_number,invoice_date,party_type,party_id', 'invoice.party', 'batchAllocations'])
            ->whereHas('batchAllocations', fn ($q) => $q->where('stock_batch_id', $b->id))
            ->orderByDesc('id')
            ->get()
            ->map(function ($item) use ($b) {
                $inv = $item->invoice;
                $party = $inv?->party;
                $qty = $item->batchAllocations->where('stock_batch_id', $b->id)->sum('quantity');
                return [
                    'invoice_number' => $inv?->invoice_number,
                    'invoice_uuid'   => $inv?->uuid,
                    'date'           => $inv?->invoice_date?->format('Y-m-d'),
                    'customer'       => $party?->name ?? $party?->company_name ?? '—',
                    'qty'            => (int) $qty,
                    'price'          => (float) $item->unit_price,
                ];
            });

        $ledger = StockLedger::where('stock_batch_id', $b->id)
            ->orderBy('created_at')
            ->get(['transaction_type', 'quantity_delta', 'balance_after', 'created_at'])
            ->map(fn ($l) => [
                'type'   => $l->transaction_type,
                'delta'  => (int) $l->quantity_delta,
                'balance' => (int) $l->balance_after,
                'at'     => $l->created_at?->format('Y-m-d H:i'),
            ]);

        return [
            'title'      => $b->manual_item_name ?? ($b->productVariant?->product?->name . ' · ' . $b->productVariant?->variant_name),
            'subtitle'   => $b->batch_number,
            'status'     => $b->remaining_qty > 0 ? 'in_stock' : 'empty',
            'identifiers' => ['Batch' => $b->batch_number],
            'condition'  => $b->product_condition,
            'health'     => $b->overall_health,
            'warranty'   => $b->remaining_warranty,
            'qty'        => ['received' => (int) $b->received_qty, 'remaining' => (int) $b->remaining_qty],
            'cost'       => ['landed' => (float) $b->landed_cost, 'base' => (float) $b->base_cost],
            'price'      => ['selling' => $b->selling_price !== null ? (float) $b->selling_price : null, 'wholesale' => $b->wholesale_price !== null ? (float) $b->wholesale_price : null],
            'margin'     => (bool) $b->is_margin_scheme,
            'saleable'   => (bool) $b->is_saleable,
            'purchase'   => $b->purchaseOrder ? [
                'po_number' => $b->purchaseOrder->po_number,
                'uuid'      => $b->purchaseOrder->uuid,
                'date'      => $b->purchaseOrder->order_date?->format('Y-m-d'),
                'vendor'    => $b->purchaseOrder->vendor?->company_name ?? $b->purchaseOrder->vendor?->name ?? '—',
            ] : null,
            'sales'  => $sales,
            'events' => $ledger,
        ];
    }

    private function variantDetail(int $storeId, int $id): array
    {
        $v = ProductVariant::with('product:id,name,hsn_code')
            ->findOrFail($id);

        $units = StockUnit::where('store_id', $storeId)
            ->where('product_variant_id', $id)
            ->select('id', 'imei1', 'serial_number', 'status', 'device_condition')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn ($u) => [
                'kind' => 'unit', 'id' => $u->id,
                'label' => $u->imei1 ?? $u->serial_number ?? "#{$u->id}",
                'status' => $u->status, 'meta' => $u->device_condition,
            ]);

        $batches = StockBatch::where('store_id', $storeId)
            ->where('product_variant_id', $id)
            ->select('id', 'batch_number', 'received_qty', 'remaining_qty', 'product_condition')
            ->orderByDesc('id')
            ->limit(50)
            ->get()
            ->map(fn ($b) => [
                'kind' => 'batch', 'id' => $b->id,
                'label' => $b->batch_number,
                'status' => $b->remaining_qty > 0 ? 'in_stock' : 'empty',
                'meta' => "{$b->remaining_qty}/{$b->received_qty} left · {$b->product_condition}",
            ]);

        return [
            'title'    => $v->product?->name . ' · ' . $v->variant_name,
            'subtitle' => $v->sku,
            'status'   => '—',
            'identifiers' => ['SKU' => $v->sku, 'Barcode' => $v->barcode],
            'units'    => $units,
            'batches'  => $batches,
        ];
    }
}

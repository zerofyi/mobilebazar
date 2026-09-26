<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\StorePurchaseRequest;
use App\Models\DeviceCondition;
use App\Models\PurchaseOrder;
use App\Services\PurchaseService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class PurchaseEntryController extends Controller
{
    public function __construct(
        private readonly PurchaseService $purchaseService
    ) {}

    /*
    |--------------------------------------------------------------------------
    | index — placeholder; real list lives in PurchaseController
    |--------------------------------------------------------------------------
    */
    public function index(): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $stats   = $this->purchaseService->indexStats($store->id);
        $filters = request()->only(['search', 'status', 'bill_type', 'payment_status', 'date_from', 'date_to', 'party_type']);

        $purchases = PurchaseOrder::with(['vendor', 'items'])
            ->where('store_id', $store->id)
            ->when($filters['search']         ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2->where('po_number', 'like', "%{$v}%")->orWhere('vendor_invoice_no', 'like', "%{$v}%")))
            ->when($filters['status']         ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['bill_type']      ?? null, fn ($q, $v) => $q->where('bill_type', $v))
            ->when($filters['payment_status'] ?? null, fn ($q, $v) => $q->where('payment_status', $v))
            ->when($filters['party_type']     ?? null, fn ($q, $v) => $q->where('vendor_type', $v === 'supplier' ? 'App\\Models\\Supplier' : 'App\\Models\\Customer'))
            ->when($filters['date_from']      ?? null, fn ($q, $v) => $q->whereDate('order_date', '>=', $v))
            ->when($filters['date_to']        ?? null, fn ($q, $v) => $q->whereDate('order_date', '<=', $v))
            ->latest('order_date')->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('App/Purchases/Index', [
            'purchases' => $purchases->through(fn ($po) => $this->serializeForIndex($po)),
            'stats'     => $stats,
            'filters'   => $filters,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | create — purchase entry form
    |--------------------------------------------------------------------------
    */
    public function create(): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $deviceConditions = DeviceCondition::select('id', 'code', 'label', 'grade_multiplier')
            ->orderBy('id')
            ->get();

        return Inertia::render('Billing/PurchaseEntry/Index', [
            'store'            => $store,
            'deviceConditions' => $deviceConditions,
            'initialPoNumber'  => $this->purchaseService->previewPoNumber($store->id),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | store — validate → idempotency guard → service → redirect
    |--------------------------------------------------------------------------
    */
    public function store(StorePurchaseRequest $request): RedirectResponse
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        // ── Idempotency guard ────────────────────────────────────────────────
        // If the client retries with the same key (double-click, network hiccup,
        // Inertia reload) we return the existing record without re-processing.
        $existing = PurchaseOrder::where('idempotency_key', $request->idempotency_key)
            ->where('store_id', $store->id)
            ->first();

        if ($existing) {
            return redirect()
                ->route('app.purchases.show', $existing->uuid)
                ->with('flash', [
                    'type'     => 'info',
                    'message'  => "Purchase {$existing->po_number} was already saved.",
                    'replayed' => true,
                ]);
        }

        $purchase = $this->purchaseService->processPurchase(
            store: $store,
            user:  $user,
            data:  $request->validated(),
        );

        $message = $request->boolean('is_draft')
            ? "Draft {$purchase->po_number} saved."
            : "Purchase {$purchase->po_number} posted successfully.";

        // Bug fix #4: was redirecting to index with a uuid param (wrong route).
        return redirect()
            ->route('app.purchases.show', $purchase->uuid)
            ->with('flash', ['type' => 'success', 'message' => $message]);
    }

    /*
    |--------------------------------------------------------------------------
    | show — full purchase detail
    |--------------------------------------------------------------------------
    */
    public function show(string $uuid): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $purchase = PurchaseOrder::with([
            'vendor',
            'createdBy:id,name',
            'items.productVariant:id,variant_name,sku',
            'items.stockUnits:id,purchase_order_item_id,imei1,imei2,serial_number,device_condition,overall_health,status,landed_cost,base_cost,is_margin_scheme,wholesale_price,selling_price',
            'items.stockUnits.deviceHealth:id,stock_unit_id,battery_health_pct',
            'items.stockBatches:id,purchase_order_item_id,batch_number,received_qty,remaining_qty,unit_cost,landed_cost,is_margin_scheme',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $uuid)
            ->firstOrFail();

        return Inertia::render('Billing/Purchases/Show', [
            'purchase' => $this->serializeForShow($purchase),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Private serializers (keep controller thin, no logic here)
    |--------------------------------------------------------------------------
    */

    private function serializeForIndex(PurchaseOrder $po): array
    {
        $vendor     = $po->vendor;
        $isSupplier = $vendor instanceof \App\Models\Supplier;

        return [
            'id'                => $po->id,
            'uuid'              => $po->uuid,
            'po_number'         => $po->po_number,
            'vendor_invoice_no' => $po->vendor_invoice_no,
            'bill_type'         => $po->bill_type,
            'is_gst_billed'     => (bool) $po->is_gst_billed,
            'order_date'        => $po->order_date?->toDateString(),
            'status'            => $po->status,
            'payment_status'    => $po->payment_status,
            'payment_mode'      => $po->payment_mode,
            'grand_total'       => (float) $po->grand_total,
            'paid_amount'       => (float) $po->paid_amount,
            'due_amount'        => (float) $po->due_amount,
            'item_count'        => $po->items->count(),
            'vendor'            => $vendor ? [
                'name'  => $isSupplier ? ($vendor->company_name ?: $vendor->name) : $vendor->name,
                'type'  => $isSupplier ? 'supplier' : 'customer',
                'gstin' => $vendor->gstin ?? null,
                'phone' => $vendor->phone_primary ?? $vendor->phone ?? null,
            ] : null,
        ];
    }

    private function serializeForShow(PurchaseOrder $po): array
    {
        $vendor     = $po->vendor;
        $isSupplier = $vendor instanceof \App\Models\Supplier;

        return [
            'id'                  => $po->id,
            'uuid'                => $po->uuid,
            'po_number'           => $po->po_number,
            'vendor_invoice_no'   => $po->vendor_invoice_no,
            'bill_type'           => $po->bill_type,
            'is_gst_billed'       => (bool) $po->is_gst_billed,
            'is_intra_state'      => (bool) $po->is_intra_state,
            'order_date'          => $po->order_date?->toDateString(),
            'type'                => $po->type,
            'status'              => $po->status,
            'payment_status'      => $po->payment_status,
            'payment_mode'        => $po->payment_mode,
            'notes'               => $po->notes,
            'subtotal'            => (float) $po->subtotal,
            'tax_amount'          => (float) $po->tax_amount,
            'discount_amount'     => (float) $po->discount_amount,
            'shipping_charge'     => (float) $po->shipping_charge,
            'grand_total'         => (float) $po->grand_total,
            'paid_amount'         => (float) $po->paid_amount,
            'due_amount'          => (float) $po->due_amount,
            'created_at'          => $po->created_at?->toIso8601String(),
            'created_by'          => $po->createdBy?->name,
            'vendor'              => $vendor ? [
                'id'      => $vendor->id,
                'name'    => $isSupplier ? ($vendor->company_name ?: $vendor->name) : $vendor->name,
                'type'    => $isSupplier ? 'supplier' : 'customer',
                'gstin'   => $vendor->gstin ?? null,
                'phone'   => $vendor->phone_primary ?? $vendor->phone ?? null,
                'email'   => $vendor->email ?? null,
                'address' => $vendor->address_snapshot ?? null,
            ] : null,
            'items' => $po->items->map(fn ($item) => [
                'id'               => $item->id,
                'product_name'     => $item->productVariant?->variant_name ?? $item->manual_item_name ?? '—',
                'sku'              => $item->productVariant?->sku ?? null,
                'is_serialized'    => $item->stockUnits->isNotEmpty(),
                'is_margin_scheme' => (bool) $item->is_margin_scheme,
                'tax_type'         => $item->tax_type,
                'tax_pct'          => (float) $item->tax_pct,
                'tax_amount'       => (float) $item->tax_amount,
                'ordered_qty'      => $item->ordered_qty,
                'unit_cost'        => (float) $item->unit_cost,
                'discount_amount'  => (float) $item->discount_amount,
                'base_cost'        => (float) $item->base_cost,
                'landed_cost'      => (float) $item->landed_cost,
                'line_total'       => (float) $item->line_total,
                'units'   => $item->stockUnits->map(fn ($u) => [
                    'id'               => $u->id,
                    'imei1'            => $u->imei1,
                    'imei2'            => $u->imei2,
                    'serial_number'    => $u->serial_number,
                    'device_condition' => $u->device_condition,
                    'overall_health'   => $u->overall_health,
                    'battery_health'   => $u->deviceHealth?->battery_health_pct,
                    'status'           => $u->status,
                    'landed_cost'      => (float) $u->landed_cost,
                    'is_margin_scheme' => (bool) $u->is_margin_scheme,
                    'wholesale_price'  => $u->wholesale_price  ? (float) $u->wholesale_price  : null,
                    'selling_price'    => $u->selling_price    ? (float) $u->selling_price    : null,
                ])->values(),
                'batches' => $item->stockBatches->map(fn ($b) => [
                    'id'            => $b->id,
                    'batch_number'  => $b->batch_number,
                    'received_qty'  => $b->received_qty,
                    'remaining_qty' => $b->remaining_qty,
                    'unit_cost'     => (float) $b->unit_cost,
                    'landed_cost'   => (float) $b->landed_cost,
                ])->values(),
            ])->values(),
        ];
    }
}

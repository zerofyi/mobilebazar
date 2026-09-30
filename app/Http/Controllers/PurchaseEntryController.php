<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Http\Requests\Billing\StorePurchaseRequest;
use App\Models\DeviceCondition;
use App\Models\PurchaseOrder;
use App\Models\Store;
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

        $filters = request()->only(['search', 'status', 'bill_type', 'payment_status', 'date_from', 'date_to', 'party_type']);

        $purchases = PurchaseOrder::with(['vendor', 'items'])
            ->where('store_id', $store->id)
            ->when($filters['search']         ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2->where('po_number', 'like', "%{$v}%")->orWhere('vendor_invoice_no', 'like', "%{$v}%")))
            ->when($filters['status']         ?? null, fn ($q, $v) => $q->where('status', $v))
            ->when($filters['bill_type']      ?? null, fn ($q, $v) => $q->where('bill_type', $v))
            ->when($filters['payment_status'] ?? null, fn ($q, $v) => $q->where('payment_status', $v))
            ->when($filters['party_type']     ?? null, fn ($q, $v) => $q->where('vendor_type', $v === 'supplier' ? \App\Models\Supplier::class : \App\Models\Customer::class))
            ->when($filters['date_from']      ?? null, fn ($q, $v) => $q->whereDate('order_date', '>=', $v))
            ->when($filters['date_to']        ?? null, fn ($q, $v) => $q->whereDate('order_date', '<=', $v))
            ->latest('order_date')->latest('id')
            ->paginate(25)
            ->withQueryString();

        $summary = [
            'total_count'   => $purchases->total(),
            'total_spend'   => (float) PurchaseOrder::where('store_id', $store->id)->sum('grand_total'),
            'total_due'     => (float) PurchaseOrder::where('store_id', $store->id)->sum('due_amount'),
            'overdue_due'   => (float) PurchaseOrder::where('store_id', $store->id)->where('due_amount', '>', 0)->where('due_date', '<', now())->sum('due_amount'),
            'itc_claimable' => (float) PurchaseOrder::where('store_id', $store->id)->where('is_gst_billed', true)->sum('tax_amount'),
        ];

        return Inertia::render('App/Purchases/Index', [
            'purchases' => $purchases->through(fn ($po) => $this->serializeForIndex($po)),
            'summary'   => $summary,
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
            ->route('app.purchases.index', $purchase->uuid)
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
            'approvedBy:id,name',
            'items.productVariant:id,variant_name,sku',
            'items.stockUnits:id,purchase_order_item_id,imei1,imei2,serial_number,device_condition,overall_health,status,landed_cost,base_cost,is_margin_scheme,wholesale_price,selling_price',
            'items.stockUnits.deviceHealth:id,stock_unit_id,battery_health_pct',
            'items.stockBatches:id,purchase_order_item_id,batch_number,received_qty,remaining_qty,landed_cost,is_margin_scheme',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $uuid)
            ->firstOrFail();

        return Inertia::render('App/Purchases/Show', [
            'purchase' => $this->serializeForShow($purchase),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | print — Thermal / A4 Purchase Document Print View
    |--------------------------------------------------------------------------
    */
    public function print(string $uuid): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $purchase = PurchaseOrder::with([
            'vendor.address',
            'createdBy:id,name',
            'items.productVariant.product.taxCategory',
            'items.stockUnits' => function ($query) {
                $query->select([
                    'id',
                    'purchase_order_item_id',
                    'imei1',
                    'imei2',
                    'serial_number',
                    'device_condition',
                    'overall_health',
                    'warranty_expiry_date',
                    'remaining_warranty',
                    'is_margin_scheme',
                ]);
            },
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $uuid)
            ->firstOrFail();

        return Inertia::render('Billing/PurchaseEntry/Print', [
            'purchase' => $this->serializeForPrint($purchase, $store),
            'store'    => [
                'name'    => $store->name,
                'phone'   => $store->phone ?? $store->phone_primary ?? null,
                'email'   => $store->email ?? null,
                'gstin'   => $store->gstin ?? null,
                'state'   => $store->address?->state ?? null,
                'address' => $store->address?->formatted_address ?? $store->location_address ?? null,
            ],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Private serializers (keep controller thin, no logic here)
    |--------------------------------------------------------------------------
    */

    /**
     * Serialize purchase model for index table.
     */
    protected function serializeForIndex(PurchaseOrder $po): array
    {
        return [
            'id'                => $po->id,
            'uuid'              => $po->uuid,
            'po_number'         => $po->po_number,
            'vendor_invoice_no' => $po->vendor_invoice_no,
            'bill_type'         => $po->bill_type,
            'is_gst_billed'     => (bool) $po->is_gst_billed,
            'is_intra_state'    => (bool) $po->is_intra_state,
            'order_date'        => $po->order_date?->format('Y-m-d'),
            'due_date'          => $po->due_date?->format('Y-m-d'),
            'status'            => $po->status,
            'payment_status'    => $po->payment_status,
            'payment_mode'      => $po->payment_mode,

            // Added financial breakdown variables
            'subtotal'          => (float) $po->subtotal,
            'tax_amount'        => (float) $po->tax_amount,
            'discount_amount'   => (float) $po->discount_amount,
            'shipping_charge'   => (float) $po->shipping_charge,
            'grand_total'       => (float) $po->grand_total,
            'paid_amount'       => (float) $po->paid_amount,
            'due_amount'        => (float) $po->due_amount,
            'item_count'        => $po->items->count(),

            'vendor' => $po->vendor ? [
                'id'      => $po->vendor->id,
                'name'    => $po->vendor->name,
                'type'    => $po->vendor instanceof \App\Models\Supplier ? 'supplier' : 'customer',
                'gstin'   => $po->vendor->gstin ?? null,
                'phone'   => $po->vendor->phone_primary ?? $po->vendor->phone ?? null,
                'address' => [
                    'village_or_area' => $po->vendor->village_or_area ?? null,
                    'district'        => $po->vendor->district ?? null,
                ],
            ] : null,
        ];
    }

    private function serializeForShow(PurchaseOrder $po): array
    {
        $vendor     = $po->vendor;
        $isSupplier = $vendor instanceof \App\Models\Supplier;

        // Formats vendor address safely into a single string to avoid React rendering crash
        $addressObj = $vendor?->address_snapshot ?? $vendor?->address;
        $formattedAddress = null;

        if (is_string($addressObj)) {
            $formattedAddress = $addressObj;
        } elseif (is_array($addressObj) || is_object($addressObj)) {
            $addr = (array) $addressObj;
            $formattedAddress = implode(', ', array_filter([
                $addr['line1'] ?? $addr['village_or_area'] ?? null,
                $addr['city'] ?? $addr['district'] ?? null,
                $addr['state'] ?? null,
                $addr['postal_code'] ?? null,
            ]));
        }

        return [
            'id'                    => $po->id,
            'uuid'                  => $po->uuid,
            'po_number'             => $po->po_number,
            'vendor_invoice_no'     => $po->vendor_invoice_no,
            'bill_type'             => $po->bill_type,
            'is_gst_billed'         => (bool) $po->is_gst_billed,
            'is_intra_state'        => (bool) $po->is_intra_state,
            'order_date'            => $po->order_date?->toDateString(),
            'due_date'              => $po->due_date?->toDateString(),
            'type'                  => $po->type,
            'status'                => $po->status,
            'payment_status'        => $po->payment_status,
            'payment_mode'          => $po->payment_mode,
            'notes'                 => $po->notes,
            'subtotal'              => (float) $po->subtotal,
            'tax_amount'            => (float) $po->tax_amount,
            'discount_amount'       => (float) $po->discount_amount,
            'shipping_charge'       => (float) $po->shipping_charge,
            'grand_total'           => (float) $po->grand_total,
            'paid_amount'           => (float) $po->paid_amount,
            'due_amount'            => (float) $po->due_amount,
            'invoice_document_path' => $po->invoice_document_path,
            'created_at'            => $po->created_at?->toIso8601String(),
            'created_by'            => $po->createdBy?->name,
            'approved_by'           => $po->approvedBy?->name,
            'approved_at'           => $po->approved_at?->toIso8601String(),
            'vendor'                => $vendor ? [
                'id'      => $vendor->id,
                'name'    => $isSupplier ? ($vendor->company_name ?: $vendor->name) : $vendor->name,
                'type'    => $isSupplier ? 'supplier' : 'customer',
                'gstin'   => $vendor->gstin ?? null,
                'phone'   => $vendor->phone_primary ?? $vendor->phone ?? null,
                'email'   => $vendor->email ?? null,
                'address' => $formattedAddress,
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
                    'landed_cost'   => (float) $b->landed_cost,
                ])->values(),
            ])->values(),
        ];
    }

    private function serializeForPrint(PurchaseOrder $po, Store $store): array
    {
        $vendor     = $po->vendor;
        $isSupplier = $vendor instanceof \App\Models\Supplier;

        // Resolve vendor state for Intra/Inter-state GST determination
        $vendorGstin = $vendor?->gstin ?? null;
        $vendorAddress = $vendor?->address_snapshot ?? $vendor?->address?->formatted_address ?? null;
        $vendorState = $vendor?->address?->state ?? null;

        if ($vendorGstin && strlen($vendorGstin) >= 2) {
            $vendorStateCode = substr($vendorGstin, 0, 2);
            $storeStateCode  = $store->gstin ? substr($store->gstin, 0, 2) : null;
            $isIntraState    = $storeStateCode ? ($vendorStateCode === $storeStateCode) : true;
        } else {
            $isIntraState = $po->is_intra_state ?? true;
        }

        return [
            'id'                => $po->id,
            'uuid'              => $po->uuid,
            'po_number'         => $po->po_number,
            'vendor_invoice_no' => $po->vendor_invoice_no,
            'bill_type'         => $po->bill_type, // 'po' or 'pv'
            'is_gst_billed'     => (bool) $po->is_gst_billed,
            'is_intra_state'    => $isIntraState,
            'order_date'        => $po->order_date?->format('d M Y'),
            'payment_status'    => $po->payment_status,
            'payment_mode'      => $po->payment_mode,
            'subtotal'          => (float) $po->subtotal,
            'tax_amount'        => (float) $po->tax_amount,
            'discount_amount'   => (float) $po->discount_amount,
            'shipping_charge'   => (float) $po->shipping_charge,
            'grand_total'       => (float) $po->grand_total,
            'paid_amount'       => (float) $po->paid_amount,
            'due_amount'        => (float) $po->due_amount,
            'created_by'        => $po->createdBy?->name ?? 'System Admin',
            'notes'             => $po->notes,
            'vendor'            => $vendor ? [
                'name'               => $isSupplier ? ($vendor->company_name ?: $vendor->name) : $vendor->name,
                'contact_person'     => $isSupplier ? $vendor->name : ($vendor->care_of ?? null),
                'gstin'              => $vendorGstin,
                'pan'                => $vendor->pan_number ?? null,
                'phone'              => $vendor->phone_primary ?? $vendor->phone ?? null,
                'address'            => $vendorAddress,
                'state'              => $vendorState,
                'is_registered'      => !empty($vendorGstin),
            ] : null,
            'items' => $po->items->map(function ($item) {
                $variant = $item->productVariant;
                $product = $variant?->product;

                return [
                    'id'               => $item->id,
                    'product_name'     => $variant?->variant_name ? ($product?->name . ' (' . $variant->variant_name . ')') : ($item->manual_item_name ?? 'Item'),
                    'sku'              => $variant?->sku ?? 'N/A',
                    'hsn_code'         => $variant?->hsn_code ?? $product?->hsn_code ?? '8517',
                    'qty'              => $item->ordered_qty,
                    'unit_cost'        => (float) $item->unit_cost,
                    'base_cost'        => (float) $item->base_cost,
                    'landed_cost'      => (float) $item->landed_cost,
                    'tax_pct'          => (float) $item->tax_pct,
                    'tax_type'         => $item->tax_type,
                    'tax_amount'       => (float) $item->tax_amount,
                    'discount_amount'  => (float) $item->discount_amount,
                    'line_total'       => (float) $item->line_total,
                    'is_margin_scheme' => (bool) $item->is_margin_scheme,
                    'units'            => $item->stockUnits->map(fn ($u) => [
                        'imei1'            => $u->imei1,
                        'imei2'            => $u->imei2,
                        'serial'           => $u->serial_number,
                        'condition'        => $u->device_condition ?? 'NEW',
                        'quality'          => $u->overall_health,
                        'warranty'         => $u->remaining_warranty,
                        'is_margin_scheme' => (bool) $u->is_margin_scheme,
                    ])->values(),
                ];
            })->values(),
        ];
    }
}

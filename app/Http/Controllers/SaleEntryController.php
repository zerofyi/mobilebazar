<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Billing\StoreSaleRequest;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\ProductVariant;
use App\Models\StockBatch;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\SaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class SaleEntryController extends Controller
{
    public function __construct(
        private readonly SaleService $saleService
    ) {}

    /*
    |--------------------------------------------------------------------------
    | index — sales list
    |--------------------------------------------------------------------------
    */
    public function index(): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $filters = request()->only(['search', 'payment_status', 'date_from', 'date_to']);

        $sales = Invoice::with(['party'])
            ->withCount('items')
            ->where('store_id', $store->id)
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                ->where('invoice_number', 'like', "%{$v}%")
                ->orWhereHasMorph('party', [Customer::class, Supplier::class], function ($q3, $type) use ($v) {
                    $q3->where('name', 'like', "%{$v}%");
                    if ($type === Supplier::class) {
                        $q3->orWhere('company_name', 'like', "%{$v}%");
                    }
                })))
            ->when($filters['payment_status'] ?? null, fn ($q, $v) => $q->where('payment_status', $v))
            ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->whereDate('invoice_date', '>=', $v))
            ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->whereDate('invoice_date', '<=', $v))
            ->latest('invoice_date')->latest('id')
            ->paginate(25)
            ->withQueryString();

        $summary = [
            'invoice_count' => $sales->total(),
            'total_revenue' => (float) Invoice::where('store_id', $store->id)->sum('grand_total'),
            'total_due'     => (float) Invoice::where('store_id', $store->id)->sum('due_amount'),
            'total_tax'     => (float) Invoice::where('store_id', $store->id)->where('is_gst_billed', true)->sum('tax_amount'),
        ];

        return Inertia::render('App/Sales/Index', [
            'sales'   => $sales->through(fn ($inv) => $this->serializeForIndex($inv)),
            'summary' => $summary,
            'filters' => $filters,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | create — POS sale screen
    |--------------------------------------------------------------------------
    */
    public function create(): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $categories = Category::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->select('id', 'name')
            ->get();

        return Inertia::render('Billing/SaleEntry/Index', [
            'store' => [
                'id'               => $store->id,
                'code'             => $store->code,
                'name'             => $store->name,
                'gstin'            => $store->gstin,
                'is_gst_registered' => (bool) $store->is_gst_registered,
                // Derived — there is no gst_bill_sale / state_code column on stores.
                'state_code'       => $store->gstin ? substr($store->gstin, 0, 2) : $store->address?->state_code,
            ],
            'categories'           => $categories,
            'initialInvoiceNumber' => $this->saleService->previewInvoiceNumber($store->id),
            'initialProducts'      => $this->initialProducts($store),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | stockSearch — the POS omnibox.
    |
    | One query across IMEI1 / IMEI2 / serial / barcode / SKU / names, scoped to
    | this store's AVAILABLE stock only. An exact IMEI/serial hit returns the
    | unit directly (scanner fast-path → added to cart instantly); a variant hit
    | returns availability plus up to 25 pickable units for serialized variants.
    |--------------------------------------------------------------------------
    */
    public function stockSearch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:50'],
        ]);

        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $q    = trim($validated['q']);
        $like = "%{$q}%";

        // 1. Exact unit hit (barcode scanner fast-path).
        $unit = StockUnit::query()
            ->where('store_id', $store->id)
            ->where('status', 'available')
            ->where('is_saleable', true)
            ->where(fn ($w) => $w
                ->where('imei1', $q)
                ->orWhere('imei2', $q)
                ->orWhere('serial_number', $q))
            ->with(['productVariant.product.taxCategory', 'productVariant.product.images'])
            ->first();

        if ($unit && $unit->productVariant) {
            $shaped = $this->shapeVariant($unit->productVariant, $store->id);
            // shapeVariant's availability subqueries aren't on this instance —
            // count directly for the exact-hit path.
            $shaped['available_qty'] = StockUnit::query()
                ->where('store_id', $store->id)
                ->where('product_variant_id', $unit->product_variant_id)
                ->where('status', 'available')
                ->where('is_saleable', true)
                ->count();
            $shaped['exact_unit'] = [
                'id'               => $unit->id,
                'imei1'            => $unit->imei1,
                'imei2'            => $unit->imei2,
                'serial_number'    => $unit->serial_number,
                'device_condition' => $unit->device_condition,
                'overall_health'   => $unit->overall_health,
                'landed_cost'      => (float) $unit->landed_cost,
                'is_margin_scheme' => (bool) $unit->is_margin_scheme,
                'selling_price'    => $unit->selling_price !== null ? (float) $unit->selling_price : null,
                'wholesale_price'  => $unit->wholesale_price !== null ? (float) $unit->wholesale_price : null,
            ];

            return response()->json(['results' => [$shaped]]);
        }

        // 2. Variant search (mirrors ProductController@searchVariants) + availability.
        // Single query: relations eager-loaded, availability via correlated
        // subqueries (same zero-N+1 pattern as create()'s productQuery).
        $variants = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('tax_categories', 'tax_categories.id', '=', 'products.tax_category_id')
            ->where('product_variants.is_active', true)
            ->whereNull('product_variants.deleted_at')
            ->where('products.is_active', true)
            ->whereNull('products.deleted_at')
            ->where(fn ($w) => $w
                ->where('product_variants.sku', 'like', "{$q}%")
                ->orWhere('product_variants.barcode', 'like', "{$q}%")
                ->orWhere('product_variants.variant_name', 'like', $like)
                ->orWhere('products.name', 'like', $like))
            ->with(['product.taxCategory', 'product.images', 'product.category'])
            ->select('product_variants.*')
            ->selectRaw('COALESCE(tax_categories.tax_percent, 0) as tax_pct')
            ->selectSub(
                StockUnit::where('store_id', $store->id)
                    ->whereColumn('stock_units.product_variant_id', 'product_variants.id')
                    ->where('stock_units.status', 'available')
                    ->where('stock_units.is_saleable', true)
                    ->selectRaw('COUNT(*)'),
                'units_available'
            )
            ->selectSub(
                StockSnapshot::where('store_id', $store->id)
                    ->whereColumn('stock_snapshots.product_variant_id', 'product_variants.id')
                    ->select('stock_snapshots.quantity_on_hand'),
                'snapshot_qty'
            )
            ->limit(12)
            ->get();

        // One query for all variants' batch costings (bulk preview only).
        $batchMap = StockBatch::query()
            ->where('store_id', $store->id)
            ->whereIn('product_variant_id', $variants->pluck('id')->all())
            ->where('remaining_qty', '>', 0)
            ->get(['product_variant_id', 'remaining_qty', 'landed_cost', 'is_margin_scheme'])
            ->groupBy('product_variant_id');

        $results = $variants->map(function (ProductVariant $variant) use ($store, $batchMap) {
            $shaped = $this->shapeVariant($variant, (int) $store->id, $batchMap[$variant->id] ?? collect());
            $shaped['tax_pct'] = (float) $variant->tax_pct;

            return $shaped;
        })->values()->all();

        return response()->json(['results' => $results]);
    }

    /*
    |--------------------------------------------------------------------------
    | store — validate → idempotency guard → service → redirect
    |--------------------------------------------------------------------------
    */
    public function store(StoreSaleRequest $request): RedirectResponse
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        // ── Idempotency guard ────────────────────────────────────────────────
        // Double-click / network retry with the same key returns the original
        // invoice without re-processing.
        $existing = Invoice::where('idempotency_key', $request->idempotency_key)
            ->where('store_id', $store->id)
            ->first();

        if ($existing) {
            return redirect()
                ->route('app.sales.show', $existing->uuid)
                ->with('flash', [
                    'type'     => 'info',
                    'message'  => "Sale {$existing->invoice_number} was already saved.",
                    'replayed' => true,
                ]);
        }

        $invoice = $this->saleService->processSale(
            store: $store,
            user:  $user,
            data:  $request->validated(),
        );

        return redirect()
            ->route('app.sales.show', $invoice->uuid)
            ->with('flash', ['type' => 'success', 'message' => "Sale {$invoice->invoice_number} completed."]);
    }

    /*
    |--------------------------------------------------------------------------
    | show — invoice detail
    |--------------------------------------------------------------------------
    */
    public function show(string $sale): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $invoice = Invoice::with([
            'party',
            'createdBy:id,name',
            'items.productVariant:id,product_id,variant_name,sku',
            'items.productVariant.product:id,hsn_code,is_serialized',
            'items.stockUnit:id,imei1,imei2,serial_number,device_condition,landed_cost,is_margin_scheme',
            'items.batchAllocations.stockBatch:id,batch_number',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $sale)
            ->firstOrFail();

        return Inertia::render('App/Sales/Show', [
            'invoice' => $this->serializeForShow($invoice),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | print — GST tax invoice print view
    |--------------------------------------------------------------------------
    */
    public function print(string $sale): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $invoice = Invoice::with([
            'party',
            'createdBy:id,name',
            'items.productVariant.product.taxCategory',
            'items.stockUnit:id,imei1,serial_number,device_condition',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $sale)
            ->firstOrFail();

        return Inertia::render('Billing/SaleEntry/Print', [
            'invoice' => $this->serializeForPrint($invoice, $store),
            'store'   => [
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
    | Private helpers
    |--------------------------------------------------------------------------
    */

    private function initialProducts(Store $store): array
    {
        $variants = $this->productQuery($store)->limit(48)->get();

        $batchMap = StockBatch::query()
            ->where('store_id', $store->id)
            ->whereIn('product_variant_id', $variants->pluck('id')->all())
            ->where('remaining_qty', '>', 0)
            ->get(['product_variant_id', 'remaining_qty', 'landed_cost', 'is_margin_scheme'])
            ->groupBy('product_variant_id');

        return $variants->map(
            fn (ProductVariant $v) => $this->shapeVariant($v, (int) $store->id, $batchMap[$v->id] ?? collect())
        )->values()->all();
    }

    private function productQuery(Store $store)
    {
        $storeId = $store->id;

        return ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->where('product_variants.is_active', true)
            ->where('products.is_active', true)
            ->with(['product.taxCategory', 'product.images', 'product.category'])
            ->select('product_variants.*')
            ->selectSub(
                StockUnit::where('store_id', $storeId)
                    ->whereColumn('stock_units.product_variant_id', 'product_variants.id')
                    ->where('stock_units.status', 'available')
                    ->where('stock_units.is_saleable', true)
                    ->selectRaw('COUNT(*)'),
                'units_available'
            )
            ->selectSub(
                StockSnapshot::where('store_id', $storeId)
                    ->whereColumn('stock_snapshots.product_variant_id', 'product_variants.id')
                    ->select('stock_snapshots.quantity_on_hand'),
                'snapshot_qty'
            )
            ->orderBy('products.is_featured', 'desc')
            ->orderBy('product_variants.id', 'desc');
    }

    /**
     * Shape shared by create() initial products and stockSearch() results.
     * availability is computed by productQuery()'s correlated subqueries —
     * zero extra queries.
     *
     * Margin previews are approximations for the UI fiscal engine only — the
     * server re-evaluates every line from DB truth on submit:
     *   serialized → first available unit's cost/flag (unit-level preview
     *                takes over once units are picked);
     *   bulk       → qty-weighted average landed cost across batches with
     *                stock on hand; margin flag if any such batch is flagged.
     */
    private function shapeVariant(ProductVariant $variant, int $storeId, $batches = null): array
    {
        $product      = $variant->product;
        $isSerialized = (bool) $product->is_serialized;

        $availableQty = $isSerialized
            ? (int) ($variant->units_available ?? 0)
            : (int) ($variant->snapshot_qty ?? 0);

        $units = collect();
        $landedPreview = 0.0;
        $marginPreview = false;

        if ($isSerialized) {
            $units = StockUnit::query()
                ->where('store_id', $storeId)
                ->where('product_variant_id', $variant->id)
                ->where('status', 'available')
                ->where('is_saleable', true)
                ->orderBy('id')
                ->limit(25)
                ->get([
                    'id', 'imei1', 'imei2', 'serial_number',
                    'device_condition', 'overall_health',
                    'landed_cost', 'is_margin_scheme',
                    'selling_price', 'wholesale_price',
                ]);

            $first = $units->first();
            $landedPreview = (float) ($first->landed_cost ?? 0);
            $marginPreview = (bool) ($first->is_margin_scheme ?? false);
        } else {
            $batches ??= StockBatch::query()
                ->where('store_id', $storeId)
                ->where('product_variant_id', $variant->id)
                ->where('remaining_qty', '>', 0)
                ->get(['remaining_qty', 'landed_cost', 'is_margin_scheme']);

            $qty = (float) $batches->sum('remaining_qty');
            if ($qty > 0) {
                $landedPreview = round(
                    (float) $batches->sum(fn ($b) => (float) $b->remaining_qty * (float) $b->landed_cost) / $qty,
                    2
                );
                $marginPreview = $batches->contains(fn ($b) => (bool) $b->is_margin_scheme);
            }
        }

        return [
            'variant_id'     => $variant->id,
            'product_name'   => $product->name ?? '',
            'variant_name'   => $variant->variant_name,
            'sku'            => $variant->sku,
            'barcode'        => $variant->barcode,
            'hsn_code'       => $variant->hsn_code ?? $product->hsn_code,
            'is_serialized'  => $isSerialized,
            'mrp'            => (float) $variant->mrp,
            'selling_price'  => (float) $variant->selling_price,
            'min_selling_price' => (float) ($variant->min_selling_price ?: $variant->selling_price),
            'tax_pct'        => (float) ($product->taxCategory?->tax_percent ?? 0),
            'tax_type'       => 'inclusive',
            'available_qty'  => $availableQty,
            'img'            => $product->images->first()?->image_path
                ? '/storage/' . ltrim($product->images->first()->image_path, '/')
                : null,
            'landed_cost_preview'      => $landedPreview,
            'is_margin_scheme_preview' => $marginPreview,
            'exact_unit'     => null,
            'units'          => $units->map(fn (StockUnit $u) => [
                'id'               => $u->id,
                'imei1'            => $u->imei1,
                'imei2'            => $u->imei2,
                'serial_number'    => $u->serial_number,
                'device_condition' => $u->device_condition,
                'overall_health'   => $u->overall_health,
                'landed_cost'      => (float) $u->landed_cost,
                'is_margin_scheme' => (bool) $u->is_margin_scheme,
                'selling_price'    => $u->selling_price !== null ? (float) $u->selling_price : null,
                'wholesale_price'  => $u->wholesale_price !== null ? (float) $u->wholesale_price : null,
            ])->values()->all(),
        ];
    }

    /**
     * Uniform party card for list/detail/print serializers.
     * Supplier ("party" table) → company_name ?: name, phone, gstin.
     * Customer → name, phone_primary (customers have no GSTIN column).
     */
    private function partyCard(Invoice $inv): array
    {
        $p = $inv->party;

        if (! $p) {
            return ['type' => null, 'id' => null, 'name' => '—', 'phone' => null, 'gstin' => null];
        }

        $isSupplier = $p instanceof Supplier;

        return [
            'type'  => $isSupplier ? 'supplier' : 'customer',
            'id'    => $p->id,
            'name'  => $isSupplier ? ($p->company_name ?: $p->name) : $p->name,
            'phone' => $isSupplier ? $p->phone : ($p->phone_primary ?? null),
            'gstin' => $p->gstin ?? null,
        ];
    }

    private function serializeForIndex(Invoice $inv): array
    {
        return [
            'id'             => $inv->id,
            'uuid'           => $inv->uuid,
            'invoice_number' => $inv->invoice_number,
            'invoice_date'   => $inv->invoice_date?->format('Y-m-d'),
            'invoice_type'   => $inv->invoice_type,
            'is_gst_billed'  => (bool) $inv->is_gst_billed,
            'is_intra_state' => (bool) $inv->is_intra_state,
            'payment_status' => $inv->payment_status,
            'payment_mode'   => $inv->payment_mode,
            'subtotal'       => (float) $inv->subtotal,
            'tax_amount'     => (float) $inv->tax_amount,
            'discount_amount' => (float) $inv->discount_amount,
            'shipping_charge' => (float) ($inv->shipping_charge ?? 0),
            'grand_total'    => (float) $inv->grand_total,
            'paid_amount'    => (float) $inv->paid_amount,
            'due_amount'     => (float) $inv->due_amount,
            'item_count'     => (int) ($inv->items_count ?? 0),
            'party'          => $this->partyCard($inv),
        ];
    }

    private function serializeForShow(Invoice $inv): array
    {
        return [
            'id'              => $inv->id,
            'uuid'            => $inv->uuid,
            'invoice_number'  => $inv->invoice_number,
            'invoice_date'    => $inv->invoice_date?->toDateString(),
            'invoice_type'    => $inv->invoice_type,
            'is_gst_billed'   => (bool) $inv->is_gst_billed,
            'is_intra_state'  => (bool) $inv->is_intra_state,
            'payment_status'  => $inv->payment_status,
            'payment_mode'    => $inv->payment_mode,
            'notes'           => $inv->notes,
            'subtotal'        => (float) $inv->subtotal,
            'tax_amount'      => (float) $inv->tax_amount,
            'discount_amount' => (float) $inv->discount_amount,
            'shipping_charge' => (float) ($inv->shipping_charge ?? 0),
            'round_off'       => (float) $inv->round_off,
            'grand_total'     => (float) $inv->grand_total,
            'paid_amount'     => (float) $inv->paid_amount,
            'due_amount'      => (float) $inv->due_amount,
            'created_at'      => $inv->created_at?->toIso8601String(),
            'created_by'      => $inv->createdBy?->name,
            'party'           => $this->partyCard($inv),
            'items' => $inv->items->map(function ($item) use ($inv) {
                $tax = (float) $item->tax_amount;
                $intra = (bool) $inv->is_intra_state;
                $unit = $item->stockUnit;

                return [
                    'id'               => $item->id,
                    'product_name'     => $item->productVariant?->variant_name ?? $item->manual_item_name ?? '—',
                    'sku'              => $item->productVariant?->sku,
                    'hsn_code'         => $item->productVariant?->product?->hsn_code,
                    'is_serialized'    => (bool) ($item->productVariant?->product?->is_serialized ?? $unit !== null),
                    'qty'              => $item->quantity,
                    'unit_price'       => (float) $item->unit_price,
                    'discount_amount'  => (float) $item->discount_amount,
                    'taxable_value'    => round((float) $item->line_total - $tax, 2),
                    'tax_pct'          => (float) $item->tax_pct,
                    'tax_amount'       => $tax,
                    'cgst_amount'      => $intra ? round($tax / 2, 2) : 0.0,
                    'sgst_amount'      => $intra ? round($tax / 2, 2) : 0.0,
                    'igst_amount'      => $intra ? 0.0 : $tax,
                    'line_total'       => (float) $item->line_total,
                    'is_margin_scheme' => (bool) $item->is_margin_scheme,
                    'units'            => $unit ? [[
                        'id'               => $unit->id,
                        'imei1'            => $unit->imei1,
                        'imei2'            => $unit->imei2,
                        'serial_number'    => $unit->serial_number,
                        'device_condition' => $unit->device_condition,
                        'landed_cost'      => (float) $unit->landed_cost,
                        'is_margin_scheme' => (bool) $unit->is_margin_scheme,
                    ]] : [],
                    'batch_allocations' => $item->batchAllocations->map(fn ($a) => [
                        'batch_number' => $a->stockBatch?->batch_number ?? '—',
                        'qty'          => $a->quantity,
                        'landed_cost'  => (float) $a->unit_cost,
                    ])->values()->all(),
                ];
            })->values(),
        ];
    }

    private function serializeForPrint(Invoice $inv, Store $store): array
    {
        $party = $this->partyCard($inv);
        $partyGstin = $party['gstin'];

        if ($partyGstin && strlen($partyGstin) >= 2 && $store->gstin) {
            $isIntraState = substr($partyGstin, 0, 2) === substr($store->gstin, 0, 2);
        } else {
            $isIntraState = (bool) $inv->is_intra_state;
        }

        return [
            'invoice_number'  => $inv->invoice_number,
            'invoice_date'    => $inv->invoice_date?->format('d M Y'),
            'invoice_type'    => $inv->invoice_type,
            'is_gst_billed'   => (bool) $inv->is_gst_billed,
            'is_intra_state'  => $isIntraState,
            'payment_status'  => $inv->payment_status,
            'payment_mode'    => $inv->payment_mode,
            'subtotal'        => (float) $inv->subtotal,
            'tax_amount'      => (float) $inv->tax_amount,
            'discount_amount' => (float) $inv->discount_amount,
            'shipping_charge' => (float) ($inv->shipping_charge ?? 0),
            'round_off'       => (float) $inv->round_off,
            'grand_total'     => (float) $inv->grand_total,
            'paid_amount'     => (float) $inv->paid_amount,
            'due_amount'      => (float) $inv->due_amount,
            'notes'           => $inv->notes,
            'party_name'      => $party['name'],
            'party_phone'     => $party['phone'],
            'party_gstin'     => $partyGstin,
            'party_type'      => $party['type'],
            'items' => $inv->items->map(function ($item) use ($isIntraState) {
                $variant = $item->productVariant;
                $product = $variant?->product;
                $tax = (float) $item->tax_amount;
                $imei = $item->stockUnit?->imei1 ?? $item->stockUnit?->serial_number;

                return [
                    'product_name'     => $variant?->variant_name ?? $item->manual_item_name ?? 'Item',
                    'hsn_code'         => $variant?->hsn_code ?? $product?->hsn_code,
                    'qty'              => $item->quantity,
                    'unit_price'       => (float) $item->unit_price,
                    'discount_amount'  => (float) $item->discount_amount,
                    'taxable_value'    => round((float) $item->line_total - $tax, 2),
                    'tax_pct'          => (float) $item->tax_pct,
                    'cgst_amount'      => $isIntraState ? round($tax / 2, 2) : 0.0,
                    'sgst_amount'      => $isIntraState ? round($tax / 2, 2) : 0.0,
                    'igst_amount'      => $isIntraState ? 0.0 : $tax,
                    'line_total'       => (float) $item->line_total,
                    'is_margin_scheme' => (bool) $item->is_margin_scheme,
                    'imeis'            => $imei ? [$imei] : [],
                ];
            })->values(),
        ];
    }
}

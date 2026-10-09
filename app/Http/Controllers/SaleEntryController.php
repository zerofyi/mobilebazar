<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Billing\StoreSaleRequest;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\ProductVariant;
use App\Models\StockBatch;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\SaleGstEvaluationService;
use App\Services\SaleService;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
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
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | stockSearch — the POS omnibox, mode-scoped.
    |
    | mode=serialized (default) — searches ONLY stock_units:
    |   1. exact IMEI1 / IMEI2 / serial_number match → { exact: true, units: [one] }
    |      (scanner fast-path; the UI adds that unit straight to the cart).
    |   2. otherwise manual_item_name LIKE (plus partial identifier LIKE) →
    |      individual unit rows. No other tables are searched; variant price /
    |      tax fallbacks come from a single whereIn on the matched units.
    | mode=bulk — non-serialized product variants by name / SKU / barcode; each
    |   variant carries its saleable batches (condition, warranty, stock,
    |   prices). FIFO = first batch; the cashier may pick another in the UI.
    | mode=all — both of the above in one response.
    | Everything is scoped to this store's available + saleable stock.
    |--------------------------------------------------------------------------
    */
    public function stockSearch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q'    => ['required', 'string', 'min:2', 'max:50'],
            'mode' => ['nullable', Rule::in(['serialized', 'bulk', 'all'])],
        ]);

        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $mode = $validated['mode'] ?? 'serialized';
        $q    = trim($validated['q']);

        $payload = ['mode' => $mode];

        if ($mode === 'serialized' || $mode === 'all') {
            $payload['units'] = $this->searchSerializedUnits($store, $q);
        }

        if ($mode === 'bulk' || $mode === 'all') {
            $payload['products'] = $this->searchBulkProducts($store, $q);
        }

        return response()->json($payload);
    }

    /**
     * Serialized search — stock_units only.
     * Returns ['exact' => bool, 'units' => [...]]; exact=true means the query
     * matched one unit's identifier and the UI should add it directly.
     */
    private function searchSerializedUnits(Store $store, string $q): array
    {
        $base = StockUnit::query()
            ->where('store_id', $store->id)
            ->where('status', 'available')
            ->where('is_saleable', true);

        // 1. Scanner fast-path: exact identifier hit.
        $exact = (clone $base)
            ->where(fn ($w) => $w
                ->where('imei1', $q)
                ->orWhere('imei2', $q)
                ->orWhere('serial_number', $q))
            ->first();

        $units = $exact
            ? collect([$exact])
            : (clone $base)
                ->where(fn ($w) => $w
                    ->where('manual_item_name', 'like', "%{$q}%")
                    ->orWhere('imei1', 'like', "%{$q}%")
                    ->orWhere('imei2', 'like', "%{$q}%")
                    ->orWhere('serial_number', 'like', "%{$q}%"))
                ->orderBy('id', 'desc')
                ->limit(20)
                ->get();

        if ($units->isEmpty()) {
            return ['exact' => false, 'units' => []];
        }

        // Variant fallbacks (price when the unit has none, tax %, warranty months) — one query.
        $fallbacks = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('tax_categories', 'tax_categories.id', '=', 'products.tax_category_id')
            ->whereIn('product_variants.id', $units->pluck('product_variant_id')->filter()->unique()->all())
            ->select('product_variants.id', 'product_variants.selling_price', 'products.warranty_months')
            ->selectRaw('COALESCE(tax_categories.tax_percent, 0) as tax_pct')
            ->get()
            ->keyBy('id');

        return [
            'exact' => $exact !== null,
            'units' => $units->map(function (StockUnit $u) use ($fallbacks) {
                $fb = $u->product_variant_id ? ($fallbacks[$u->product_variant_id] ?? null) : null;

                return [
                    'id'               => $u->id,
                    'variant_id'       => $u->product_variant_id,
                    'name'             => $u->manual_item_name ?? '—',
                    'imei1'            => $u->imei1,
                    'imei2'            => $u->imei2,
                    'serial_number'    => $u->serial_number,
                    'device_condition' => $u->device_condition,
                    'overall_health'   => $u->overall_health,
                    'landed_cost'      => (float) $u->landed_cost,
                    'is_margin_scheme' => (bool) $u->is_margin_scheme,
                    'selling_price'    => $u->selling_price !== null ? (float) $u->selling_price : null,
                    'wholesale_price'  => $u->wholesale_price !== null ? (float) $u->wholesale_price : null,
                    'variant_price'    => (float) ($fb->selling_price ?? 0),
                    'tax_pct'          => (float) ($fb->tax_pct ?? 0),
                    // Customer-facing warranty default — see unitWarrantyText().
                    // The cashier can override it per cart line.
                    'warranty'         => $this->unitWarrantyText($u, $fb?->warranty_months ?? null),
                ];
            })->values()->all(),
        ];
    }

    /**
     * Customer-facing warranty text for a serialized unit.
     *
     * Exactly one of the three sources is ever set on the unit:
     *  1. remaining_warranty (free text, e.g. "6 months") → used as-is.
     *  2. activation_date + the product's warranty_months → months/days left
     *     from today, or "Out of warranty".
     *  3. warranty_expiry_date → remaining, or "Out of warranty" when past.
     */
    private function unitWarrantyText(StockUnit $u, ?int $warrantyMonths): ?string
    {
        if ($u->remaining_warranty) {
            return $u->remaining_warranty;
        }

        $today = now()->startOfDay();

        if ($u->activation_date && $warrantyMonths) {
            $end = $u->activation_date->copy()->startOfDay()->addMonths($warrantyMonths);

            return $this->remainingWarrantyText($today, $end);
        }

        if ($u->warranty_expiry_date) {
            return $this->remainingWarrantyText($today, $u->warranty_expiry_date->copy()->startOfDay());
        }

        return null;
    }

    private function remainingWarrantyText(CarbonInterface $today, CarbonInterface $end): string
    {
        if ($end->lt($today)) {
            return 'Out of warranty';
        }

        $months = (int) $today->diffInMonths($end);
        $days = (int) $today->copy()->addMonths($months)->diffInDays($end);

        if ($months <= 0 && $days <= 0) {
            return 'Warranty expires today';
        }

        $parts = [];
        if ($months > 0) {
            $parts[] = $months.' month'.($months > 1 ? 's' : '');
        }
        if ($days > 0) {
            $parts[] = $days.' day'.($days > 1 ? 's' : '');
        }

        return implode(' ', $parts).' left';
    }


    /**
     * Bulk search — non-serialized variants with their saleable batches.
     * FIFO order (created_at, id); the cashier picks the batch in the UI.
     */
    private function searchBulkProducts(Store $store, string $q): array
    {
        $like = "%{$q}%";

        $variants = ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('tax_categories', 'tax_categories.id', '=', 'products.tax_category_id')
            ->where('products.is_serialized', false)
            ->where('product_variants.is_active', true)
            ->whereNull('product_variants.deleted_at')
            ->where('products.is_active', true)
            ->whereNull('products.deleted_at')
            ->where(fn ($w) => $w
                ->where('product_variants.sku', 'like', "{$q}%")
                ->orWhere('product_variants.barcode', 'like', "{$q}%")
                ->orWhere('product_variants.variant_name', 'like', $like)
                ->orWhere('products.name', 'like', $like))
            ->with(['product.images'])
            ->select('product_variants.*')
            ->selectRaw('COALESCE(tax_categories.tax_percent, 0) as tax_pct')
            ->limit(12)
            ->get();

        if ($variants->isEmpty()) {
            return [];
        }

        $batchMap = StockBatch::query()
            ->where('store_id', $store->id)
            ->whereIn('product_variant_id', $variants->pluck('id')->all())
            ->where('remaining_qty', '>', 0)
            ->where('is_saleable', true)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->groupBy('product_variant_id');

        return $variants->map(function (ProductVariant $variant) use ($batchMap) {
            $batches = $batchMap[$variant->id] ?? collect();

            return [
                'variant_id'        => $variant->id,
                'product_name'      => $variant->product->name ?? '',
                'variant_name'      => $variant->variant_name,
                'sku'               => $variant->sku,
                'barcode'           => $variant->barcode,
                'hsn_code'          => $variant->product->hsn_code,
                'tax_pct'           => (float) $variant->tax_pct,
                'selling_price'     => (float) $variant->selling_price,
                'min_selling_price' => (float) ($variant->min_selling_price ?: $variant->selling_price),
                'available_qty'     => (int) $batches->sum('remaining_qty'),
                'img'               => $variant->product->images->first()?->image_path
                    ? '/storage/' . ltrim($variant->product->images->first()->image_path, '/')
                    : null,
                'batches'           => $batches->map(fn (StockBatch $b) => [
                    'id'                 => $b->id,
                    'batch_number'       => $b->batch_number,
                    'remaining_qty'      => (int) $b->remaining_qty,
                    'product_condition'  => $b->product_condition,
                    'overall_health'     => $b->overall_health,
                    'remaining_warranty' => $b->remaining_warranty,
                    'selling_price'      => $b->selling_price !== null ? (float) $b->selling_price : null,
                    'wholesale_price'    => $b->wholesale_price !== null ? (float) $b->wholesale_price : null,
                    'landed_cost'        => (float) $b->landed_cost,
                    'is_margin_scheme'   => (bool) $b->is_margin_scheme,
                ])->values()->all(),
            ];
        })->values()->all();
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
            'invoice' => $this->serializeForPrint($invoice),
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
                    'warranty'         => $item->warranty,
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

    private function serializeForPrint(Invoice $inv): array
    {
        $party = $this->partyCard($inv);
        $partyGstin = $party['gstin'];

        // The tax movement was fixed at billing time (party GSTIN prefixes,
        // cashier-overridable) and the journal posted on it — print the
        // persisted value so the receipt always matches the books.
        $isIntraState = (bool) $inv->is_intra_state;

        // S1–S5 document classification (mirrors deriveDocument() in sale-context.tsx).
        $hasMargin = $inv->items->contains(fn ($item) => (bool) $item->is_margin_scheme);
        $document = SaleGstEvaluationService::documentType(
            (bool) $inv->is_gst_billed,
            $partyGstin,
            $hasMargin
        );

        $items = $inv->items->map(function ($item) use ($isIntraState) {
            $variant = $item->productVariant;
            $product = $variant?->product;
            $tax = (float) $item->tax_amount;
            $imei = $item->stockUnit?->imei1 ?? $item->stockUnit?->serial_number;

            $productName = array_filter([$product?->name, $variant?->variant_name]);
            $fullName = implode(' ', $productName);

            return [
                'product_name' => $fullName ?: ($item->manual_item_name ?? 'Item'),
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
                'warranty'         => $item->warranty,
                'imeis'            => $imei ? [$imei] : [],
            ];
        })->values();

        // HSN-wise summary (printed for S2/S4/S5; optional-but-shown for S3;
        // never for S1). Tax columns are rendered only when !hide_tax.
        $hsnSummary = $items
            ->groupBy(fn ($it) => $it['hsn_code'] ?: '—')
            ->map(fn ($group, $hsn) => [
                'hsn_code'      => $hsn,
                'qty'           => $group->sum('qty'),
                'taxable_value' => round($group->sum('taxable_value'), 2),
                'tax_amount'    => round($group->sum(fn ($it) => $it['cgst_amount'] + $it['sgst_amount'] + $it['igst_amount']), 2),
                'line_total'    => round($group->sum('line_total'), 2),
            ])
            ->values()
            ->all();

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
            'document_code'   => $document['code'],
            'document_label'  => $document['label'],
            'buyer_kind'      => $document['buyer_kind'],
            'itc_eligible'    => $document['itc_eligible'],
            'show_hsn_summary' => $document['hsn_summary'],
            'hide_tax'        => $document['hide_tax'],
            'items'           => $items,
            'hsn_summary'     => $hsnSummary,
        ];
    }
}

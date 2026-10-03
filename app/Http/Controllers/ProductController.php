<?php

namespace App\Http\Controllers;

use App\Http\Requests\Product\StoreProductRequest;
use App\Http\Requests\Product\UpdateProductRequest;
use App\Models\Attribute;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Product;
use App\Models\ProductVariant;
use App\Models\TaxCategory;
use App\Models\Unit;
use App\Services\ProductCatalogService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Inertia\Inertia;
use Inertia\Response;

class ProductController extends Controller
{
    public function __construct(
        protected ProductCatalogService $catalogService
    ) {}

    public function index(Request $request): Response
    {
        Gate::authorize('products.index');

        $isTrashedOnly = $request->input('trashed') === 'only';

        $productQuery = Product::query();

        if ($isTrashedOnly) {
            // Show products that are either soft-deleted themselves OR have soft-deleted variants
            $productQuery->withTrashed()->where(function ($q) {
                $q->onlyTrashed()->orWhereHas('variants', fn ($vq) => $vq->onlyTrashed());
            });
        }

        $productQuery->select([
            'id',
            'uuid',
            'name',
            'category_id',
            'brand_id',
            'is_serialized',
            'is_active',
            'deleted_at',
            'updated_at',
        ])
        ->with([
            'category:id,name',
            'brand:id,name',
            'variants' => function ($vq) use ($isTrashedOnly) {
                if ($isTrashedOnly) {
                    $vq->onlyTrashed();
                }
                $vq->select([
                    'id',
                    'product_id',
                    'variant_name',
                    'sku',
                    'barcode',
                    'mrp',
                    'selling_price',
                    'stock_alert_qty',
                    'is_active',
                    'deleted_at',
                ])
                ->with([
                    'attributeValues' => function ($aq) {
                        $aq->select('attribute_values.id', 'attribute_values.attribute_id', 'attribute_values.value')
                            ->with('attribute:id,name');
                    },
                    'images' => function ($iq) {
                        $iq->where('is_primary', true)->select('id', 'product_variant_id', 'thumb_path')->limit(1);
                    },
                ])
                ->orderBy('id', 'asc');
            },
        ]);

        if ($request->filled('search')) {
            $search = $request->input('search');
            $productQuery->where(function ($q) use ($search, $isTrashedOnly) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhereHas('variants', function ($vq) use ($search, $isTrashedOnly) {
                        if ($isTrashedOnly) {
                            $vq->onlyTrashed();
                        }
                        $vq->where('sku', 'like', "%{$search}%")
                            ->orWhere('barcode', 'like', "%{$search}%")
                            ->orWhere('variant_name', 'like', "%{$search}%");
                    })
                    ->orWhereHas('brand', fn ($bq) => $bq->where('name', 'like', "%{$search}%"))
                    ->orWhereHas('category', fn ($cq) => $cq->where('name', 'like', "%{$search}%"));
            });
        }

        if ($request->filled('category_id')) {
            $productQuery->where('category_id', $request->integer('category_id'));
        }

        if ($request->filled('brand_id')) {
            $productQuery->where('brand_id', $request->integer('brand_id'));
        }

        if ($request->filled('is_serialized')) {
            $productQuery->where('is_serialized', $request->boolean('is_serialized'));
        }

        if ($request->filled('is_active')) {
            $productQuery->where('is_active', $request->boolean('is_active'));
        }

        $productsPaginated = $productQuery->orderBy('updated_at', 'desc')
            ->paginate(10)
            ->withQueryString();

        $productsPaginated->getCollection()->transform(function ($product) {
            $product->variants->transform(function ($variant) {
                $variant->primary_photo_url = $variant->images->first()?->thumb_path
                    ? Storage::disk('public')->url($variant->images->first()->thumb_path)
                    : null;
                unset($variant->images);
                return $variant;
            });
            return $product;
        });

        // Calculate accurate total trashed variant count across catalog
        $trashedVariantsCount = ProductVariant::onlyTrashed()->count();

        return Inertia::render('App/Products/Index', [
            'products' => $productsPaginated,
            'stats'    => [
                'total_products' => Product::count(),
                'total_variants' => ProductVariant::count(),
                'serialized'     => Product::where('is_serialized', true)->count(),
                'trashed'        => $trashedVariantsCount,
            ],
            'filters'    => $request->only(['search', 'category_id', 'brand_id', 'is_serialized', 'is_active', 'trashed']),
            'categories' => Category::where('is_active', true)->select('id', 'name')->get(),
            'brands'     => Brand::where('is_active', true)->select('id', 'name')->get(),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('products.create');

        return Inertia::render('App/Products/Create', [
            'categories'    => Category::where('is_active', true)->select('id', 'name')->get(),
            'brands'        => Brand::where('is_active', true)->select('id', 'name')->get(),
            'taxCategories' => TaxCategory::select('id', 'name', 'tax_percent')->get(),
            'units'         => Unit::select('id', 'name', 'short_code', 'multiplier')->get(),
            'attributes'    => Attribute::with(['values' => fn ($q) => $q->orderBy('id')])->get(),
        ]);
    }

    public function store(StoreProductRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $product = $this->catalogService->storeProduct(
            $validated,
            $request->user()->id
        );

        return redirect()
            ->route('app.products.index')
            ->with('success', "'{$product->name}' created successfully.");
    }

    public function show(Product $product): Response
    {
        Gate::authorize('products.view');

        $product->load([
            'category',
            'brand',
            'taxCategory',
            'variants.unit',
            'variants.attributeValues.attribute',
            'variants.images.assets',
            'variants.barcodes',
        ]);

        return Inertia::render('App/Products/Show', [
            'product' => $product,
        ]);
    }

    public function edit(Product $product): Response
    {
        Gate::authorize('products.update');

        // withTrashed() here is deliberate: the Edit page needs to display trashed
        // variants too (read-only, with a Restore action), not just active ones.
        $product->load([
            'category:id,name',
            'brand:id,name',
            'taxCategory:id,name,tax_percent',
            'variants' => function ($q) {
                $q->withTrashed()
                    ->with([
                        'unit:id,name,short_code',
                        'attributeValues' => function ($aq) {
                            $aq->select('attribute_values.id', 'attribute_values.attribute_id', 'attribute_values.value')
                                ->with('attribute:id,name');
                        },
                        'images' => fn ($iq) => $iq->orderBy('sort_order'),
                    ])
                    ->orderBy('id');
            },
        ]);

        // Resolve a public URL per image so the frontend never has to know about disks/paths.
        $product->variants->each(function ($variant) {
            $variant->images->each(function ($image) {
                $path = $image->asset_path ?: $image->thumb_path;
                $image->url = $path ? Storage::disk('public')->url($path) : null;
            });
        });

        return Inertia::render('App/Products/Edit', [
            'product'       => $product,
            'categories'    => Category::where('is_active', true)->select('id', 'name')->get(),
            'brands'        => Brand::where('is_active', true)->select('id', 'name')->get(),
            'taxCategories' => TaxCategory::select('id', 'name', 'tax_percent')->get(),
            'units'         => Unit::select('id', 'name', 'short_code', 'multiplier')->get(),
            // Same is_variant_defining filter as the Create page, for parity.
            'attributes'    => Attribute::where('is_variant_defining', true)
                ->select('id', 'uuid', 'name')
                ->with(['values' => fn ($q) => $q->select('id', 'uuid', 'attribute_id', 'value')->orderBy('id')])
                ->orderBy('name')
                ->get(),
        ]);
    }

    public function update(UpdateProductRequest $request, Product $product): RedirectResponse
    {
        $validated = $request->validated();

        $this->catalogService->updateProduct(
            $product,
            $validated,
            $request->user()->id
        );

        return redirect()
            ->route('app.products.index')
            ->with('success', "'{$product->name}' updated successfully.");
    }

    public function destroy(Request $request, Product $product): RedirectResponse
    {
        Gate::authorize('products.delete');

        $request->validate([
            'variant_ids'   => ['required', 'array', 'min:1'],
            'variant_ids.*' => ['exists:product_variants,id'],
        ]);

        $this->catalogService->deleteVariants($product, $request->input('variant_ids'));

        return redirect()
            ->back()
            ->with('success', 'Selected variant(s) moved to trash.');
    }

    public function restore(Request $request, string $uuid): RedirectResponse
    {
        Gate::authorize('products.delete');

        $variantIds = $request->input('variant_ids');
        $product = $this->catalogService->restoreProduct($uuid, $variantIds);

        return redirect()
            ->back()
            ->with('success', "Product '{$product->name}' restored successfully.");
    }

    public function purge(Request $request, string $uuid): RedirectResponse
    {
        Gate::authorize('products.purge');

        $request->validate([
            'variant_ids'   => ['required', 'array', 'min:1'],
            'variant_ids.*' => ['exists:product_variants,id'],
        ]);

        $this->catalogService->purgeVariants($uuid, $request->input('variant_ids'));

        return redirect()
            ->back()
            ->with('success', 'Selected variant(s) permanently purged.');
    }



    public function searchVariants(Request $request): JsonResponse
    {
        $validated = $request->validate([
            // Removed spaces in validation rules (e.g., 'min: 3' -> 'min:2')
            'q' => ['required', 'string', 'min:2', 'max:50'],
        ]);

        $q = trim($validated['q']);
        $like = "%{$q}%";

        // Updated to match the 2026_09_13_182743_create_tax_categories_table.php migration
        $taxRateColumn = 'tax_categories.tax_percent';

        $rows = DB::table('product_variants')
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->leftJoin('tax_categories', 'tax_categories.id', '=', 'products.tax_category_id')
            ->where('product_variants.is_active', true)
            ->whereNull('product_variants.deleted_at')
            ->where('products.is_active', true)
            ->whereNull('products.deleted_at')
            ->where(function ($w) use ($like, $q) {
                // Exact matches on SKU/Barcode rank higher and scan faster via indexing
                $w->where('product_variants.sku', 'like', "{$q}%")
                  ->orWhere('product_variants.barcode', 'like', "{$q}%")
                  ->orWhere('product_variants.variant_name', 'like', $like)
                  ->orWhere('products.name', 'like', $like);
            })
            ->select([
                'product_variants.id',
                'product_variants.uuid',
                'product_variants.product_id',
                'products.name as product_name',
                'product_variants.variant_name',
                'product_variants.sku',
                'product_variants.barcode',
                'products.hsn_code',
                'products.is_serialized',
                DB::raw("COALESCE({$taxRateColumn}, 0) as tax_pct"),
                'product_variants.mrp',
                'product_variants.cost_price',
                'product_variants.selling_price',
                'product_variants.min_selling_price',
            ])
            ->orderByRaw('product_variants.sku = ? DESC', [$q])
            ->limit(20)
            ->get();

        // Cast to the exact CatalogVariant shape the frontend expects.
        $data = $rows->map(fn ($r) => [
            'id' => (int) $r->id,
            'uuid' => $r->uuid,
            'product_id' => (int) $r->product_id,
            'product_name' => $r->product_name,
            'variant_name' => $r->variant_name,
            'sku' => $r->sku,
            'barcode' => $r->barcode,
            'hsn_code' => $r->hsn_code,
            'is_serialized' => (bool) $r->is_serialized,
            'tax_pct' => (float) $r->tax_pct,
            'mrp' => (float) $r->mrp,
            'cost_price' => (float) $r->cost_price,
            'selling_price' => (float) $r->selling_price,
            'min_selling_price' => (float) $r->min_selling_price,
            'attributes_text' => null, // Omitted to avoid expensive pivot joins on every keystroke
        ]);

        return response()->json($data);
    }
}

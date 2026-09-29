<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\ProductVariant;
use App\Models\StockSnapshot;
use App\Models\StockUnit;
use App\Models\Store;
use Illuminate\Http\Request;
use Inertia\Inertia;

class SaleEntryController extends Controller
{
    public function create()
    {
        $store = auth()->user()->ownedStore;

        $categories = Category::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->select('id', 'name')
            ->get();

        return Inertia::render('Billing/SaleEntry/Index', [
            'store' => $store->only('id', 'code', 'name', 'gstin', 'is_gst_registered', 'gst_bill_sale', 'state_code'),
            'categories' => $categories,
            'manualTaxSlabs' => 2,
            // Preview only — the authoritative number is reserved server-side
            // inside the store() transaction.
            'initialInvoiceNumber' => "SALE-0101",
            'initialProducts' => $this->initialProducts($store),
        ]);
    }

    private function initialProducts(Store $store): array
    {
        return $this->productQuery($store)->limit(48)->get()->map(
            fn (ProductVariant $v) => $this->shapeVariant($v)
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

    private function shapeVariant(ProductVariant $variant): array
    {
        $product = $variant->product;
        $isSerialized = (bool) $product->is_serialized;

        // Computed by productQuery()'s correlated subqueries — zero extra queries.
        $availableQty = $isSerialized
            ? (int) ($variant->units_available ?? 0)
            : (int) ($variant->snapshot_qty ?? 0);

        return [
            'id' => $variant->id,
            'name' => trim(($product->name ?? '') . ' ' . ($variant->variant_name ?? '')),
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'mrp' => (float) $variant->mrp,
            'selling_price' => (float) $variant->selling_price,
            'min_selling_price' => (float) ($variant->min_selling_price ?? $variant->selling_price),
            'cost_price' => (float) $variant->cost_price,
            'tax_pct' => (float) ($product->taxCategory?->tax_percent ?? 0),
            'tax_type' => 'inclusive',
            'is_serialized' => $isSerialized,
            'category_id' => $product->category_id,
            'category' => $product->category?->name,
            'img' => $product->images->first()?->image_path
                ? '/storage/' . ltrim($product->images->first()->image_path, '/')
                : null,
            'available_qty' => $availableQty,
        ];
    }
}

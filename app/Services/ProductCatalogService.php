<?php

namespace App\Services;

use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductVariant;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ProductCatalogService
{
    /**
     * Store a product with its variants, attributes, primary barcode, and zerofyi/media images.
     */
    public function storeProduct(array $data, int $userId): Product
    {
        return DB::transaction(function () use ($data, $userId) {
            $slug = Str::slug($data['name']);
            $originalSlug = $slug;
            $counter = 1;
            while (Product::where('slug', $slug)->exists()) {
                $slug = $originalSlug . '-' . $counter++;
            }

            $product = Product::create([
                'name'              => $data['name'],
                'slug'              => $slug,
                'description'       => $data['description'] ?? null,
                'short_description' => $data['short_description'] ?? null,
                'category_id'       => $data['category_id'],
                'brand_id'          => $data['brand_id'] ?? null,
                'tax_category_id'   => $data['tax_category_id'] ?? null,
                'hsn_code'          => $data['hsn_code'] ?? null,
                'warranty_months'   => $data['warranty_months'] ?? 12,
                'is_active'         => $data['is_active'] ?? true,
                'is_returnable'     => $data['is_returnable'] ?? true,
                'is_serialized'     => $data['is_serialized'] ?? false,
                'is_featured'       => $data['is_featured'] ?? false,
                'is_trending'       => $data['is_trending'] ?? false,
                'is_best_seller'    => $data['is_best_seller'] ?? false,
                'created_by'        => $userId,
            ]);

            foreach ($data['variants'] as $variantData) {
                $variant = ProductVariant::create([
                    'product_id'        => $product->id,
                    'variant_name'      => $variantData['variant_name'] ?: $product->name,
                    'sku'               => $variantData['sku'],
                    'barcode'           => $variantData['barcode'] ?? null,
                    'unit_id'           => $variantData['unit_id'] ?? null,
                    'net_quantity'      => $variantData['net_quantity'] ?? 1.0000,
                    'mrp'               => $variantData['mrp'] ?? $variantData['selling_price'],
                    'selling_price'     => $variantData['selling_price'],
                    'cost_price'        => $variantData['cost_price'] ?? 0.00,
                    'min_selling_price' => $variantData['min_selling_price'] ?? 0.00,
                    'compare_price'     => $variantData['compare_price'] ?? 0.00,
                    'weight'            => $variantData['weight'] ?? null,
                    'stock_alert_qty'   => $variantData['stock_alert_qty'] ?? ($product->is_serialized ? 1 : 5),
                    'is_active'         => $variantData['is_active'] ?? true,
                ]);

                if (!empty($variantData['attributes'])) {
                    $attributeValueIds = array_column($variantData['attributes'], 'attribute_value_id');
                    $variant->attributeValues()->sync($attributeValueIds);
                }

                if (!empty($variantData['images'])) {
                    $this->saveVariantImages($product->id, $variant->id, $variantData['images'], $userId);
                }
            }

            return $product;
        });
    }

    /**
     * Update product and its variants matrix.
     */
    public function updateProduct(Product $product, array $data, int $userId): Product
    {
        return DB::transaction(function () use ($product, $data, $userId) {
            $product->update([
                'name'              => $data['name'],
                'description'       => $data['description'] ?? null,
                'short_description' => $data['short_description'] ?? null,
                'category_id'       => $data['category_id'],
                'brand_id'          => $data['brand_id'] ?? null,
                'tax_category_id'   => $data['tax_category_id'] ?? null,
                'hsn_code'          => $data['hsn_code'] ?? null,
                'warranty_months'   => $data['warranty_months'] ?? 12,
                'is_active'         => $data['is_active'] ?? true,
                'is_returnable'     => $data['is_returnable'] ?? true,
                'is_serialized'     => $data['is_serialized'] ?? false,
                'is_featured'       => $data['is_featured'] ?? false,
                'is_trending'       => $data['is_trending'] ?? false,
                'is_best_seller'    => $data['is_best_seller'] ?? false,
            ]);

            // Only non-trashed variants are ever present in $data — trashed ones are
            // managed independently via destroy()/restore() and never resubmitted here.
            // NOTE: variants missing from the submission are deliberately NOT deleted.
            // The Edit page may submit a subset (e.g. "Multiple Variants" toggle off),
            // so absence from the payload must never be treated as intent to delete.
            // Trashing happens only through the explicit destroy()/restore() actions.
            $isProductActive = $data['is_active'] ?? true;

            foreach ($data['variants'] as $variantData) {
                $variant = ProductVariant::updateOrCreate(
                    [
                        'id'         => $variantData['id'] ?? null,
                        'product_id' => $product->id,
                    ],
                    [
                        'variant_name'      => $variantData['variant_name'] ?: $product->name,
                        'sku'               => $variantData['sku'],
                        'barcode'           => $variantData['barcode'] ?? null,
                        'unit_id'           => $variantData['unit_id'] ?? null,
                        'net_quantity'      => $variantData['net_quantity'] ?? 1.0000,
                        'mrp'               => $variantData['mrp'] ?? $variantData['selling_price'],
                        'selling_price'     => $variantData['selling_price'],
                        'cost_price'        => $variantData['cost_price'] ?? 0.00,
                        'min_selling_price' => $variantData['min_selling_price'] ?? 0.00,
                        'compare_price'     => $variantData['compare_price'] ?? null,
                        'weight'            => $variantData['weight'] ?? null,
                        'stock_alert_qty'   => $variantData['stock_alert_qty'] ?? ($product->is_serialized ? 1 : 5),
                        'is_active'         => $isProductActive ? ($variantData['is_active'] ?? true) : false,
                    ]
                );

                if (isset($variantData['attributes'])) {
                    $attributeValueIds = array_column($variantData['attributes'], 'attribute_value_id');
                    $variant->attributeValues()->sync($attributeValueIds);
                }

                $this->reconcileVariantImages($product->id, $variant, $variantData, $userId);
            }

            return $product;
        });
    }

    /**
     * Soft-delete specific variants by ID. If all variants of a product are soft-deleted,
     * soft-delete the master product as well.
     */
    public function deleteVariants(Product $product, array $variantIds): void
    {
        DB::transaction(function () use ($product, $variantIds) {
            $product->variants()->whereIn('id', $variantIds)->delete();

            if ($product->variants()->count() === 0) {
                $product->delete();
            }
        });
    }

    /**
     * Restore a soft-deleted product and its soft-deleted variants.
     */
    public function restoreProduct(string $uuid, ?array $variantIds = null): Product
    {
        return DB::transaction(function () use ($uuid, $variantIds) {
            $product = Product::withTrashed()->where('uuid', $uuid)->firstOrFail();

            if ($product->trashed()) {
                $product->restore();
            }

            $variantQuery = ProductVariant::onlyTrashed()->where('product_id', $product->id);

            if (!empty($variantIds)) {
                $variantQuery->whereIn('id', $variantIds);
            }

            $variantQuery->restore();

            return $product;
        });
    }

    /**
     * Permanently purge specific variants and their physical image assets.
     * If no variants remain at all, force-delete the parent product.
     */
    public function purgeVariants(string $uuid, array $variantIds): void
    {
        DB::transaction(function () use ($uuid, $variantIds) {
            $product = Product::withTrashed()->where('uuid', $uuid)->firstOrFail();

            $variants = ProductVariant::withTrashed()
                ->where('product_id', $product->id)
                ->whereIn('id', $variantIds)
                ->get();

            foreach ($variants as $v) {
                foreach ($v->images as $image) {
                    foreach ($image->assets as $asset) {
                        $asset->delete();
                    }
                    $image->delete();
                }
                $v->barcodes()->delete();
                $v->attributeValues()->detach();
                $v->forceDelete();
            }

            if ($product->variants()->withTrashed()->count() === 0) {
                $product->forceDelete();
            }
        });
    }

    /**
     * Reconcile a variant's images against a single edited list from the frontend:
     * some existing images may have been removed, the remaining ones may have been
     * reordered (and the primary slot may now belong to a different image — possibly
     * a brand-new upload), and new files may have been appended.
     */
    protected function reconcileVariantImages(int $productId, ProductVariant $variant, array $variantData, int $userId): void
    {
        if (!empty($variantData['removed_image_ids'])) {
            $this->deleteImages($variantData['removed_image_ids']);
        }

        $existingOrder = $variantData['existing_image_order'] ?? [];
        $primaryIsNew = (bool) ($variantData['primary_is_new'] ?? false);

        foreach ($existingOrder as $index => $imageId) {
            ProductImage::where('id', $imageId)
                ->where('product_variant_id', $variant->id)
                ->update([
                    'sort_order' => $index,
                    'is_primary' => !$primaryIsNew && $index === 0,
                ]);
        }

        if (!empty($variantData['images'])) {
            $this->saveVariantImages(
                productId: $productId,
                variantId: $variant->id,
                photos: $variantData['images'],
                userId: $userId,
                startSortOrder: count($existingOrder),
                firstIsPrimary: $primaryIsNew,
            );
        }

        // Safety net: if every prior primary was removed/reassigned away and nothing
        // ended up flagged, promote whatever image now sits first.
        $hasPrimary = ProductImage::where('product_variant_id', $variant->id)->where('is_primary', true)->exists();
        if (!$hasPrimary) {
            ProductImage::where('product_variant_id', $variant->id)
                ->orderBy('sort_order')
                ->first()
                ?->update(['is_primary' => true]);
        }
    }

    protected function deleteImages(array $imageIds): void
    {
        $images = ProductImage::whereIn('id', $imageIds)->get();

        foreach ($images as $image) {
            foreach ($image->assets as $asset) {
                $asset->delete();
            }
            $image->delete();
        }
    }

    protected function saveVariantImages(
        int $productId,
        int $variantId,
        array $photos,
        int $userId,
        int $startSortOrder = 0,
        bool $firstIsPrimary = true,
    ): void {
        $sortOrder = $startSortOrder;
        foreach (array_slice($photos, 0, 6) as $i => $photo) {
            if ($photo instanceof UploadedFile) {
                $productImage = ProductImage::create([
                    'product_id'         => $productId,
                    'product_variant_id' => $variantId,
                    // Only the very first image overall (existing list empty, this is
                    // upload #0) is auto-primary — matches original store() behavior.
                    'is_primary'         => $firstIsPrimary && $i === 0 && $startSortOrder === 0,
                    'sort_order'         => $sortOrder++,
                ]);

                $asset = $productImage->uploadAsset(
                    file: $photo,
                    slug: "prod-{$productId}-var-{$variantId}-" . Str::random(6),
                    folder: "products/{$productId}/variants",
                    type: 'product',
                    variants: ['thumb', 'sm'],
                    uploadedBy: $userId
                );

                $productImage->update([
                    'asset_path' => $asset->path,
                    'thumb_path' => $asset->variants['thumb'] ?? $asset->path,
                ]);
            }
        }
    }
}

<?php

namespace App\Http\Requests\Product;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Foundation\Http\FormRequest;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('products.update');
    }

    public function rules(): array
    {
        $product = $this->route('product');
        $productId = $product instanceof Product ? $product->id : null;

        return [
            // Master Product with Duplicate Check Excluding Self
            'name' => [
                'required',
                'string',
                'max:255',
                function ($attribute, $value, $fail) use ($productId) {
                    $categoryId = $this->input('category_id');
                    $brandId = $this->input('brand_id');

                    $exists = Product::where('name', $value)
                        ->where('category_id', $categoryId)
                        ->where('brand_id', $brandId)
                        ->when($productId, fn ($q) => $q->where('id', '!=', $productId))
                        ->exists();

                    if ($exists) {
                        $fail('A product with this exact name, category, and brand already exists.');
                    }
                },
            ],
            'short_description' => ['nullable', 'string', 'max:500'],
            'description'       => ['nullable', 'string'],
            'category_id'       => ['required', 'exists:categories,id'],
            'brand_id'          => ['nullable', 'exists:brands,id'],
            'tax_category_id'   => ['nullable', 'exists:tax_categories,id'],
            'hsn_code'          => ['nullable', 'string', 'max:20'],
            'warranty_months'   => ['nullable', 'integer', 'min:0'],
            'is_active'         => ['required', 'boolean'],
            'is_returnable'     => ['required', 'boolean'],
            'is_serialized'     => ['required', 'boolean'],
            'is_featured'       => ['boolean'],
            'is_trending'       => ['boolean'],
            'is_best_seller'    => ['boolean'],

            // Variant Matrix Validation
            'variants'               => ['required', 'array', 'min:1'],
            'variants.*.id'          => ['nullable', 'exists:product_variants,id'],
            'variants.*.variant_name' => ['nullable', 'string', 'max:255'],

            // Dynamic Regex Index Extraction for SKU Validation
            'variants.*.sku' => [
                'required',
                'string',
                'max:100',
                'distinct',
                function ($attribute, $value, $fail) {
                    preg_match('/variants\.(\d+)\.sku/', $attribute, $matches);
                    $index = $matches[1] ?? null;
                    $variantId = $index !== null ? data_get($this->variants, "{$index}.id") : null;

                    $exists = ProductVariant::where('sku', $value)
                        ->when($variantId, fn ($q) => $q->where('id', '!=', $variantId))
                        ->exists();

                    if ($exists) {
                        $fail("The SKU '{$value}' is already taken.");
                    }
                },
            ],

            // Dynamic Regex Index Extraction for Barcode Validation
            'variants.*.barcode' => [
                'nullable',
                'string',
                'max:100',
                'distinct',
                function ($attribute, $value, $fail) {
                    if (!$value) {
                        return;
                    }

                    preg_match('/variants\.(\d+)\.barcode/', $attribute, $matches);
                    $index = $matches[1] ?? null;
                    $variantId = $index !== null ? data_get($this->variants, "{$index}.id") : null;

                    $exists = ProductVariant::where('barcode', $value)
                        ->when($variantId, fn ($q) => $q->where('id', '!=', $variantId))
                        ->exists();

                    if ($exists) {
                        $fail("The primary barcode '{$value}' is already taken.");
                    }
                },
            ],

            'variants.*.unit_id'           => ['nullable', 'exists:units,id'],
            'variants.*.net_quantity'      => ['nullable', 'numeric', 'min:0'],
            'variants.*.mrp'               => ['nullable', 'numeric', 'min:0'],
            'variants.*.selling_price'     => ['required', 'numeric', 'min:0'],
            'variants.*.cost_price'        => ['nullable', 'numeric', 'min:0'],
            'variants.*.min_selling_price' => ['nullable', 'numeric', 'min:0'],
            'variants.*.compare_price'     => ['nullable', 'numeric', 'min:0'],
            'variants.*.weight'            => ['nullable', 'numeric', 'min:0'],
            'variants.*.stock_alert_qty'   => ['nullable', 'integer', 'min:0'],
            'variants.*.is_active'         => ['required', 'boolean'],

            // Variant Attributes
            'variants.*.attributes'                      => ['nullable', 'array'],
            'variants.*.attributes.*.attribute_value_id' => ['required', 'exists:attribute_values,id'],

            // Images per Variant
            'variants.*.images'                 => ['nullable', 'array', 'max:6'],
            'variants.*.images.*'               => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
            'variants.*.removed_image_ids'      => ['nullable', 'array'],
            'variants.*.removed_image_ids.*'    => ['integer', 'exists:product_images,id'],
            'variants.*.existing_image_order'   => ['nullable', 'array'],
            'variants.*.existing_image_order.*' => ['integer', 'exists:product_images,id'],
            'variants.*.primary_is_new'         => ['nullable', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('variants')) {
            $variants = array_map(function ($variant) {
                foreach (['mrp', 'cost_price', 'min_selling_price', 'compare_price', 'weight', 'stock_alert_qty', 'net_quantity'] as $field) {
                    if (isset($variant[$field]) && $variant[$field] === '') {
                        $variant[$field] = null;
                    }
                }
                return $variant;
            }, $this->input('variants', []));

            $this->merge(['variants' => $variants]);
        }
    }
}

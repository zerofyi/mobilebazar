<?php

namespace App\Http\Requests\Product;

use App\Models\Product;
use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('products.create');
    }

    public function rules(): array
    {
        return [
            // Master Product with Duplicate Combination Check
            'name' => [
                'required',
                'string',
                'max:255',
                function ($attribute, $value, $fail) {
                    $categoryId = $this->input('category_id');
                    $brandId = $this->input('brand_id');

                    $exists = Product::where('name', $value)
                        ->where('category_id', $categoryId)
                        ->where('brand_id', $brandId)
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

            // Variant Array Validation
            'variants'                                   => ['required', 'array', 'min:1'],
            'variants.*.variant_name'                    => ['nullable', 'string', 'max:255'],
            'variants.*.sku'                             => ['required', 'string', 'max:100', 'distinct', 'unique:product_variants,sku'],
            'variants.*.barcode'                         => ['nullable', 'string', 'max:100', 'distinct', 'unique:product_variants,barcode'],
            'variants.*.unit_id'                         => ['nullable', 'exists:units,id'],
            'variants.*.net_quantity'                    => ['nullable', 'numeric', 'min:0'],
            'variants.*.mrp'                             => ['nullable', 'numeric', 'min:0'],
            'variants.*.selling_price'                   => ['required', 'numeric', 'min:0'],
            'variants.*.cost_price'                      => ['nullable', 'numeric', 'min:0'],
            'variants.*.min_selling_price'              => ['nullable', 'numeric', 'min:0'],
            'variants.*.compare_price'                   => ['nullable', 'numeric', 'min:0'],
            'variants.*.weight'                          => ['nullable', 'numeric', 'min:0'],
            'variants.*.stock_alert_qty'                 => ['nullable', 'integer', 'min:0'],
            'variants.*.is_active'                       => ['required', 'boolean'],

            // Variant Attributes (Array of Objects transformed by React)
            'variants.*.attributes'                      => ['nullable', 'array'],
            'variants.*.attributes.*.attribute_value_id' => ['required', 'exists:attribute_values,id'],

            // Images per Variant Only
            'variants.*.images'                          => ['nullable', 'array', 'max:6'],
            'variants.*.images.*'                        => ['nullable', 'image', 'mimes:jpeg,png,jpg,webp', 'max:5120'],
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

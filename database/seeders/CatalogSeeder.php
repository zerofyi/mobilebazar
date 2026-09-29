<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Str;
use App\Models\Brand;
use App\Models\Category;
use App\Models\Attribute;
use App\Models\AttributeValue;
use App\Models\Product;
use App\Models\ProductVariant;

class CatalogSeeder extends Seeder
{
    public function run(): void
    {
        // ==========================================
        // 1. BRANDS
        // ==========================================
        $brandsData = ['Apple', 'Samsung', 'Google', 'OnePlus', 'Anker', 'Spigen'];
        $brands = [];

        foreach ($brandsData as $name) {
            $brands[$name] = Brand::create([
                'uuid'      => Str::uuid(),
                'name'      => $name,
                'slug'      => Str::slug($name),
                'logo_path' => null,
                'is_active' => true,
            ]);
        }

        // ==========================================
        // 2. CATEGORIES (Hierarchical Tree)
        // ==========================================
        $electronics = Category::create([
            'uuid'       => Str::uuid(),
            'parent_id'  => null,
            'name'       => 'Electronics',
            'slug'       => 'electronics',
            'image_path' => null,
            'icon_path'  => null,
            'sort_order' => 1,
            'is_active'  => true,
        ]);

        $smartphonesCat = Category::create([
            'uuid'       => Str::uuid(),
            'parent_id'  => $electronics->id,
            'name'       => 'Smartphones',
            'slug'       => 'smartphones',
            'image_path' => null,
            'icon_path'  => null,
            'sort_order' => 1,
            'is_active'  => true,
        ]);

        $smartwatchesCat = Category::create([
            'uuid'       => Str::uuid(),
            'parent_id'  => $electronics->id,
            'name'       => 'Smartwatches',
            'slug'       => 'smartwatches',
            'image_path' => null,
            'icon_path'  => null,
            'sort_order' => 2,
            'is_active'  => true,
        ]);

        $accessoriesCat = Category::create([
            'uuid'       => Str::uuid(),
            'parent_id'  => $electronics->id,
            'name'       => 'Accessories',
            'slug'       => 'accessories',
            'image_path' => null,
            'icon_path'  => null,
            'sort_order' => 3,
            'is_active'  => true,
        ]);

        // ==========================================
        // 3. ATTRIBUTES & ATTRIBUTE VALUES (Including RAM)
        // ==========================================
        $attributesConfig = [
            'Color'   => ['Midnight Black', 'Silver', 'Alpine Green', 'Titanium Gray'],
            'Storage' => ['128GB', '256GB', '512GB', '1TB'],
            'RAM'     => ['6GB', '8GB', '12GB', '16GB'],
            'Size'    => ['40mm', '44mm', '41mm', '45mm'],
        ];

        $createdValues = [];

        foreach ($attributesConfig as $attrName => $values) {
            $attribute = Attribute::create([
                'uuid'                => Str::uuid(),
                'name'                => $attrName,
                'type'                => 'select',
                'is_variant_defining' => true,
            ]);

            foreach ($values as $val) {
                $attrValue = AttributeValue::create([
                    'uuid'         => Str::uuid(),
                    'attribute_id' => $attribute->id,
                    'value'        => $val,
                ]);

                // Map for quick retrieval during variant generation
                $createdValues[$attrName][$val] = $attrValue->id;
            }
        }

        // ==========================================
        // 4. PRODUCTS & VARIANTS
        // ==========================================

        // --- PRODUCT 1: Smartphone (iPhone 15 Pro) ---
        $iphone = Product::create([
            'uuid'              => Str::uuid(),
            'name'              => 'iPhone 15 Pro',
            'slug'              => 'iphone-15-pro',
            'description'       => 'The ultimate titanium iPhone with A17 Pro chip.',
            'short_description' => 'A17 Pro chip, Titanium design',
            'category_id'       => $smartphonesCat->id,
            'brand_id'          => $brands['Apple']->id,
            'tax_category_id'   => 1,
            'hsn_code'          => '85171300',
            'warranty_months'   => 12,
            'is_active'         => true,
            'is_returnable'     => true,
            'is_serialized'     => true,
            'is_featured'       => true,
            'is_trending'       => true,
            'is_best_seller'    => true,
            'created_by'        => 1,
        ]);

        // Variant 1: iPhone 15 Pro - Midnight Black / 128GB / 8GB RAM
        $v1 = ProductVariant::create([
            'product_id'        => $iphone->id,
            'variant_name'      => 'iPhone 15 Pro - Midnight Black, 128GB, 8GB RAM',
            'sku'               => 'IPH15P-BLK-128-8',
            'barcode'           => '195949123456',
            'net_quantity'      => 1,
            'mrp'               => 1099.00,
            'selling_price'     => 999.00,
            'cost_price'        => 850.00,
            'min_selling_price' => 950.00,
            'compare_price'     => 1099.00,
            'weight'            => 187.00,
            'stock_alert_qty'   => 5,
            'is_active'         => true,
        ]);
        $v1->attributeValues()->attach([
            $createdValues['Color']['Midnight Black'],
            $createdValues['Storage']['128GB'],
            $createdValues['RAM']['8GB'],
        ]);

        // Variant 2: iPhone 15 Pro - Titanium Gray / 256GB / 8GB RAM
        $v2 = ProductVariant::create([
            'product_id'        => $iphone->id,
            'variant_name'      => 'iPhone 15 Pro - Titanium Gray, 256GB, 8GB RAM',
            'sku'               => 'IPH15P-GRY-256-8',
            'barcode'           => '195949654321',
            'net_quantity'      => 1,
            'mrp'               => 1199.00,
            'selling_price'     => 1099.00,
            'cost_price'        => 930.00,
            'min_selling_price' => 1050.00,
            'compare_price'     => 1199.00,
            'weight'            => 187.00,
            'stock_alert_qty'   => 5,
            'is_active'         => true,
        ]);
        $v2->attributeValues()->attach([
            $createdValues['Color']['Titanium Gray'],
            $createdValues['Storage']['256GB'],
            $createdValues['RAM']['8GB'],
        ]);


        // --- PRODUCT 2: Smartwatch (Galaxy Watch 6) ---
        $galaxyWatch = Product::create([
            'uuid'              => Str::uuid(),
            'name'              => 'Samsung Galaxy Watch 6',
            'slug'              => 'samsung-galaxy-watch-6',
            'description'       => 'Your daily wellness companion with advanced sleep tracking.',
            'short_description' => 'Advanced health monitoring smartwatch',
            'category_id'       => $smartwatchesCat->id,
            'brand_id'          => $brands['Samsung']->id,
            'tax_category_id'   => 1,
            'hsn_code'          => '85176290',
            'warranty_months'   => 12,
            'is_active'         => true,
            'is_returnable'     => true,
            'is_serialized'     => false,
            'is_featured'       => true,
            'is_trending'       => false,
            'is_best_seller'    => true,
            'created_by'        => 1,
        ]);

        $v3 = ProductVariant::create([
            'product_id'        => $galaxyWatch->id,
            'variant_name'      => 'Galaxy Watch 6 - Silver / 44mm',
            'sku'               => 'GW6-SLV-44',
            'barcode'           => '887276123456',
            'net_quantity'      => 1,
            'mrp'               => 329.00,
            'selling_price'     => 299.00,
            'cost_price'        => 220.00,
            'min_selling_price' => 280.00,
            'compare_price'     => 329.00,
            'weight'            => 33.30,
            'stock_alert_qty'   => 3,
            'is_active'         => true,
        ]);
        $v3->attributeValues()->attach([
            $createdValues['Color']['Silver'],
            $createdValues['Size']['44mm'],
        ]);


        // --- PRODUCT 3: Accessory (Anker USB-C Charger) ---
        $charger = Product::create([
            'uuid'              => Str::uuid(),
            'name'              => 'Anker Nano III 65W Fast Charger',
            'slug'              => 'anker-nano-iii-65w-charger',
            'description'       => 'High-speed compact wall charger for phones, tablets, and laptops.',
            'short_description' => '65W GaN II Fast Wall Charger',
            'category_id'       => $accessoriesCat->id,
            'brand_id'          => $brands['Anker']->id,
            'tax_category_id'   => 2,
            'hsn_code'          => '85044090',
            'warranty_months'   => 24,
            'is_active'         => true,
            'is_returnable'     => true,
            'is_serialized'     => false,
            'is_featured'       => false,
            'is_trending'       => true,
            'is_best_seller'    => true,
            'created_by'        => 1,
        ]);

        $v4 = ProductVariant::create([
            'product_id'        => $charger->id,
            'variant_name'      => 'Anker Nano III 65W - Alpine Green',
            'sku'               => 'ANK-65W-GRN',
            'barcode'           => '194644123456',
            'net_quantity'      => 1,
            'mrp'               => 39.99,
            'selling_price'     => 35.99,
            'cost_price'        => 18.00,
            'min_selling_price' => 30.00,
            'compare_price'     => 39.99,
            'weight'            => 112.00,
            'stock_alert_qty'   => 10,
            'is_active'         => true,
        ]);
        $v4->attributeValues()->attach([
            $createdValues['Color']['Alpine Green'],
        ]);
    }
}

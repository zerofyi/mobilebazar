<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_units', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();

            $table->string('manual_item_name')->nullable();
            $table->string('imei1', 50)->nullable()->unique();
            $table->string('imei2', 50)->nullable()->unique();
            $table->string('serial_number', 100)->nullable()->index();

            $table->string('device_condition', 50)->default('used'); // 'new', 'used', 'refurbished'
            $table->string('overall_health', 50)->default('super mint');
            $table->foreignId('health_id')->nullable();

            $table->date('activation_date')->nullable();
            $table->date('warranty_expiry_date')->nullable();
            $table->string('remaining_warranty', 100)->nullable();

            $table->boolean('is_saleable')->default(true);
            $table->string('status', 30)->default('available')->index(); // 'available', 'reserved', 'sold'

            // Unit Valuation
            $table->decimal('landed_cost', 12, 2)->default(0.00); // Total cash paid out of pocket
            $table->decimal('base_cost', 12, 2)->default(0.00); // Net asset cost (Excl. claimable GST)
            $table->decimal('wholesale_price', 12, 2)->nullable();
            $table->decimal('selling_price', 12, 2)->nullable(); // Inclusive MRP retail price

            // Margin Scheme Flag (Auto-set for used/pv stock)
            $table->boolean('is_margin_scheme')->default(false);

            // Source Links
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status', 'product_variant_id'], 'idx_stock_units_store_status_variant');
            $table->index(['store_id', 'status', 'device_condition'], 'idx_stock_units_condition_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_units');
    }
};

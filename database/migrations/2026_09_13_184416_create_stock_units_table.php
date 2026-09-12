<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
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
            $table->string('color', 50)->nullable();

            $table->string('device_condition', 50)->default('used');
            $table->string('health', 50)->default('super mint');
            $table->string('age', 50)->nullable();
            $table->string('warranty', 100)->nullable();

            $table->string('status', 30)->default('available')->index();

            $table->decimal('cost_price', 12, 2)->default(0.00);
            $table->decimal('selling_price', 12, 2)->nullable();

            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();
            $table->unsignedBigInteger('sold_invoice_item_id')->nullable();

            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status', 'product_variant_id'], 'idx_stock_units_store_status_variant');
            $table->index(['store_id', 'status', 'device_condition'], 'idx_stock_units_condition_lookup');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_units');
    }
};

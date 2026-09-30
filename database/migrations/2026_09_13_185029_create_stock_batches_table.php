<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_batches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('manual_item_name')->nullable();

            $table->string('batch_number', 50)->index();
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();

            // NEW — bulk goods can be bought secondhand too. Condition varies
            // per purchase batch even though the product_variant (and its
            // barcode/sku) stays identical across all of them.
            $table->string('product_condition', 50)->default('new'); // 'new', 'used', 'refurbished'
            $table->string('overall_health', 50)->nullable(); // only meaningful when condition != 'new'
            $table->string('remaining_warranty', 100)->nullable();

            $table->unsignedInteger('received_qty')->default(0);
            $table->unsignedInteger('remaining_qty')->default(0);

            $table->decimal('base_cost', 12, 2)->default(0.00);
            $table->decimal('landed_cost', 12, 2)->default(0.00);

            // NEW — per-batch price override. NULL = fall back to the
            // product_variant's standard price (the common "new stock" case).
            // Set explicitly when a batch's condition genuinely changes its price.
            $table->decimal('wholesale_price', 12, 2)->nullable();
            $table->decimal('selling_price', 12, 2)->nullable();

            $table->boolean('is_margin_scheme')->default(false);

            // NEW — mirrors stock_units.is_saleable. Lets a batch be received
            // but held (e.g. pending QC) before it's exposed for sale.
            $table->boolean('is_saleable')->default(true);

            $table->timestamps();

            $table->index(['store_id', 'product_variant_id', 'remaining_qty'], 'idx_batches_store_variant_qty');
            $table->index(['store_id', 'product_variant_id', 'product_condition'], 'idx_batches_condition_lookup');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_batches');
    }
};

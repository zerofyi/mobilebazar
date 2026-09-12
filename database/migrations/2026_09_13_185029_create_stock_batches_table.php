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
        Schema::create('stock_batches', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('manual_item_name')->nullable();

            $table->string('batch_number', 50)->index();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();

            $table->unsignedInteger('received_qty')->default(0);
            $table->unsignedInteger('remaining_qty')->default(0);
            $table->decimal('unit_cost', 12, 2)->default(0.00);

            $table->date('expiry_date')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'product_variant_id', 'remaining_qty'], 'idx_batches_store_variant_qty');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_batches');
    }
};

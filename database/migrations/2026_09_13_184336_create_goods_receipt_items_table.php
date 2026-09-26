<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goods_receipt_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('goods_receipt_id')->constrained('goods_receipts')->cascadeOnDelete();
            $table->foreignId('purchase_order_item_id')->nullable()->constrained('purchase_order_items')->nullOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('manual_item_name')->nullable();

            $table->unsignedInteger('received_qty');

            // Financial Costs (Parity with Stock Units / Batches)
            $table->decimal('unit_cost', 12, 2)->default(0.00); // Raw cost
            $table->decimal('base_cost', 12, 2)->default(0.00); // Excl. claimable GST
            $table->decimal('landed_cost', 12, 2)->default(0.00); // Total cash paid out

            $table->timestamps();

            $table->index(['goods_receipt_id', 'product_variant_id'], 'idx_gri_grn_variant');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_receipt_items');
    }
};

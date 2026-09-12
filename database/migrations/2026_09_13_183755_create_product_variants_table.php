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
        Schema::create('product_variants', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('variant_name');
            $table->string('sku')->unique();
            $table->string('barcode')->nullable()->unique();

            $table->foreignId('unit_id')->nullable()->constrained('units')->nullOnDelete();
            $table->decimal('net_quantity', 12, 4)->default(1.0000);

            $table->decimal('mrp', 12, 2)->default(0.00);
            $table->decimal('selling_price', 12, 2)->default(0.00);
            $table->decimal('cost_price', 12, 2)->default(0.00);
            $table->decimal('min_selling_price', 12, 2)->default(0.00);
            $table->decimal('compare_price', 12, 2)->nullable();
            $table->decimal('weight', 12, 4)->nullable();

            $table->integer('stock_alert_qty')->nullable();
            $table->boolean('is_active')->default(true);

            $table->softDeletes();
            $table->timestamps();

            $table->index(['product_id', 'is_active', 'deleted_at'], 'idx_variants_product_active');
            $table->index(['sku', 'is_active'], 'idx_variants_sku_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};

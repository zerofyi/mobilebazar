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
        Schema::create('return_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_return_id')->constrained('product_returns')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('manual_item_name')->nullable();

            $table->foreignId('stock_unit_id')->nullable()->constrained('stock_units')->nullOnDelete();

            $table->unsignedInteger('quantity')->default(1);
            $table->decimal('unit_amount', 12, 2)->default(0.00);
            $table->decimal('line_total', 12, 2)->default(0.00);

            $table->string('condition_on_return', 50)->default('good');
            $table->boolean('restock')->default(true);

            $table->timestamps();

            $table->index(['product_return_id', 'product_variant_id'], 'idx_ri_return_variant');
            $table->index(['stock_unit_id'], 'idx_ri_stock_unit');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('return_items');
    }
};

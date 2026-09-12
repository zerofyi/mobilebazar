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
        Schema::create('stock_adjustment_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('stock_adjustment_id')->constrained('stock_adjustments')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->foreignId('stock_unit_id')->nullable()->constrained('stock_units')->nullOnDelete();

            $table->integer('quantity_delta');
            $table->decimal('unit_cost', 12, 2)->default(0.00);
            $table->string('note')->nullable();

            $table->timestamps();

            $table->index(['stock_adjustment_id', 'product_variant_id'], 'idx_saj_adj_variant');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_adjustment_items');
    }
};

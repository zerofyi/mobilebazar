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
        Schema::create('stock_snapshots', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();

            $table->integer('quantity_on_hand')->default(0);
            $table->integer('quantity_reserved')->default(0);

            $table->string('rack_location', 50)->nullable();
            $table->unsignedInteger('reorder_point')->default(5);
            $table->unsignedInteger('reorder_qty')->default(10);

            $table->foreignId('last_ledger_id_applied')->nullable()->constrained('stock_ledgers')->nullOnDelete();

            $table->timestamps();

            $table->unique(['store_id', 'product_variant_id'], 'uniq_store_variant_snapshot');
            $table->index(['store_id', 'quantity_on_hand'], 'idx_snapshots_store_onhand');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_snapshots');
    }
};

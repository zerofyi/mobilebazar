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
        Schema::create('invoice_item_batch_allocations', function (Blueprint $table) {
            $table->id();

            $table->foreignId('invoice_item_id')->constrained('invoice_items')->cascadeOnDelete();
            $table->foreignId('stock_batch_id')->constrained('stock_batches')->cascadeOnDelete();

            $table->unsignedInteger('quantity');
            $table->decimal('unit_cost', 12, 2)->default(0.00);

            $table->timestamp('created_at')->useCurrent();

            $table->index(['invoice_item_id', 'stock_batch_id'], 'idx_iiba_item_batch');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoice_item_batch_allocations');
    }
};

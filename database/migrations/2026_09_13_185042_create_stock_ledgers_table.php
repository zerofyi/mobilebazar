<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_ledgers', function (Blueprint $table) {
            $table->id();
            $table->string('idempotency_key')->nullable()->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->foreignId('stock_batch_id')->nullable()->constrained('stock_batches')->nullOnDelete();

            $table->string('transaction_type', 50)->index(); // 'purchase', 'sale', 'return', 'adjustment'
            $table->integer('quantity_delta'); // Positive (+) for inward, Negative (-) for outward
            $table->integer('balance_after'); // Running balance for batch/variant

            // Financial Asset Valuation at moment of movement
            $table->decimal('base_cost', 12, 2)->default(0.00);
            $table->decimal('landed_cost', 12, 2)->default(0.00);

            $table->nullableMorphs('reference'); // Polymorphic link to PurchaseOrderItem, SaleItem, etc.

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['store_id', 'product_variant_id', 'created_at'], 'idx_ledger_store_variant_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_ledgers');
    }
};

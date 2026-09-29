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
            $table->string('transaction_type', 50)->index();
            $table->integer('quantity_delta');
            $table->integer('balance_after');
            $table->decimal('base_cost', 12, 2)->default(0.00);
            $table->decimal('landed_cost', 12, 2)->default(0.00);
            $table->nullableMorphs('reference');
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

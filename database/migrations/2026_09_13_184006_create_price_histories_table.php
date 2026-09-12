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
        Schema::create('price_histories', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();

            $table->decimal('old_mrp', 12, 2)->default(0.00);
            $table->decimal('new_mrp', 12, 2)->default(0.00);

            $table->decimal('old_selling_price', 12, 2)->default(0.00);
            $table->decimal('new_selling_price', 12, 2)->default(0.00);

            $table->decimal('old_cost_price', 12, 2)->default(0.00);
            $table->decimal('new_cost_price', 12, 2)->default(0.00);

            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('reason')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index(['product_variant_id', 'created_at'], 'idx_price_history_variant');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('price_histories');
    }
};

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
        Schema::create('daily_summaries', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->date('date');

            $table->decimal('total_sales', 14, 2)->default(0.00);
            $table->decimal('total_purchases', 14, 2)->default(0.00);
            $table->decimal('total_expenses', 14, 2)->default(0.00);
            $table->decimal('total_tax_collected', 14, 2)->default(0.00);
            $table->decimal('total_discounts', 14, 2)->default(0.00);

            $table->decimal('cash_collected', 14, 2)->default(0.00);
            $table->decimal('digital_collected', 14, 2)->default(0.00);
            $table->decimal('credit_given', 14, 2)->default(0.00);

            $table->decimal('loan_collections', 14, 2)->default(0.00);
            $table->decimal('gross_profit', 14, 2)->default(0.00);
            $table->decimal('net_profit', 14, 2)->default(0.00);

            $table->unsignedInteger('invoice_count')->default(0);
            $table->unsignedInteger('purchase_count')->default(0);

            $table->timestamp('created_at')->useCurrent();

            $table->unique(['store_id', 'date'], 'uniq_store_daily_summary');
            $table->index(['store_id', 'date'], 'idx_ds_store_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('daily_summaries');
    }
};

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
        Schema::create('monthly_summaries', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('year_month', 7);

            $table->decimal('total_sales', 14, 2)->default(0.00);
            $table->decimal('total_purchases', 14, 2)->default(0.00);
            $table->decimal('total_expenses', 14, 2)->default(0.00);
            $table->decimal('total_tax_liability', 14, 2)->default(0.00);

            $table->decimal('gross_profit', 14, 2)->default(0.00);
            $table->decimal('net_profit', 14, 2)->default(0.00);

            $table->decimal('closing_stock_value', 14, 2)->default(0.00);
            $table->decimal('total_receivables', 14, 2)->default(0.00);
            $table->decimal('total_payables', 14, 2)->default(0.00);

            $table->boolean('is_locked')->default(false);
            $table->timestamp('locked_at')->nullable();
            $table->foreignId('locked_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->unique(['store_id', 'year_month'], 'uniq_store_monthly_summary');
            $table->index(['store_id', 'year_month'], 'idx_ms_store_month');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('monthly_summaries');
    }
};

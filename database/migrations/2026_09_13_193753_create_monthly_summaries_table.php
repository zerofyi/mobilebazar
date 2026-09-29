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

            $table->foreignId('store_id')
                ->constrained('stores')
                ->cascadeOnDelete();

            $table->string('year_month', 7);

            // Sales
            $table->decimal('total_sales', 14, 2)->default(0.00);
            $table->decimal('new_sales', 14, 2)->default(0.00);
            $table->decimal('used_sales', 14, 2)->default(0.00);

            // Purchases
            $table->decimal('total_purchases', 14, 2)->default(0.00);
            $table->decimal('new_purchases', 14, 2)->default(0.00);
            $table->decimal('used_purchases', 14, 2)->default(0.00);

            // Returns / Discounts / Tax
            $table->decimal('total_refunds', 14, 2)->default(0.00);
            $table->decimal('total_discounts', 14, 2)->default(0.00);
            $table->decimal('total_tax_collected', 14, 2)->default(0.00);

            // Expenses
            $table->decimal('total_expenses', 14, 2)->default(0.00);

            // Loans / EMI
            $table->decimal('total_loan_given', 14, 2)->default(0.00);
            $table->decimal('total_emi_collected', 14, 2)->default(0.00);

            // Profit
            $table->decimal('gross_profit', 14, 2)->default(0.00);
            $table->decimal('net_profit', 14, 2)->default(0.00);

            // Closing / Balance Sheet Snapshot
            $table->decimal('closing_stock_value', 14, 2)->default(0.00);
            $table->decimal('total_receivables', 14, 2)->default(0.00);
            $table->decimal('total_payables', 14, 2)->default(0.00);

            // Transaction Counts
            $table->unsignedInteger('purchase_count')->default(0);
            $table->unsignedInteger('invoice_count')->default(0);
            $table->unsignedInteger('return_count')->default(0);
            $table->unsignedInteger('loans_count')->default(0);

            // Monthly Lock
            $table->boolean('is_locked')->default(false);
            $table->timestamp('locked_at')->nullable();

            $table->foreignId('locked_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->unique(
                ['store_id', 'year_month'],
                'uniq_store_monthly_summary'
            );
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

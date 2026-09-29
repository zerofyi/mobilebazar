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

            $table->decimal('new_purchases', 14, 2)->default(0.00);
            $table->decimal('used_purchases', 14, 2)->default(0.00);
            $table->decimal('total_purchases', 14, 2)->default(0.00);
            $table->decimal('total_purchases_serialized', 14, 2)->default(0.00);
            $table->decimal('total_purchases_non_serialized', 14, 2)->default(0.00);

            $table->decimal('new_sales', 14, 2)->default(0.00);
            $table->decimal('used_sales', 14, 2)->default(0.00);
            $table->decimal('total_sales', 14, 2)->default(0.00);
            $table->decimal('total_sales_serialized', 14, 2)->default(0.00);
            $table->decimal('total_sales_non_serialized', 14, 2)->default(0.00);

            $table->decimal('total_refunds', 14, 2)->default(0.00);

            $table->decimal('total_tax_collected', 14, 2)->default(0.00);
            $table->decimal('total_expenses', 14, 2)->default(0.00);
            $table->decimal('total_discounts', 14, 2)->default(0.00);

            $table->decimal('cash_collected', 14, 2)->default(0.00);
            $table->decimal('upi_collected', 14, 2)->default(0.00);
            $table->decimal('card_collected', 14, 2)->default(0.00);
            $table->decimal('bank_collected', 14, 2)->default(0.00);

            $table->decimal('total_loan_given', 14, 2)->default(0.00);
            $table->decimal('total_emi_collected', 14, 2)->default(0.00);

            $table->decimal('gross_profit', 14, 2)->default(0.00);
            $table->decimal('net_profit', 14, 2)->default(0.00);

            $table->unsignedInteger('purchase_count')->default(0);
            $table->unsignedInteger('purchase_items_count')->default(0);
            $table->unsignedInteger('invoice_count')->default(0);
            $table->unsignedInteger('invoice_items_count')->default(0);
            $table->unsignedInteger('return_count')->default(0);
            $table->unsignedInteger('return_items_count')->default(0);
            $table->unsignedInteger('loans_count')->default(0);

            $table->timestamps();
            $table->unique(['store_id', 'date'], 'uniq_store_daily_summary');
            $table->index('date');
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

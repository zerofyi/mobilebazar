<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-invoice payment breakdown: one row per payment mode used on a sale.
     * e.g. ₹1,000 cash + ₹15,000 UPI + ₹1,200 buyback on a single invoice.
     *
     * The invoices.paid_amount / payment_mode columns remain as cached
     * aggregates (sum / dominant mode) for list views; this table is the
     * truth for money movement and journal posting.
     *
     * Idempotent: safe to re-run after a partial failure.
     */
    public function up(): void
    {
        if (! Schema::hasTable('invoice_payments')) {
            Schema::create('invoice_payments', function (Blueprint $table) {
                $table->id();
                $table->uuid('uuid')->unique();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->string('payment_mode', 30)->index();
                $table->decimal('amount', 12, 2);
                $table->string('reference', 100)->nullable();
                // Buyback splits link to the purchase bill that funded them.
                $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['invoice_id', 'payment_mode'], 'idx_ip_invoice_mode');
            });
        }

        // Buyback is a non-cash settlement — track it separately from collected cash.
        if (! Schema::hasColumn('daily_summaries', 'buyback_adjusted')) {
            Schema::table('daily_summaries', function (Blueprint $table) {
                if (Schema::hasColumn('daily_summaries', 'bank_collected')) {
                    $table->decimal('buyback_adjusted', 14, 2)->default(0.00)->after('bank_collected');
                } else {
                    $table->decimal('buyback_adjusted', 14, 2)->default(0.00);
                }
            });
        }
        if (! Schema::hasColumn('monthly_summaries', 'buyback_adjusted')) {
            Schema::table('monthly_summaries', function (Blueprint $table) {
                if (Schema::hasColumn('monthly_summaries', 'total_emi_collected')) {
                    $table->decimal('buyback_adjusted', 14, 2)->default(0.00)->after('total_emi_collected');
                } else {
                    $table->decimal('buyback_adjusted', 14, 2)->default(0.00);
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('monthly_summaries', 'buyback_adjusted')) {
            Schema::table('monthly_summaries', function (Blueprint $table) {
                $table->dropColumn('buyback_adjusted');
            });
        }
        if (Schema::hasColumn('daily_summaries', 'buyback_adjusted')) {
            Schema::table('daily_summaries', function (Blueprint $table) {
                $table->dropColumn('buyback_adjusted');
            });
        }
        Schema::dropIfExists('invoice_payments');
    }
};

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
        Schema::create('invoices', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('invoice_number', 50)->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('channel_id')->nullable()->constrained('channels')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();

            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();

            $table->string('customer_name')->nullable();
            $table->string('customer_phone', 20)->nullable();

            $table->date('invoice_date');
            $table->date('due_date')->nullable();

            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('round_off', 8, 2)->default(0.00);
            $table->decimal('grand_total', 12, 2)->default(0.00);

            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('due_amount', 12, 2)->default(0.00);

            $table->string('payment_status', 30)->default('paid')->index();
            $table->string('payment_mode', 30)->default('cash');
            $table->string('invoice_type', 30)->default('retail')->index();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'invoice_date', 'payment_status'], 'idx_invoices_store_date_status');
            $table->index(['customer_id', 'payment_status'], 'idx_invoices_customer_status');
            $table->index(['shift_id', 'payment_mode'], 'idx_invoices_shift_mode');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};

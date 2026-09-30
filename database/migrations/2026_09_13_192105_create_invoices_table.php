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
            $table->string('identity', 20)->unique();

            $table->string('invoice_number', 50);
            $table->uuid('idempotency_key')->nullable()->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('channel_id')->nullable()->constrained('channels')->nullOnDelete();

            $table->nullableMorphs('party'); // Customer or Supplier

            $table->foreignId('order_id')->nullable()->constrained('orders')->nullOnDelete();

            $table->date('invoice_date');
            $table->date('due_date')->nullable();

            $table->boolean('is_gst_billed')->default(false);
            $table->boolean('is_intra_state')->default(true);

            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);

            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('shipping_charge', 12, 2)->default(0.00);

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

            $table->unique(['store_id', 'invoice_number'], 'invoices_store_invoice_unique');

            $table->index(['store_id', 'invoice_date', 'payment_status'], 'idx_invoices_store_date_status');
            $table->index(['party_type', 'party_id', 'payment_status'], 'idx_invoices_party_status');
        });

        Schema::create('sale_number_sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();
            $table->unsignedBigInteger('next_number')->default(2);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('sale_number_sequences');
    }
};

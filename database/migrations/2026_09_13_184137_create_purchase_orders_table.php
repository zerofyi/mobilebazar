<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('identity', 20)->unique();

            // 'po' = Registered B2B Tax Invoice | 'pv' = Unregistered Self-Invoice / Purchase Voucher
            $table->enum('bill_type', ['po', 'pv'])->default('pv')->index();
            $table->string('po_number', 50)->unique(); // Internal sequence (e.g., PO-1001 or PV-1001)
            $table->string('idempotency_key', 64)->nullable()->unique();
            $table->string('vendor_invoice_no', 100)->nullable(); // External bill no. from vendor

            // Polymorphic Vendor: Registered Vendor (B2B) OR Customer (Unregistered Seller)
            $table->nullableMorphs('vendor');

            $table->string('type', 30)->default('direct')->index(); // 'direct', 'po'
            $table->string('status', 30)->default('completed')->index(); // 'draft', 'pending', 'completed'

            $table->date('order_date');
            $table->date('due_date')->nullable();
            $table->date('expected_date')->nullable();

            // Store GST State at the exact time of purchase (Prevents historical recalculation bugs)
            $table->boolean('is_gst_billed')->default(false);

            // True = CGST + SGST (Same State) | False = IGST (Out of State)
            $table->boolean('is_intra_state')->default(true);

            // Financial Summary
            $table->decimal('subtotal', 12, 2)->default(0.00); // Net base value
            $table->decimal('tax_amount', 12, 2)->default(0.00); // Total GST (Always 0.00 for bill_type = 'pv')
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('shipping_charge', 12, 2)->default(0.00);
            $table->decimal('grand_total', 12, 2)->default(0.00); // Total payable

            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('due_amount', 12, 2)->default(0.00);

            $table->string('payment_status', 30)->default('paid')->index(); // 'paid', 'partial', 'unpaid'
            $table->string('payment_mode', 30)->default('cash');

            $table->string('invoice_document_path')->nullable();
            $table->string('additional_document_path')->nullable();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['store_id', 'status', 'order_date'], 'idx_po_store_status_date');
            $table->index(['store_id', 'bill_type', 'order_date'], 'idx_po_store_bill_date');
        });

        Schema::create('purchase_number_sequences', function (Blueprint $table) {
            $table->unsignedBigInteger('store_id')->primary();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });

    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_orders');
        Schema::dropIfExists('purchase_number_sequences');
    }
};

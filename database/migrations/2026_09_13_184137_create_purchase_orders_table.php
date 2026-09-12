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
        Schema::create('purchase_orders', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('po_number', 50)->unique();
            $table->string('vendor_invoice_no', 100)->nullable();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->string('vendor_type', 30)->default('supplier')->index();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();

            $table->string('status', 30)->default('draft')->index();

            $table->date('order_date');
            $table->date('due_date')->nullable();
            $table->date('expected_date')->nullable();

            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('tax_amount', 12, 2)->default(0.00);
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('shipping_charge', 12, 2)->default(0.00);
            $table->decimal('grand_total', 12, 2)->default(0.00);

            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('due_amount', 12, 2)->default(0.00);

            $table->string('payment_status', 30)->default('paid')->index();
            $table->string('payment_mode', 30)->default('cash');

            $table->foreignId('invoice_document_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->foreignId('additional_document_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->text('notes')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['store_id', 'status', 'order_date'], 'idx_po_store_status_date');
            $table->index(['supplier_id', 'status'], 'idx_po_supplier_status');
            $table->index(['customer_id', 'status'], 'idx_po_customer_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('purchase_orders');
    }
};

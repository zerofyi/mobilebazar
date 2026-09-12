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
        Schema::create('loans', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('loan_number', 50)->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->restrictOnDelete();
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->foreignId('financer_id')->nullable()->constrained('financers')->nullOnDelete();

            $table->decimal('principal_amount', 12, 2);
            $table->decimal('down_payment', 12, 2)->default(0.00);
            $table->decimal('interest_rate', 5, 2)->default(0.00);
            $table->decimal('processing_fee', 12, 2)->default(0.00);
            $table->decimal('total_interest', 12, 2)->default(0.00);
            $table->decimal('total_payable', 12, 2);
            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('balance_amount', 12, 2);

            $table->unsignedInteger('tenure_months');
            $table->string('emi_frequency', 20)->default('monthly');
            $table->decimal('emi_amount', 12, 2);

            $table->string('status', 30)->default('active')->index();
            $table->date('disbursed_date');
            $table->date('first_emi_date');
            $table->date('closed_date')->nullable();

            $table->foreignId('assigned_agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['store_id', 'status', 'disbursed_date'], 'idx_loans_store_status_date');
            $table->index(['customer_id', 'status'], 'idx_loans_customer_status');
            $table->index(['assigned_agent_id', 'status'], 'idx_loans_agent_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('loans');
    }
};

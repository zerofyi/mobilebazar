<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Loans table — consolidated for migrate:fresh (2026-09-30).
 *
 * Folded in (previously separate alter migrations, now deleted):
 *  - 2026_09_30_070200: file_charge_mode (D2), collection_slab (D3),
 *    settled_at / defaulted_at / outstanding_balance_at_default (D4).
 *  - 2026_09_30_070400: borrower morph — replaces the old customer_id FK.
 *    Borrower is a polymorphic Customer|Supplier (nullableMorphs).
 */
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
            $table->nullableMorphs('borrower'); // Customer or Supplier
            $table->foreignId('invoice_id')->nullable()->constrained('invoices')->nullOnDelete();
            $table->foreignId('financer_id')->constrained('financers')->cascadeOnDelete();

            $table->decimal('principal_amount', 12, 2);
            $table->decimal('down_payment', 12, 2)->default(0.00);
            $table->decimal('interest_rate', 5, 2)->default(0.00);
            $table->decimal('processing_fee', 12, 2)->default(0.00);
            $table->enum('file_charge_mode', ['upfront', 'spread'])->default('upfront');
            $table->decimal('total_interest', 12, 2)->default(0.00);
            $table->decimal('total_payable', 12, 2);
            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('balance_amount', 12, 2);

            $table->unsignedInteger('tenure_months');
            $table->string('emi_frequency', 20)->default('monthly');
            $table->string('collection_slab', 50)->nullable();
            $table->decimal('emi_amount', 12, 2);

            $table->string('status', 30)->default('active')->index();
            $table->date('disbursed_date');
            $table->date('first_emi_date');
            $table->date('closed_date')->nullable();
            $table->timestamp('settled_at')->nullable();
            $table->timestamp('defaulted_at')->nullable();
            $table->decimal('outstanding_balance_at_default', 12, 2)->nullable();

            $table->foreignId('assigned_agent_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['store_id', 'status', 'disbursed_date'], 'idx_loans_store_status_date');
            $table->index(['borrower_type', 'borrower_id', 'status'], 'idx_loans_borrower_status');
            $table->index(['assigned_agent_id', 'status'], 'idx_loans_agent_status');
        });

        Schema::create('loan_number_sequences', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->unique()->constrained('stores')->cascadeOnDelete();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('loans');
        Schema::dropIfExists('loan_number_sequences');
    }
};

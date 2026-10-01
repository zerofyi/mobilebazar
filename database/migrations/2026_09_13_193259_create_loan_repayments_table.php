<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Loan repayments — consolidated for migrate:fresh (2026-09-30).
 * Folded in: 2026_09_30_070500 (collector notes).
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('loan_repayments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->foreignId('loan_schedule_id')->nullable()->constrained('loan_schedules')->nullOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->string('receipt_number', 50)->unique();
            $table->decimal('amount', 12, 2);
            $table->decimal('principal_component', 12, 2)->default(0.00);
            $table->decimal('interest_component', 12, 2)->default(0.00);
            $table->decimal('penalty_collected', 12, 2)->default(0.00);

            $table->string('payment_mode', 30)->default('cash')->index();
            $table->string('txn_reference', 100)->nullable();
            $table->text('notes')->nullable();

            $table->foreignId('collected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();

            $table->timestamp('paid_at')->useCurrent();
            $table->timestamps();

            $table->index(['loan_id', 'paid_at'], 'idx_lr_loan_paid_at');
            $table->index(['collected_by', 'paid_at'], 'idx_lr_agent_paid_at');
        });

        Schema::create('loan_receipt_sequences', function (Blueprint $table) {
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
        Schema::dropIfExists('loan_repayments');
        Schema::dropIfExists('loan_receipt_sequences');
    }
};

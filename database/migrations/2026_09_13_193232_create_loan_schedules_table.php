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
        Schema::create('loan_schedules', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->unsignedInteger('installment_no');

            $table->date('due_date');
            $table->decimal('principal_amount', 12, 2);
            $table->decimal('interest_amount', 12, 2);
            $table->decimal('total_due', 12, 2);

            $table->decimal('paid_amount', 12, 2)->default(0.00);
            $table->decimal('penalty_amount', 12, 2)->default(0.00);

            $table->string('status', 30)->default('pending')->index();
            $table->date('paid_date')->nullable();

            $table->timestamps();

            $table->unique(['loan_id', 'installment_no'], 'uniq_loan_installment');
            $table->index(['loan_id', 'status', 'due_date'], 'idx_ls_loan_status_due');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('loan_schedules');
    }
};

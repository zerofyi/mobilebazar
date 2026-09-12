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
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->morphs('payable');
            $table->nullableMorphs('payer');

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->string('payment_mode', 30)->default('cash')->index();
            $table->decimal('amount', 12, 2);

            $table->string('txn_reference', 100)->nullable()->index();
            $table->string('gateway', 50)->nullable();
            $table->string('status', 30)->default('completed')->index();

            $table->timestamp('paid_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'payment_mode', 'paid_at'], 'idx_payments_store_mode_date');
            $table->index(['payable_type', 'payable_id', 'status'], 'idx_payments_payable_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};

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
        Schema::create('transactions', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('payment_id')->constrained('payments')->cascadeOnDelete();
            $table->string('gateway', 50);
            $table->string('gateway_txn_id', 100)->nullable()->index();

            $table->json('request_payload')->nullable();
            $table->json('response_payload')->nullable();

            $table->string('status', 30)->default('success');
            $table->timestamps();

            $table->index(['payment_id', 'status'], 'idx_transactions_payment_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};

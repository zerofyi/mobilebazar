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
        Schema::create('journal_lines', function (Blueprint $table) {
            $table->id();

            $table->foreignId('journal_entry_id')->constrained('journal_entries')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();

            $table->decimal('debit', 14, 2)->default(0.00);
            $table->decimal('credit', 14, 2)->default(0.00);
            $table->string('memo')->nullable();

            $table->timestamps();

            $table->index(['journal_entry_id', 'account_id'], 'idx_jl_entry_account');
            $table->index(['account_id', 'created_at'], 'idx_jl_account_created');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('journal_lines');
    }
};

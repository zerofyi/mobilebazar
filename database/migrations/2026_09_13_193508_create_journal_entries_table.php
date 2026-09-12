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
        Schema::create('journal_entries', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('entry_number', 50)->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->date('entry_date');
            $table->nullableMorphs('reference');

            $table->decimal('total_debit', 14, 2)->default(0.00);
            $table->decimal('total_credit', 14, 2)->default(0.00);

            $table->text('narration')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'entry_date'], 'idx_je_store_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('journal_entries');
    }
};

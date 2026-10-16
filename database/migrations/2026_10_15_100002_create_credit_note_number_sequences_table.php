<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-store credit-note numbering sequence.
     * Idempotent: safe to re-run after a partial failure.
     */
    public function up(): void
    {
        if (! Schema::hasTable('credit_note_number_sequences')) {
            Schema::create('credit_note_number_sequences', function (Blueprint $table) {
                $table->id();
                $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
                $table->unsignedBigInteger('next_number')->default(1);
                $table->timestamps();

                $table->unique('store_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('credit_note_number_sequences');
    }
};

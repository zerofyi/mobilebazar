<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Per-store debit note number sequence, mirroring purchase_number_sequences.
     * The INSERT ... ON DUPLICATE KEY UPDATE reservation in DebitNoteService
     * takes an exclusive row lock held until commit, so two concurrent debit
     * notes can never receive the same number.
     */
    public function up(): void
    {
        Schema::create('debit_note_number_sequences', function (Blueprint $table) {
            $table->unsignedBigInteger('store_id')->primary();
            $table->unsignedBigInteger('next_number')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('debit_note_number_sequences');
    }
};

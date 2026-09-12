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
        Schema::create('guarantors', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->string('name');
            $table->string('relation', 50)->nullable();
            $table->string('phone', 20)->index();
            $table->string('aadhaar_number', 20)->nullable()->index();
            $table->string('pan_number', 20)->nullable()->index();
            $table->foreignId('address_id')->nullable()->constrained('addresses')->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['loan_id', 'phone'], 'idx_guarantors_loan_phone');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('guarantors');
    }
};

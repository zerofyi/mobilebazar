<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Agreements — consolidated for migrate:fresh (2026-09-30).
 * Folded in: 2026_09_30_070600 (signed_document_path plain-path storage
 * for the signed agreement scan; the asset-library columns are untouched).
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('agreements', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->string('agreement_number', 50)->unique();
            $table->string('template_name', 100)->default('standard_device_financing');

            $table->longText('terms_and_conditions');
            $table->foreignId('signed_document_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->string('signed_document_path', 255)->nullable();
            $table->foreignId('customer_signature_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->timestamp('signed_at')->nullable();
            $table->string('ip_address', 45)->nullable();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['loan_id', 'agreement_number'], 'idx_agreements_loan_number');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('agreements');
    }
};

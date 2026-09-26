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
        Schema::create('financers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name');
            $table->string('mobile')->index();

            $table->string('signature_path')->nullable();

            $table->string('type')->default('individual');
            $table->boolean('is_active')->default(true);

            $table->decimal('limit', 12, 2)->nullable();
            $table->decimal('balance', 12, 2)->default(0.00);

            $table->softDeletes();
            $table->timestamps();

            $table->index(['is_active', 'type'], 'idx_financers_status_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('financers');
    }
};

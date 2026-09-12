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
        Schema::create('loan_collection_visits', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('loan_id')->constrained('loans')->cascadeOnDelete();
            $table->foreignId('agent_id')->constrained('users')->cascadeOnDelete();

            $table->string('outcome', 50);
            $table->decimal('amount_collected', 12, 2)->default(0.00);

            $table->decimal('lat', 10, 8)->nullable();
            $table->decimal('lng', 11, 8)->nullable();

            $table->foreignId('visit_photo_asset_id')->nullable()->constrained('assets')->nullOnDelete();
            $table->text('notes')->nullable();

            $table->timestamp('visited_at')->useCurrent();
            $table->timestamps();

            $table->index(['loan_id', 'visited_at'], 'idx_lcv_loan_visit_date');
            $table->index(['agent_id', 'visited_at'], 'idx_lcv_agent_visit_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('loan_collection_visits');
    }
};

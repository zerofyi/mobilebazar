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
        Schema::create('delivery_attempts', function (Blueprint $table) {
            $table->id();

            $table->foreignId('delivery_id')->constrained('deliveries')->cascadeOnDelete();
            $table->unsignedTinyInteger('attempt_no')->default(1);
            $table->string('status', 30);
            $table->text('note')->nullable();

            $table->decimal('lat', 10, 8)->nullable();
            $table->decimal('lng', 11, 8)->nullable();

            $table->string('photo_path')->nullable();
            $table->foreignId('photo_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->timestamp('attempted_at')->useCurrent();
            $table->timestamps();

            $table->index(['delivery_id', 'attempt_no'], 'idx_da_delivery_attempt');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('delivery_attempts');
    }
};

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
        Schema::create('device_healths', function (Blueprint $table) {
            $table->id();

            $table->foreignId('stock_unit_id')->constrained('stock_units')->cascadeOnDelete();
            $table->unsignedTinyInteger('battery_health_pct')->nullable();
            $table->json('checklist_json')->nullable();

            $table->foreignId('checked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('checked_at')->nullable();

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('device_healths');
    }
};

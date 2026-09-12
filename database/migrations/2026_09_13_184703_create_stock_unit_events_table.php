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
        Schema::create('stock_unit_events', function (Blueprint $table) {
            $table->id();

            $table->foreignId('stock_unit_id')->constrained('stock_units')->cascadeOnDelete();
            $table->string('event_type', 50);

            $table->foreignId('from_store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('to_store_id')->nullable()->constrained('stores')->nullOnDelete();

            $table->nullableMorphs('reference');

            $table->text('note')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('created_at')->useCurrent();

            $table->index(['stock_unit_id', 'created_at'], 'idx_sue_unit_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stock_unit_events');
    }
};

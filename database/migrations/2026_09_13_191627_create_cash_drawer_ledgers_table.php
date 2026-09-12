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
        Schema::create('cash_drawer_ledgers', function (Blueprint $table) {
            $table->id();

            $table->foreignId('shift_id')->constrained('shifts')->cascadeOnDelete();
            $table->string('type', 50)->index();

            $table->decimal('amount', 12, 2);
            $table->string('reason')->nullable();

            $table->nullableMorphs('reference');

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['shift_id', 'type', 'created_at'], 'idx_drawer_shift_type_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('cash_drawer_ledgers');
    }
};

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
        Schema::create('store_users', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->string('role')->default('staff');
            $table->boolean('is_active')->default(true);
            $table->timestamp('joined_at')->nullable();

            $table->decimal('base_salary', 12, 2)->default(0.00);
            $table->decimal('commission', 12, 2)->default(0.00);

            $table->timestamps();

            $table->index(['store_id', 'user_id', 'is_active'], 'idx_store_users_lookup');
            $table->index(['role', 'is_active'], 'idx_store_users_role_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('store_users');
    }
};

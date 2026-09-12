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
        Schema::create('settings', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            $table->string('key', 100);
            $table->json('value')->nullable();
            $table->string('group', 50)->default('general')->index();

            $table->boolean('is_public')->default(false);
            $table->boolean('is_locked')->default(false);

            $table->foreignId('updated_by_user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->unique(['store_id', 'key'], 'uniq_store_setting_key');
            $table->index(['group', 'is_public'], 'idx_settings_group_public');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};

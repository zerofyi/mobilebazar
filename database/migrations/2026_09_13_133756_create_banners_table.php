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
        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            $table->string('title');

            $table->string('image_path');
            $table->foreignId('image_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->string('url_type', 50)->default('product');
            $table->string('url')->nullable();

            $table->string('position', 50)->default('main_slider');
            $table->integer('sort_order')->default(0);

            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['store_id', 'is_active', 'position'], 'idx_banners_store_active');
            $table->index(['starts_at', 'ends_at'], 'idx_banners_schedule');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('banners');
    }
};

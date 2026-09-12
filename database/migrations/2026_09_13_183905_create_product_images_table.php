<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_images', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->cascadeOnDelete();

            // Bridge to zerofyi/media assets table
            $table->foreignId('asset_id')->nullable()->constrained('assets')->nullOnDelete();

            // Denormalized paths for fast catalog reads
            $table->string('asset_path')->nullable();
            $table->string('thumb_path')->nullable();

            $table->boolean('is_primary')->default(false);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'is_primary'], 'idx_product_images_primary');
            $table->index(['product_variant_id', 'sort_order'], 'idx_variant_images_sort');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_images');
    }
};

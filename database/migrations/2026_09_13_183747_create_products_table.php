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
        Schema::create('products', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->text('short_description')->nullable();

            $table->foreignId('category_id')->constrained('categories')->cascadeOnDelete();
            $table->foreignId('brand_id')->nullable()->constrained('brands')->nullOnDelete();
            $table->foreignId('tax_category_id')->nullable()->constrained('tax_categories')->nullOnDelete();

            $table->string('hsn_code')->nullable();
            $table->unsignedInteger('warranty_months')->default(12);

            $table->boolean('is_active')->default(true);
            $table->boolean('is_returnable')->default(true);
            $table->boolean('is_serialized')->default(true);
            $table->boolean('is_featured')->default(false);
            $table->boolean('is_trending')->default(false);
            $table->boolean('is_best_seller')->default(false);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->softDeletes();
            $table->timestamps();

            $table->index(['category_id', 'is_active', 'deleted_at'], 'idx_products_category_active');
            $table->index(['brand_id', 'is_active', 'deleted_at'], 'idx_products_brand_active');
            $table->index(['is_featured', 'is_trending', 'is_best_seller'], 'idx_products_marketing_flags');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};

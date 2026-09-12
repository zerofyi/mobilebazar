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
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();

            $table->string('code', 50)->unique();
            $table->string('name', 100);
            $table->string('type', 30)->default('fixed');
            $table->decimal('value', 10, 2);

            $table->decimal('min_cart_value', 10, 2)->default(0.00);
            $table->decimal('max_discount', 10, 2)->nullable();

            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();

            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('used_count')->default(0);
            $table->unsignedInteger('per_customer_limit')->default(1);

            $table->boolean('is_active')->default(true);

            $table->softDeletes();
            $table->timestamps();

            $table->index(['store_id', 'is_active', 'starts_at', 'ends_at'], 'idx_coupons_active_dates');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('coupons');
    }
};

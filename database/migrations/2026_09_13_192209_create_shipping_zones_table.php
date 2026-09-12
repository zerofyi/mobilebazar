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
        Schema::create('shipping_zones', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('region_pattern')->nullable();
            $table->json('pincodes')->nullable();

            $table->decimal('base_fee', 10, 2)->default(0.00);
            $table->unsignedInteger('eta_days')->default(1);
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            $table->index(['store_id', 'is_active'], 'idx_shipping_zones_store_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shipping_zones');
    }
};

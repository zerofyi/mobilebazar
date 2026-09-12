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
        Schema::create('addresses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->nullableMorphs('addressable');
            $table->string('type', 30)->default('shipping');

            $table->string('line1')->nullable();
            $table->string('line2')->nullable();
            $table->string('city')->nullable();
            $table->string('state')->nullable();
            $table->string('postal_code', 20)->nullable()->index();
            $table->string('country', 100)->default('India');

            $table->string('village_or_area')->nullable();
            $table->string('post_office')->nullable();
            $table->string('police_station')->nullable();
            $table->string('district')->nullable();

            $table->decimal('lat', 10, 8)->nullable();
            $table->decimal('lng', 11, 8)->nullable();

            $table->boolean('is_default')->default(false);
            $table->timestamps();

            $table->index(['addressable_type', 'addressable_id', 'is_default'], 'idx_addresses_owner_default');
            $table->index(['state', 'district', 'city'], 'idx_addresses_location_lookup');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('addresses');
    }
};

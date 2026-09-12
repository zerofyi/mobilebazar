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
        Schema::create('tax_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->decimal('tax_percent', 5, 2);
            $table->boolean('is_inclusive')->default(true);
            $table->timestamps();

            $table->index(['tax_percent', 'is_inclusive'], 'idx_tax_cat_percent_inclusive');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('tax_categories');
    }
};

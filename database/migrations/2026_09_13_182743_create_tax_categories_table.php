<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->decimal('tax_percent', 5, 2)->index('idx_tax_categories_percent');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_categories');
    }
};

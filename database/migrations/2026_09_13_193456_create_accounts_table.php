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
        Schema::create('accounts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            $table->foreignId('parent_id')->nullable()->constrained('accounts')->nullOnDelete();

            $table->string('code', 50)->index();
            $table->string('name', 100);
            $table->string('type', 30)->index();

            $table->decimal('opening_balance', 14, 2)->default(0.00);
            $table->decimal('current_balance', 14, 2)->default(0.00);

            $table->boolean('is_system')->default(false);
            $table->boolean('is_active')->default(true);

            $table->softDeletes();
            $table->timestamps();

            $table->unique(['store_id', 'code'], 'uniq_store_account_code');
            $table->index(['store_id', 'type', 'is_active'], 'idx_accounts_store_type');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('accounts');
    }
};

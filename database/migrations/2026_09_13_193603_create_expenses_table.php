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
        Schema::create('expenses', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('expense_number', 50)->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('account_id')->constrained('accounts')->restrictOnDelete();

            $table->string('category', 50)->index();
            $table->string('title');

            $table->decimal('amount', 12, 2);
            $table->decimal('tax_amount', 12, 2)->default(0.00);

            $table->string('payment_mode', 30)->default('cash');
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();

            $table->date('expense_date');
            $table->foreignId('receipt_asset_id')->nullable()->constrained('assets')->nullOnDelete();

            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'category', 'expense_date'], 'idx_expenses_store_cat_date');
            $table->index(['shift_id', 'payment_mode'], 'idx_expenses_shift_mode');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('expenses');
    }
};

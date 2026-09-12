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
        Schema::create('product_returns', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('return_number', 50)->unique();
            $table->string('direction', 20)->default('inward')->index();

            $table->nullableMorphs('reference');
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();

            $table->string('reason');
            $table->string('status', 30)->default('received')->index();

            $table->decimal('total_refund_amount', 12, 2)->default(0.00);
            $table->string('refund_mode', 30)->default('cash');

            $table->text('notes')->nullable();
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'direction', 'status'], 'idx_returns_store_dir_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_returns');
    }
};

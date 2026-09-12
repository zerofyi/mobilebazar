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
        Schema::create('orders', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('order_number', 50)->unique();
            $table->foreignId('cart_id')->nullable()->constrained('carts')->nullOnDelete();
            $table->foreignId('channel_id')->nullable()->constrained('channels')->nullOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained('customers')->nullOnDelete();

            $table->string('status', 30)->default('placed')->index();
            $table->string('payment_status', 30)->default('pending')->index();

            $table->decimal('subtotal', 12, 2)->default(0.00);
            $table->decimal('discount_total', 12, 2)->default(0.00);
            $table->decimal('tax_total', 12, 2)->default(0.00);
            $table->decimal('shipping_total', 12, 2)->default(0.00);
            $table->decimal('grand_total', 12, 2)->default(0.00);

            $table->foreignId('address_id')->nullable()->constrained('addresses')->nullOnDelete();
            $table->json('address_snapshot')->nullable();

            $table->timestamp('placed_at')->useCurrent();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            $table->index(['store_id', 'status', 'placed_at'], 'idx_orders_store_status_placed');
            $table->index(['customer_id', 'status'], 'idx_orders_customer_status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('goods_receipts', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('grn_number', 50)->unique(); // e.g., GRN-2026-0001
            $table->foreignId('purchase_order_id')->nullable()->constrained('purchase_orders')->nullOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();

            $table->foreignId('received_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('received_date');

            $table->string('status', 30)->default('received')->index(); // 'draft', 'received', 'cancelled'
            $table->text('notes')->nullable();

            $table->timestamps();

            $table->index(['store_id', 'status', 'received_date'], 'idx_grn_store_status_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('goods_receipts');
    }
};

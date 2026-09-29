<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_snapshots', function (Blueprint $table) {
            $table->id();

            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->constrained('product_variants')->cascadeOnDelete();

            // Real-Time Total Quantity Counts
            $table->integer('total_quantity')->default(0); // Lifetime total units ever added to stock
            $table->integer('quantity_on_hand')->default(0); // Total available units (Serialized + Non-Serialized)
            $table->integer('quantity_reserved')->default(0); // Held in pending carts / draft sales

            // Event Pointers for Sequential Processing Sync
            $table->foreignId('last_ledger_id_applied')->nullable()->constrained('stock_ledgers')->nullOnDelete();
            $table->foreignId('last_unit_event_id_applied')->nullable()->constrained('stock_unit_events')->nullOnDelete();

            $table->timestamps();

            $table->unique(['store_id', 'product_variant_id'], 'uniq_store_variant_snapshot');
            $table->index(['store_id', 'quantity_on_hand'], 'idx_snapshots_store_onhand');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_snapshots');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock transfer foundation (inter-store sale + purchase bridge).
 *
 *  1. suppliers.linked_store_id — a supplier record can be attached to the
 *     store it represents (one-time setup from Suppliers → Attach Store).
 *     Unique per owner store: one supplier per linked store.
 *  2. stock_transfers gains the two document links that make it a bridge:
 *     the sale invoice issued by the source store and the purchase order
 *     booked by the target store. No items/prices live on the transfer —
 *     they stay on the two documents so credit/debit notes keep working.
 *  3. stock_transfer_number_sequences — per-source-store TRF numbering,
 *     mirroring debit_note_number_sequences.
 *  4. stock_transfer_items is dropped: created in 2026_09_13 but never
 *     wired to any code; the bridge design replaces it.
 *
 * Every step is guarded so a partial failure re-runs cleanly.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('suppliers') && ! Schema::hasColumn('suppliers', 'linked_store_id')) {
            Schema::table('suppliers', function (Blueprint $table) {
                $table->foreignId('linked_store_id')
                    ->nullable()
                    ->constrained('stores')
                    ->nullOnDelete();
                $table->unique(['store_id', 'linked_store_id'], 'uq_supplier_linked_store');
            });
        }

        if (Schema::hasTable('stock_transfers')) {
            Schema::table('stock_transfers', function (Blueprint $table) {
                if (! Schema::hasColumn('stock_transfers', 'sale_invoice_id')) {
                    $table->foreignId('sale_invoice_id')
                        ->nullable()
                        ->constrained('invoices')
                        ->nullOnDelete();
                }
                if (! Schema::hasColumn('stock_transfers', 'purchase_order_id')) {
                    $table->foreignId('purchase_order_id')
                        ->nullable()
                        ->constrained('purchase_orders')
                        ->nullOnDelete();
                }
            });
        }

        if (! Schema::hasTable('stock_transfer_number_sequences')) {
            Schema::create('stock_transfer_number_sequences', function (Blueprint $table) {
                $table->unsignedBigInteger('store_id')->primary();
                $table->unsignedBigInteger('next_number')->default(1);
                $table->timestamps();
            });
        }

        Schema::dropIfExists('stock_transfer_items');
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_transfer_number_sequences');

        if (Schema::hasTable('stock_transfers')) {
            Schema::table('stock_transfers', function (Blueprint $table) {
                if (Schema::hasColumn('stock_transfers', 'sale_invoice_id')) {
                    $table->dropConstrainedForeignId('sale_invoice_id');
                }
                if (Schema::hasColumn('stock_transfers', 'purchase_order_id')) {
                    $table->dropConstrainedForeignId('purchase_order_id');
                }
            });
        }

        if (Schema::hasTable('suppliers') && Schema::hasColumn('suppliers', 'linked_store_id')) {
            Schema::table('suppliers', function (Blueprint $table) {
                $table->dropUnique('uq_supplier_linked_store');
                $table->dropConstrainedForeignId('linked_store_id');
            });
        }

        // stock_transfer_items is intentionally NOT recreated — the table
        // shipped in 2026_09_13_185318 was never used by any code path.
    }
};

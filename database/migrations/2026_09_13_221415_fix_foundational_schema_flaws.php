<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Deferred FKs due to execution order constraints
        Schema::table('goods_receipt_items', function (Blueprint $table) {
            $table->foreignId('condition_id')->nullable()->change()->constrained('device_conditions')->nullOnDelete();
        });

        Schema::table('stock_units', function (Blueprint $table) {
            $table->foreignId('sold_invoice_item_id')->nullable()->change()->constrained('invoice_items')->nullOnDelete();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->change()->constrained('stores')->nullOnDelete();
        });

        // Financial & Stock Guardrails via MySQL CHECK Constraints
        DB::statement('ALTER TABLE journal_lines ADD CONSTRAINT chk_jl_one_sided CHECK (NOT (debit > 0 AND credit > 0))');
        DB::statement('ALTER TABLE loan_schedules ADD CONSTRAINT chk_ls_paid_le_due CHECK (paid_amount <= total_due + penalty_amount)');
        DB::statement('ALTER TABLE stock_batches ADD CONSTRAINT chk_sb_remaining_le_received CHECK (remaining_qty <= received_qty)');
        DB::statement('ALTER TABLE invoices ADD CONSTRAINT chk_inv_paid_le_total CHECK (paid_amount <= grand_total + 0.01)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE invoices DROP CONSTRAINT chk_inv_paid_le_total');
        DB::statement('ALTER TABLE stock_batches DROP CONSTRAINT chk_sb_remaining_le_received');
        DB::statement('ALTER TABLE loan_schedules DROP CONSTRAINT chk_ls_paid_le_due');
        DB::statement('ALTER TABLE journal_lines DROP CONSTRAINT chk_jl_one_sided');

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
        });

        Schema::table('stock_units', function (Blueprint $table) {
            $table->dropForeign(['sold_invoice_item_id']);
        });

        Schema::table('goods_receipt_items', function (Blueprint $table) {
            $table->dropForeign(['condition_id']);
        });
    }
};

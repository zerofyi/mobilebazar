<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Credit-note idempotency + link each return line to the original invoice item
     * (prevents double-returns).
     * Idempotent: safe to re-run after a partial failure.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('credit_notes', 'idempotency_key')) {
            Schema::table('credit_notes', function (Blueprint $table) {
                if (Schema::hasColumn('credit_notes', 'notes')) {
                    $table->string('idempotency_key', 64)->nullable()->unique()->after('notes');
                } else {
                    $table->string('idempotency_key', 64)->nullable()->unique();
                }
            });
        }

        if (! Schema::hasColumn('credit_note_items', 'invoice_item_id')) {
            Schema::table('credit_note_items', function (Blueprint $table) {
                if (Schema::hasColumn('credit_note_items', 'credit_note_id')) {
                    $table->foreignId('invoice_item_id')->nullable()->after('credit_note_id')
                        ->constrained('invoice_items')->nullOnDelete();
                } else {
                    $table->foreignId('invoice_item_id')->nullable()
                        ->constrained('invoice_items')->nullOnDelete();
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('credit_note_items', 'invoice_item_id')) {
            Schema::table('credit_note_items', function (Blueprint $table) {
                $table->dropConstrainedForeignId('invoice_item_id');
            });
        }
        if (Schema::hasColumn('credit_notes', 'idempotency_key')) {
            Schema::table('credit_notes', function (Blueprint $table) {
                $table->dropColumn('idempotency_key');
            });
        }
    }
};

<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Retry safety for money-in / money-out endpoints.
 *
 * Adds a nullable idempotency_key to the two payment row tables:
 *  - payments          (supplier payments; one request may create several
 *                       rows — they all share the request's key, so the
 *                       index is deliberately NOT unique)
 *  - invoice_payments  (sale collections; one row per collection)
 *
 * Services check the key under the document row lock before inserting, so
 * a double-clicked or retried submission returns the original rows instead
 * of booking the money twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('payments') && ! Schema::hasColumn('payments', 'idempotency_key')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->string('idempotency_key', 64)->nullable()->index('idx_payments_idempotency_key');
            });
        }

        if (Schema::hasTable('invoice_payments') && ! Schema::hasColumn('invoice_payments', 'idempotency_key')) {
            Schema::table('invoice_payments', function (Blueprint $table) {
                $table->string('idempotency_key', 64)->nullable()->index('idx_invoice_payments_idempotency_key');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'idempotency_key')) {
            Schema::table('payments', function (Blueprint $table) {
                $table->dropIndex('idx_payments_idempotency_key');
                $table->dropColumn('idempotency_key');
            });
        }

        if (Schema::hasTable('invoice_payments') && Schema::hasColumn('invoice_payments', 'idempotency_key')) {
            Schema::table('invoice_payments', function (Blueprint $table) {
                $table->dropIndex('idx_invoice_payments_idempotency_key');
                $table->dropColumn('idempotency_key');
            });
        }
    }
};

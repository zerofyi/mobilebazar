<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Adds total_payables to daily_summaries (monthly already has it).
     * Idempotent: safe to re-run after a partial failure.
     */
    public function up(): void
    {
        if (! Schema::hasColumn('daily_summaries', 'total_payables')) {
            Schema::table('daily_summaries', function (Blueprint $table): void {
                if (Schema::hasColumn('daily_summaries', 'buyback_adjusted')) {
                    $table->decimal('total_payables', 14, 2)->default(0.00)->after('buyback_adjusted');
                } else {
                    $table->decimal('total_payables', 14, 2)->default(0.00);
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('daily_summaries', 'total_payables')) {
            Schema::table('daily_summaries', function (Blueprint $table): void {
                $table->dropColumn('total_payables');
            });
        }
    }
};

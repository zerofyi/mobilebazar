<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Audit-chain link: a reversal journal entry points at the entry it
     * reverses. Entries are never edited or deleted; this makes the
     * original -> reversal -> repost chain walkable.
     */
    public function up(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->foreignId('reverses_journal_id')
                ->nullable()
                ->after('reference_id')
                ->constrained('journal_entries')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('journal_entries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('reverses_journal_id');
        });
    }
};

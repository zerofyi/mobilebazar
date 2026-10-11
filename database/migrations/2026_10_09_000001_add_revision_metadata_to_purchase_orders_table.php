<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Revision metadata for the reverse-and-repost purchase edit flow.
     * Every edit bumps revision and records who/why; the audit trail
     * itself lives in the (never deleted) journal reversal entries.
     */
    public function up(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->unsignedInteger('revision')->default(0)->after('idempotency_key');
            $table->timestamp('revised_at')->nullable()->after('revision');
            $table->foreignId('revised_by')->nullable()->after('revised_at')->constrained('users')->nullOnDelete();
            $table->text('revision_reason')->nullable()->after('revised_by');
            // Double-submit protection for the edit form: one UUID per edit
            // session, checked under the PO row lock before reversing.
            $table->string('edit_idempotency_key', 36)->nullable()->after('revision_reason');
        });
    }

    public function down(): void
    {
        Schema::table('purchase_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('revised_by');
            $table->dropColumn(['revision', 'revised_at', 'revision_reason', 'edit_idempotency_key']);
        });
    }
};

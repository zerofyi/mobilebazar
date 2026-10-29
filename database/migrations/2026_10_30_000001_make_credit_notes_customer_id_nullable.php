<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sales can be billed to a Supplier party (B2B / inter-store), not only
     * to customers. CreditNoteService stores customer_id = null for those
     * returns, but the column was created NOT NULL — issuing a return on a
     * supplier-party sale died with SQLSTATE 1048 (500). Make it nullable;
     * the FK to customers is preserved.
     */
    public function up(): void
    {
        Schema::table('credit_notes', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
        });

        Schema::table('credit_notes', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable()->change();
        });

        Schema::table('credit_notes', function (Blueprint $table) {
            $table->foreign('customer_id')->references('id')->on('customers')->restrictOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('credit_notes', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
        });

        Schema::table('credit_notes', function (Blueprint $table) {
            $table->foreignId('customer_id')->nullable(false)->change();
        });

        Schema::table('credit_notes', function (Blueprint $table) {
            $table->foreign('customer_id')->references('id')->on('customers')->restrictOnDelete();
        });
    }
};

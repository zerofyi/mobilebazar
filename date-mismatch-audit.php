<?php

declare(strict_types=1);

/*
 * READ-ONLY audit: how many existing records carry a WRONG business date
 * from the UTC-default bug?
 *
 * Run from the project root:  php date-mismatch-audit.php
 *
 * The bug: forms/defaults derived "today" from the UTC clock. Anything
 * entered between 00:00 and 05:30 IST was stamped with the PREVIOUS day.
 * Such rows have a distinctive signature:
 *
 *     document_date = (IST date of created_at) − 1 day
 *     AND the row was created before 05:30 IST
 *
 * A deliberately backdated entry is normally typed during shop hours, so
 * the early-morning + exactly-one-day pattern isolates bug victims with
 * high confidence. This script only SELECTs — it changes nothing. Review
 * the samples, then decide on repairs per document (dates feed journals
 * and summaries, so bulk-updating dates without touching those would
 * create new mismatches).
 */

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use Illuminate\Support\Facades\DB;

$istDate = "DATE(created_at + INTERVAL 330 MINUTE)";
$istTime = "TIME(created_at + INTERVAL 330 MINUTE)";

$targets = [
    // table, date expression, number column, label
    ['purchase_orders', 'order_date', 'po_number', 'Purchases (order_date)'],
    ['invoices', 'invoice_date', 'invoice_number', 'Sales invoices (invoice_date)'],
    ['credit_notes', 'credit_note_date', 'credit_note_number', 'Credit notes (credit_note_date)'],
    ['debit_notes', 'debit_note_date', 'debit_note_number', 'Debit notes (debit_note_date)'],
    ['payments', 'DATE(paid_at)', 'id', 'Supplier payments (paid_at date)'],
];

$totalSuspects = 0;

foreach ($targets as [$table, $dateExpr, $numCol, $label]) {
    try {
        $suspects = DB::select(
            "SELECT id, {$numCol} AS doc_no, {$dateExpr} AS doc_date, created_at,
                    {$istDate} AS created_ist
             FROM {$table}
             WHERE {$dateExpr} = DATE_SUB({$istDate}, INTERVAL 1 DAY)
               AND {$istTime} < '05:30:00'
             ORDER BY created_at
             LIMIT 20"
        );
        $count = (int) (DB::selectOne(
            "SELECT COUNT(*) AS c FROM {$table}
             WHERE {$dateExpr} = DATE_SUB({$istDate}, INTERVAL 1 DAY)
               AND {$istTime} < '05:30:00'"
        )->c ?? 0);
        $anyDiff = (int) (DB::selectOne(
            "SELECT COUNT(*) AS c FROM {$table} WHERE {$dateExpr} <> {$istDate}"
        )->c ?? 0);
    } catch (Throwable $e) {
        printf("%-38s ERROR: %s\n", $label, $e->getMessage());
        continue;
    }

    $totalSuspects += $count;
    printf("%-38s suspects: %-5d (any date≠creation-IST-date: %d)\n", $label, $count, $anyDiff);
    foreach ($suspects as $r) {
        printf("    id=%s  %-16s doc_date=%s  created_ist=%s\n", $r->id, $r->doc_no, $r->doc_date, $r->created_ist);
    }
}

// Collection journals: entry_date came from the UTC clock server-side.
try {
    $collCount = (int) (DB::selectOne(
        "SELECT COUNT(*) AS c FROM journal_entries
         WHERE entry_number LIKE 'JE-COLL-%'
           AND entry_date = DATE_SUB({$istDate}, INTERVAL 1 DAY)
           AND {$istTime} < '05:30:00'"
    )->c ?? 0);
    $totalSuspects += $collCount;
    printf("%-38s suspects: %d\n", 'Collection journals (JE-COLL-*)', $collCount);
} catch (Throwable $e) {
    printf("%-38s ERROR: %s\n", 'Collection journals', $e->getMessage());
}

echo str_repeat('─', 70), "\n";
printf("TOTAL suspect rows: %d\n", $totalSuspects);
echo "Notes:\n";
echo " • daily_summaries rows inherit their dates from the documents above;\n";
echo "   after any repair, rebuild them with:\n";
echo "   php artisan summaries:rebuild-monthly\n";
echo " • Loan repayments carry real timestamps (paid_at) — no date column\n";
echo "   to mismatch; only their journal entry dates were affected, via the\n";
echo "   collection-journal pattern.\n";

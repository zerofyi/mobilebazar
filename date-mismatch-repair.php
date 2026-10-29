<?php

declare(strict_types=1);

/*
 * REPAIR for the UTC business-date bug — PURCHASE ORDERS.
 *
 * The production audit (Oct 30, 2026) found suspects ONLY among purchase
 * orders (6 rows). Other document types are re-checked here and reported
 * as MANUAL if any ever appear — this script never touches them.
 *
 *     php date-mismatch-repair.php            → dry-run, changes nothing
 *     php date-mismatch-repair.php --apply    → performs the repair
 *
 * Suspect signature (same as the audit): order_date = (IST date of
 * created_at) − 1 day AND the row was created before 05:30 IST.
 *
 * Per suspect purchase order, in its own transaction:
 *   1. Its summary delta is reversed off the wrong day and re-recorded on
 *      the correct day through SummaryService::record() — daily and
 *      monthly summaries move together, no rebuild command needed.
 *   2. order_date moves to the IST creation date. A stored due_date moves
 *      with it (it was entered in the same one-day-behind session).
 *   3. Journal entries posted for this order ON the old date move to the
 *      new date. Entries on other dates (later payments etc.) are NOT
 *      touched.
 *
 * Also with --apply: historical net_profit backfill. net_profit was never
 * written by any posting code, so every daily + monthly summary row gets
 * net_profit = gross_profit − total_expenses.
 *
 * TAKE A DATABASE BACKUP BEFORE RUNNING WITH --apply.
 */

require __DIR__ . '/vendor/autoload.php';
$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\JournalEntry;
use App\Models\PurchaseOrder;
use App\Services\Summary\SummaryDeltaFactory;
use App\Services\SummaryService;
use Illuminate\Support\Facades\DB;

$apply = in_array('--apply', $argv ?? [], true);
echo $apply ? "MODE: APPLY — changes will be written.\n" : "MODE: dry-run — nothing will be changed. Re-run with --apply to repair.\n";
echo str_repeat('─', 72) . "\n";

/** Same suspect signature as date-mismatch-audit.php. */
function isSuspect(DateTimeInterface $docDate, DateTimeInterface $createdAtUtc): ?string
{
    $ist = Carbon\CarbonImmutable::instance($createdAtUtc)->setTimezone('Asia/Kolkata');
    if ($ist->format('H:i') >= '05:30') {
        return null;
    }
    $correct = $ist->toDateString();
    $expectedWrong = $ist->subDay()->toDateString();

    return $docDate->format('Y-m-d') === $expectedWrong ? $correct : null;
}

/** Rebuild a stored PO's posting payload, mirroring PurchaseService. */
function purchaseDeltaData(PurchaseOrder $po, string $date): array
{
    $lines = [];
    foreach ($po->items as $item) {
        $units = $item->stockUnits;
        if ($units->isNotEmpty()) {
            $lines[] = [
                'is_serialized' => true,
                'line_total'    => (float) $item->line_total,
                'units'         => $units->map(fn ($u) => ['device_condition_code' => $u->device_condition])->all(),
            ];
        } else {
            $lines[] = [
                'is_serialized' => false,
                'line_total'    => (float) $item->line_total,
                'ordered_qty'   => (int) $item->ordered_qty,
            ];
        }
    }

    return ['lines' => $lines, 'grand_total' => (float) $po->grand_total, 'order_date' => $date];
}

$summaries = app(SummaryService::class);
$repaired = 0;

PurchaseOrder::query()
    ->with(['items.stockUnits'])
    ->orderBy('id')
    ->each(function (PurchaseOrder $po) use ($apply, $summaries, &$repaired) {
        $newDate = isSuspect($po->order_date, $po->created_at);
        if ($newDate === null) {
            return;
        }
        $oldDate = $po->order_date->toDateString();
        $journalCount = JournalEntry::query()
            ->where('reference_type', PurchaseOrder::class)
            ->where('reference_id', $po->id)
            ->whereDate('entry_date', $oldDate)
            ->count();
        $dueNote = $po->due_date !== null
            ? ' · due_date ' . $po->due_date->toDateString() . ' → ' . $po->due_date->copy()->addDay()->toDateString()
            : ' · due_date (none)';

        printf(
            "%s (id %d): order_date %s → %s%s · journals on old date: %d · grand ₹%s\n",
            $po->po_number ?? ('PO#' . $po->id),
            $po->id,
            $oldDate,
            $newDate,
            $dueNote,
            $journalCount,
            number_format((float) $po->grand_total, 2)
        );

        if (!$apply) {
            return;
        }

        DB::transaction(function () use ($po, $summaries, $oldDate, $newDate) {
            // 1. Move the summary delta: reverse off the old day, post on the new day.
            $summaries->record(
                SummaryDeltaFactory::forPurchase($po->store_id, purchaseDeltaData($po, $oldDate))->reversed(),
                allowLocked: true
            );
            $summaries->record(
                SummaryDeltaFactory::forPurchase($po->store_id, purchaseDeltaData($po, $newDate)),
                allowLocked: true
            );

            // 2. Move the document (and its due date, when one is stored).
            $po->order_date = $newDate;
            if ($po->due_date !== null) {
                $po->due_date = $po->due_date->copy()->addDay();
            }
            $po->save();

            // 3. Move this order's journal entries that sit on the old date.
            JournalEntry::query()
                ->where('reference_type', PurchaseOrder::class)
                ->where('reference_id', $po->id)
                ->whereDate('entry_date', $oldDate)
                ->update(['entry_date' => $newDate]);
        });
        $repaired++;
    });

echo str_repeat('─', 72) . "\n";
echo $apply
    ? "Purchase orders repaired: {$repaired}\n"
    : "Dry-run only — no purchase orders were changed.\n";

// Other document types: detect-and-report only, never repaired here.
foreach ([
    'invoices'     => ['invoice_date', 'invoice_number'],
    'credit_notes' => ['credit_note_date', 'credit_note_number'],
    'debit_notes'  => ['debit_note_date', 'debit_note_number'],
] as $table => [$dateCol, $numCol]) {
    $count = 0;
    DB::table($table)->select(['id', $dateCol, 'created_at'])->orderBy('id')
        ->each(function ($row) use ($dateCol, &$count) {
            if (isSuspect(new DateTimeImmutable($row->{$dateCol}), new DateTimeImmutable($row->created_at))) {
                $count++;
            }
        });
    if ($count > 0) {
        echo "WARNING: {$count} suspect row(s) in {$table} — NOT repaired by this script. Report these before doing anything.\n";
    }
}

// Historical net_profit backfill (net_profit was never written by posting code).
foreach (['daily_summaries', 'monthly_summaries'] as $table) {
    $rows = DB::table($table)->whereRaw('net_profit <> gross_profit - total_expenses')->count();
    if ($apply && $rows > 0) {
        DB::table($table)->whereRaw('net_profit <> gross_profit - total_expenses')
            ->update(['net_profit' => DB::raw('gross_profit - total_expenses')]);
    }
    echo "net_profit backfill ({$table}): {$rows} row(s)" . ($apply ? " updated.\n" : " would be updated.\n");
}

echo "Done. Re-run date-mismatch-audit.php — purchase suspects should now be 0.\n";

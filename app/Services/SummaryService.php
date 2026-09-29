<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\SummaryDelta;
use App\Exceptions\MonthLockedException;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Single writer for daily_summaries and monthly_summaries.
 *
 * Design rules:
 *  1. Every write is ONE atomic statement: INSERT ... ON DUPLICATE KEY UPDATE col = col + ?
 *     (no SELECT-then-INSERT race, no read-modify-write, no lost updates).
 *  2. Call record() from INSIDE the business transaction, as the LAST step, so that
 *     summaries roll back with the journal/stock and row locks are held as briefly as possible.
 *  3. Lock order is always daily -> monthly, avoiding deadlocks between writers.
 *  4. Daily rows are the source of truth for monthly totals; rebuildMonthlyFromDaily()
 *     heals any drift.
 *  5. Requires MySQL 5.7+/8.x or MariaDB (ON DUPLICATE KEY).
 */
final class SummaryService
{
    /** Deadlock retries apply only when this service opens the outermost transaction. */
    private const DEADLOCK_ATTEMPTS = 3;

    /*
    |--------------------------------------------------------------------------
    | Public API
    |--------------------------------------------------------------------------
    */

    /**
     * Apply a delta to the store's daily + monthly rows.
     *
     * @throws MonthLockedException when the month is locked (unless $allowLocked)
     */
    public function record(SummaryDelta $delta, bool $allowLocked = false): void
    {
        if ($delta->isEmpty()) {
            return;
        }

        DB::transaction(function () use ($delta, $allowLocked) {
            if (! $allowLocked && $this->isMonthLocked($delta->storeId, $delta->yearMonth())) {
                throw MonthLockedException::for($delta->storeId, $delta->yearMonth());
            }

            // Fixed order: daily first, monthly second.
            $this->applyDelta(
                table:    'daily_summaries',
                keys:     ['store_id' => $delta->storeId, 'date' => $delta->date],
                values:   $delta->dailyValues(),
                decimals: SummaryDelta::DAILY_DECIMALS,
                counts:   SummaryDelta::DAILY_COUNTS,
            );

            $monthly = $delta->monthlyValues();
            if ($monthly !== []) {
                $this->applyDelta(
                    table:    'monthly_summaries',
                    keys:     ['store_id' => $delta->storeId, 'year_month' => $delta->yearMonth()],
                    values:   $monthly,
                    decimals: SummaryDelta::MONTHLY_DECIMALS,
                    counts:   SummaryDelta::MONTHLY_COUNTS,
                );
            }
        }, self::DEADLOCK_ATTEMPTS);
    }

    /** Apply several deltas (e.g. an edit = reverse old + apply new) in one transaction. */
    public function recordMany(SummaryDelta ...$deltas): void
    {
        DB::transaction(function () use ($deltas) {
            foreach ($deltas as $d) {
                $this->record($d);
            }
        }, self::DEADLOCK_ATTEMPTS);
    }

    /**
     * Recompute a month's additive totals from its daily rows and overwrite the monthly row.
     * Snapshot columns (closing stock / receivables / payables) and lock state are untouched.
     *
     * @throws MonthLockedException
     */
    public function rebuildMonthlyFromDaily(int $storeId, string $yearMonth, bool $allowLocked = false): void
    {
        $this->assertYearMonth($yearMonth);

        DB::transaction(function () use ($storeId, $yearMonth, $allowLocked) {
            $existing = DB::table('monthly_summaries')
                ->where('store_id', $storeId)
                ->where('year_month', $yearMonth)
                ->lockForUpdate()
                ->first(['id', 'is_locked']);

            if ($existing && $existing->is_locked && ! $allowLocked) {
                throw MonthLockedException::for($storeId, $yearMonth);
            }

            $start = Carbon::createFromFormat('Y-m', $yearMonth)->startOfMonth()->toDateString();
            $end   = Carbon::createFromFormat('Y-m', $yearMonth)->endOfMonth()->toDateString();

            $cols   = [...SummaryDelta::MONTHLY_DECIMALS, ...SummaryDelta::MONTHLY_COUNTS];
            $selects = array_map(fn (string $c) => "COALESCE(SUM(`{$c}`), 0) AS `{$c}`", $cols);

            $totals = (array) DB::table('daily_summaries')
                ->where('store_id', $storeId)
                ->whereBetween('date', [$start, $end])
                ->selectRaw(implode(', ', $selects))
                ->first();

            $now = now()->toDateTimeString();

            DB::table('monthly_summaries')->upsert(
                [array_merge($totals, [
                    'store_id'   => $storeId,
                    'year_month' => $yearMonth,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])],
                ['store_id', 'year_month'],
                [...$cols, 'updated_at'],
            );
        }, self::DEADLOCK_ATTEMPTS);
    }

    /**
     * Overwrite the point-in-time balance columns. These are NOT additive, so they are
     * set from a scheduled job / month-end close, never via record().
     *
     * @param array{closing_stock_value?: float|string, total_receivables?: float|string, total_payables?: float|string} $balances
     */
    public function setMonthlySnapshot(int $storeId, string $yearMonth, array $balances, bool $allowLocked = false): void
    {
        $this->assertYearMonth($yearMonth);

        $allowed = ['closing_stock_value', 'total_receivables', 'total_payables'];
        $set     = [];
        foreach ($allowed as $col) {
            if (array_key_exists($col, $balances)) {
                $set[$col] = number_format(round((float) $balances[$col], 2), 2, '.', '');
            }
        }
        if ($set === []) {
            return;
        }

        DB::transaction(function () use ($storeId, $yearMonth, $set, $allowLocked) {
            if (! $allowLocked && $this->isMonthLocked($storeId, $yearMonth)) {
                throw MonthLockedException::for($storeId, $yearMonth);
            }

            $now = now()->toDateTimeString();

            DB::table('monthly_summaries')->upsert(
                [array_merge($set, [
                    'store_id'   => $storeId,
                    'year_month' => $yearMonth,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])],
                ['store_id', 'year_month'],
                [...array_keys($set), 'updated_at'],
            );
        }, self::DEADLOCK_ATTEMPTS);
    }

    /** Finalise a month: rebuild from daily, then lock. Idempotent if already locked. */
    public function lockMonth(int $storeId, string $yearMonth, int $userId): void
    {
        $this->assertYearMonth($yearMonth);

        DB::transaction(function () use ($storeId, $yearMonth, $userId) {
            $this->rebuildMonthlyFromDaily($storeId, $yearMonth);

            DB::table('monthly_summaries')
                ->where('store_id', $storeId)
                ->where('year_month', $yearMonth)
                ->update([
                    'is_locked'  => true,
                    'locked_at'  => now(),
                    'locked_by'  => $userId,
                    'updated_at' => now(),
                ]);
        }, self::DEADLOCK_ATTEMPTS);
    }

    /** Authorise this in your policy layer (e.g. owner/admin only) before calling. */
    public function unlockMonth(int $storeId, string $yearMonth): void
    {
        $this->assertYearMonth($yearMonth);

        DB::table('monthly_summaries')
            ->where('store_id', $storeId)
            ->where('year_month', $yearMonth)
            ->update([
                'is_locked'  => false,
                'locked_at'  => null,
                'locked_by'  => null,
                'updated_at' => now(),
            ]);
    }

    public function isMonthLocked(int $storeId, string $yearMonth): bool
    {
        return (bool) DB::table('monthly_summaries')
            ->where('store_id', $storeId)
            ->where('year_month', $yearMonth)
            ->value('is_locked');
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    /**
     * One atomic upsert. Column names come only from the whitelists in SummaryDelta;
     * every value is a bound parameter.
     *
     * Counts are unsigned ints: the INSERT branch clamps to >= 0 (a negative value
     * would violate the UNSIGNED type even when the UPDATE branch is taken), and the
     * UPDATE branch uses GREATEST(CAST(.. AS SIGNED) + ?, 0) so reversals never underflow.
     *
     * @param array<string, int|string> $keys
     * @param array<string, int|string> $values
     * @param list<string>              $decimals
     * @param list<string>              $counts
     */
    private function applyDelta(string $table, array $keys, array $values, array $decimals, array $counts): void
    {
        $decimalSet = array_flip($decimals);
        $countSet   = array_flip($counts);
        $now        = now()->toDateTimeString();

        $insertCols = [];
        $insertBind = [];
        $updateSql  = [];
        $updateBind = [];

        foreach ($keys as $col => $val) {
            $insertCols[] = "`{$col}`";
            $insertBind[] = $val;
        }

        foreach ($values as $col => $amount) {
            if (isset($decimalSet[$col])) {
                $insertCols[] = "`{$col}`";
                $insertBind[] = $amount;
                $updateSql[]  = "`{$col}` = `{$col}` + ?";
                $updateBind[] = $amount;
            } elseif (isset($countSet[$col])) {
                $insertCols[] = "`{$col}`";
                $insertBind[] = max(0, (int) $amount);
                $updateSql[]  = "`{$col}` = GREATEST(CAST(`{$col}` AS SIGNED) + ?, 0)";
                $updateBind[] = (int) $amount;
            } else {
                throw new InvalidArgumentException("Column [{$col}] is not allowed on {$table}.");
            }
        }

        $insertCols[] = '`created_at`';
        $insertCols[] = '`updated_at`';
        $insertBind[] = $now;
        $insertBind[] = $now;

        $updateSql[]  = '`updated_at` = ?';
        $updateBind[] = $now;

        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s',
            $table,
            implode(', ', $insertCols),
            implode(', ', array_fill(0, count($insertCols), '?')),
            implode(', ', $updateSql),
        );

        DB::affectingStatement($sql, [...$insertBind, ...$updateBind]);
    }

    private function assertYearMonth(string $yearMonth): void
    {
        if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $yearMonth)) {
            throw new InvalidArgumentException("Invalid year_month [{$yearMonth}], expected YYYY-MM.");
        }
    }
}

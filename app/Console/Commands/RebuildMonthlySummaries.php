<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Exceptions\MonthLockedException;
use App\Models\Store;
use App\Services\SummaryService;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Throwable;

final class RebuildMonthlySummaries extends Command
{
    protected $signature = 'summaries:rebuild-monthly
                            {--store= : Only this store id}
                            {--month=* : YYYY-MM (repeatable). Defaults to previous + current month}';

    protected $description = 'Re-derive monthly_summaries totals from daily_summaries (self-healing reconcile).';

    public function handle(SummaryService $summaries): int
    {
        $months = $this->option('month') ?: [
            now()->subMonthNoOverflow()->format('Y-m'),
            now()->format('Y-m'),
        ];

        $stores = Store::query()
            ->when($this->option('store'), fn ($q, $id) => $q->whereKey($id))
            ->pluck('id');

        $failed = 0;

        foreach ($stores as $storeId) {
            foreach ($months as $month) {
                try {
                    Carbon::createFromFormat('Y-m', $month) ?: throw new \InvalidArgumentException($month);
                    $summaries->rebuildMonthlyFromDaily((int) $storeId, $month);
                } catch (MonthLockedException) {
                    $this->line("skip  store {$storeId} {$month} (locked)");
                } catch (Throwable $e) {
                    $failed++;
                    report($e);
                    $this->error("fail  store {$storeId} {$month}: {$e->getMessage()}");
                }
            }
        }

        $this->info("Done. Stores: {$stores->count()}, failures: {$failed}");

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}

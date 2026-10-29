<?php

namespace App\Http\Controllers;

use App\Models\DailySummary;
use App\Models\Invoice;
use App\Models\LoanSchedule;
use App\Models\MonthlySummary;
use App\Models\StockBatch;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Store dashboard. Gated to the `store` role AND the `dashboard.view`
 * permission (both required, for now). Reads only the pre-aggregated
 * daily/monthly summary tables — five small indexed queries, no live
 * aggregation.
 */
class DashboardController extends Controller
{
    public function index(Request $request): Response
    {
        $user = $request->user();
        abort_unless($user->hasRole('store') && $user->can('dashboard.view'), 403);

        $store = $user->ownedStore;
        abort_if(! $store, 404);

        // Business dates live in the STORE's timezone (stores.timezone,
        // default Asia/Kolkata) — summaries are keyed by those dates. The
        // app runs in UTC, so today() here would still be YESTERDAY from
        // midnight to 05:30 IST: Today cards, the month window and the
        // trend all shifted a day. Anchor every boundary to store time.
        $now        = now($store->timezone ?: 'Asia/Kolkata');
        $today      = $now->toDateString();
        $yesterday  = $now->copy()->subDay()->toDateString();
        $monthStart = $now->copy()->startOfMonth()->toDateString();
        $trendStart = $now->copy()->subDays(29)->toDateString();

        $kpiCols = [
            'date', 'total_sales', 'total_purchases', 'gross_profit', 'net_profit',
            'total_expenses', 'total_discounts', 'total_tax_collected', 'total_refunds',
            'cash_collected', 'upi_collected', 'card_collected', 'bank_collected',
            'buyback_adjusted', 'total_payables',
            'total_loan_given', 'total_emi_collected',
            'invoice_count', 'purchase_count', 'loans_count',
        ];

        $todayRow     = $this->dailyRow($store->id, $today);
        $yesterdayRow = $this->dailyRow($store->id, $yesterday);

        // Fill EVERY calendar day in the window. Days without a summary row
        // are real zero days — omitting them made the 30-day chart skip
        // dates and the "last 7 days" table show the last 7 ACTIVE days.
        $trendByDate = DailySummary::query()
            ->where('store_id', $store->id)
            ->whereBetween('date', [$trendStart, $today])
            ->orderBy('date')
            ->get($kpiCols)
            ->keyBy(fn (DailySummary $r) => $r->date->toDateString());

        // NOTE: this app uses CarbonImmutable — addDay() returns a NEW
        // instance, so advance by assignment inside a counted loop.
        $trend = collect();
        $d = $now->copy()->subDays(29);
        for ($i = 0; $i < 30; $i++) {
            $ds = $d->toDateString();
            $trend->push($this->rowPayload($trendByDate->get($ds), $ds));
            $d = $d->addDay();
        }

        $monthAgg = DailySummary::query()
            ->where('store_id', $store->id)
            ->whereBetween('date', [$monthStart, $today])
            ->selectRaw('SUM(total_sales) as total_sales, SUM(total_purchases) as total_purchases, SUM(gross_profit) as gross_profit, SUM(net_profit) as net_profit, SUM(total_expenses) as total_expenses, SUM(total_discounts) as total_discounts, SUM(total_tax_collected) as total_tax_collected, SUM(total_refunds) as total_refunds, SUM(cash_collected) as cash_collected, SUM(upi_collected) as upi_collected, SUM(card_collected) as card_collected, SUM(bank_collected) as bank_collected, SUM(buyback_adjusted) as buyback_adjusted, SUM(total_loan_given) as total_loan_given, SUM(total_emi_collected) as total_emi_collected, SUM(invoice_count) as invoice_count, SUM(purchase_count) as purchase_count, SUM(loans_count) as loans_count')
            ->first();

        $monthRow = MonthlySummary::query()
            ->where('store_id', $store->id)
            ->where('year_month', $now->format('Y-m'))
            ->first(['closing_stock_value', 'total_receivables', 'total_payables', 'is_locked']);

        return Inertia::render('dashboard', [
            'store'         => ['name' => $store->name, 'code' => $store->code],
            'business_date' => $today,
            'today'         => $this->rowPayload($todayRow, $today),
            'yesterday'     => $this->rowPayload($yesterdayRow, $yesterday),
            'growth'    => [
                'sales'    => $this->growth($todayRow?->total_sales, $yesterdayRow?->total_sales),
                'invoices' => $this->growth($todayRow?->invoice_count, $yesterdayRow?->invoice_count),
                'profit'   => $this->growth($todayRow?->net_profit, $yesterdayRow?->net_profit),
            ],
            'month' => [
                'sales'         => (float) ($monthAgg->total_sales ?? 0),
                'purchases'     => (float) ($monthAgg->total_purchases ?? 0),
                'gross_profit'  => (float) ($monthAgg->gross_profit ?? 0),
                'net_profit'    => (float) ($monthAgg->net_profit ?? 0),
                'expenses'      => (float) ($monthAgg->total_expenses ?? 0),
                'discounts'     => (float) ($monthAgg->total_discounts ?? 0),
                'tax_collected' => (float) ($monthAgg->total_tax_collected ?? 0),
                'refunds'       => (float) ($monthAgg->total_refunds ?? 0),
                'emi_collected' => (float) ($monthAgg->total_emi_collected ?? 0),
                'loan_given'    => (float) ($monthAgg->total_loan_given ?? 0),
                'invoices'      => (int) ($monthAgg->invoice_count ?? 0),
                'purchases_n'   => (int) ($monthAgg->purchase_count ?? 0),
                'loans_n'       => (int) ($monthAgg->loans_count ?? 0),
                'modes'         => [
                    ['name' => 'Cash', 'value' => (float) ($monthAgg->cash_collected ?? 0)],
                    ['name' => 'UPI', 'value' => (float) ($monthAgg->upi_collected ?? 0)],
                    ['name' => 'Card', 'value' => (float) ($monthAgg->card_collected ?? 0)],
                    ['name' => 'Bank', 'value' => (float) ($monthAgg->bank_collected ?? 0)],
                    ['name' => 'Buyback', 'value' => (float) ($monthAgg->buyback_adjusted ?? 0)],
                ],
                'closing_stock' => (float) ($monthRow->closing_stock_value ?? 0),
                'receivables'   => (float) ($monthRow->total_receivables ?? 0),
                'payables'      => (float) ($monthRow->total_payables ?? 0),
                'locked'        => (bool) ($monthRow->is_locked ?? false),
                'label'         => $now->format('F Y'),
            ],
            'trend'  => $trend,
            'alerts' => $this->alerts($store->id, $today),
        ]);
    }

    private function dailyRow(int $storeId, string $date): ?DailySummary
    {
        return DailySummary::query()
            ->where('store_id', $storeId)
            ->where('date', $date)
            ->first();
    }

    /** Null-safe numeric payload so the frontend never guards. */
    private function rowPayload(?DailySummary $r, ?string $date = null): array
    {
        return [
            'date'          => $r?->date?->toDateString() ?? $date,
            'sales'         => (float) ($r->total_sales ?? 0),
            'purchases'     => (float) ($r->total_purchases ?? 0),
            'gross_profit'  => (float) ($r->gross_profit ?? 0),
            'net_profit'    => (float) ($r->net_profit ?? 0),
            'expenses'      => (float) ($r->total_expenses ?? 0),
            'discounts'     => (float) ($r->total_discounts ?? 0),
            'tax_collected' => (float) ($r->total_tax_collected ?? 0),
            'refunds'       => (float) ($r->total_refunds ?? 0),
            'emi_collected' => (float) ($r->total_emi_collected ?? 0),
            'loan_given'    => (float) ($r->total_loan_given ?? 0),
            'invoices'      => (int) ($r->invoice_count ?? 0),
            'purchases_n'   => (int) ($r->purchase_count ?? 0),
            'loans_n'       => (int) ($r->loans_count ?? 0),
            'modes'         => [
                ['name' => 'Cash', 'value' => (float) ($r->cash_collected ?? 0)],
                ['name' => 'UPI', 'value' => (float) ($r->upi_collected ?? 0)],
                ['name' => 'Card', 'value' => (float) ($r->card_collected ?? 0)],
                ['name' => 'Bank', 'value' => (float) ($r->bank_collected ?? 0)],
            ],
        ];
    }

    private function growth(mixed $today, mixed $yesterday): ?float
    {
        $t = (float) ($today ?? 0);
        $y = (float) ($yesterday ?? 0);

        if ($y == 0.0) {
            return $t > 0 ? 100.0 : null;
        }

        return round((($t - $y) / abs($y)) * 100, 1);
    }

    /**
     * Actionable exceptions for the dashboard "Needs attention" feed.
     * Three indexed count queries — kept cheap on purpose.
     */
    private function alerts(int $storeId, string $businessDate): array
    {
        // Same condition as LoanSchedule::overdue(), but against the store's
        // business date — the scope's today() is UTC and flips 5.5h late.
        $overdueEmis = LoanSchedule::query()
            ->whereHas('loan', fn ($q) => $q->where('store_id', $storeId))
            ->whereDate('due_date', '<', $businessDate)
            ->where('status', '!=', 'paid')
            ->count();

        $unpaidInvoices = Invoice::query()
            ->where('store_id', $storeId)
            ->where('payment_status', '!=', 'paid')
            ->where('due_amount', '>', 0)
            ->count();

        $lowStock = StockBatch::query()
            ->where('store_id', $storeId)
            ->where('is_saleable', true)
            ->where('remaining_qty', '<=', 2)
            ->where('remaining_qty', '>', 0)
            ->count();

        return [
            ['key' => 'overdue_emis', 'count' => (int) $overdueEmis, 'href' => '/app/loan-installments/overdue'],
            ['key' => 'unpaid_invoices', 'count' => (int) $unpaidInvoices, 'href' => '/app/sales?payment_status=partial'],
            ['key' => 'low_stock', 'count' => (int) $lowStock, 'href' => '/app/inventory?filter=low'],
        ];
    }
}

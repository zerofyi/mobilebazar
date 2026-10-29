import { Head } from '@inertiajs/react';
import {
    AlertTriangle,
    Banknote,
    CalendarDays,
    CalendarClock,
    CreditCard,
    HandCoins,
    IndianRupee,
    Landmark,
    PackageX,
    ReceiptText,
    ShoppingBag,
    ShoppingCart,
    Smartphone,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Label,
    Pie,
    PieChart,
    XAxis,
    YAxis,
} from 'recharts';
import StatCard from '@/components/special/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    ChartContainer,
    ChartLegend,
    ChartLegendContent,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart';
import {
    Table,
    TableBody,
    TableCell,
    TableFooter,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import store from '@/routes/store';

interface ModeSlice {
    name: string;
    value: number;
}

interface DayRow {
    date?: string;
    sales: number;
    purchases: number;
    gross_profit: number;
    net_profit: number;
    expenses: number;
    discounts: number;
    tax_collected: number;
    refunds: number;
    emi_collected: number;
    loan_given: number;
    invoices: number;
    purchases_n: number;
    loans_n: number;
    modes: ModeSlice[];
}

interface DashboardProps {
    store: { name: string; code: string };
    business_date: string;
    today: DayRow;
    yesterday: DayRow;
    growth: { sales: number | null; invoices: number | null; profit: number | null };
    month: {
        sales: number;
        purchases: number;
        gross_profit: number;
        net_profit: number;
        expenses: number;
        discounts: number;
        tax_collected: number;
        refunds: number;
        emi_collected: number;
        loan_given: number;
        invoices: number;
        purchases_n: number;
        loans_n: number;
        modes: ModeSlice[];
        closing_stock: number;
        receivables: number;
        payables: number;
        locked: boolean;
        label: string;
    };
    trend: DayRow[];
    alerts: { key: 'overdue_emis' | 'unpaid_invoices' | 'low_stock'; count: number; href: string }[];
}

const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1,
});

const ALERT_META: Record<string, { title: string; desc: string; icon: typeof AlertTriangle }> = {
    overdue_emis: {
        title: 'Overdue EMIs',
        desc: 'installments past due date',
        icon: CalendarClock,
    },
    unpaid_invoices: {
        title: 'Unpaid invoices',
        desc: 'bills with balance due',
        icon: ReceiptText,
    },
    low_stock: {
        title: 'Low stock',
        desc: 'batches down to 2 or fewer',
        icon: PackageX,
    },
};

function AlertCard({ alert }: { alert: { key: string; count: number; href: string } }) {
    const meta = ALERT_META[alert.key] ?? { title: alert.key, desc: '', icon: AlertTriangle };
    const Icon = meta.icon;
    return (
        <a
            href={alert.href}
            className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 transition-all hover:-translate-y-0.5 hover:shadow-md"
        >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-yellow-500/15">
                <Icon className="size-4.5 text-yellow-600" />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-semibold">
                    {alert.count} {meta.title}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{meta.desc}</span>
            </span>
        </a>
    );
}

/* ── Dates ────────────────────────────────────────────────────────────────
   All dates arrive as 'Y-m-d' business dates (store timezone). Parse by
   parts — never `new Date(iso)`, which reads it as UTC midnight. */

function parseISODate(iso?: string): Date | null {
    if (!iso) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return y && m && d ? new Date(y, m - 1, d) : null;
}

function shortDate(iso?: string): string {
    const d = parseISODate(iso);
    return d ? d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—';
}

function dayLabel(iso?: string): string {
    const d = parseISODate(iso);
    return d
        ? d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
        : '—';
}

function fullDate(iso?: string): string {
    const d = parseISODate(iso);
    return d
        ? d.toLocaleDateString('en-IN', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : '—';
}

/* ── Chart configs (shadcn chart theming) ─────────────────────────────── */

const salesChartConfig = {
    sales: { label: 'Sales', color: 'var(--chart-2)' },
    purchases: { label: 'Purchases', color: 'var(--chart-1)' },
} satisfies ChartConfig;

const profitChartConfig = {
    gross_profit: { label: 'Gross profit', color: 'var(--chart-1)' },
    net_profit: { label: 'Net profit', color: 'var(--chart-2)' },
} satisfies ChartConfig;

const modesChartConfig = {
    cash: { label: 'Cash', color: 'var(--chart-2)' },
    upi: { label: 'UPI', color: 'var(--chart-1)' },
    card: { label: 'Card', color: 'var(--chart-3)' },
    bank: { label: 'Bank', color: 'var(--chart-4)' },
    buyback: { label: 'Buyback', color: 'var(--chart-5)' },
} satisfies ChartConfig;

const inrTick = (v: number) => inrCompact.format(v);
const inrTooltip = (value: unknown) => inr.format(Number(value ?? 0));

const emptyDay: DayRow = {
    sales: 0, purchases: 0, gross_profit: 0, net_profit: 0, expenses: 0,
    discounts: 0, tax_collected: 0, refunds: 0, emi_collected: 0, loan_given: 0,
    invoices: 0, purchases_n: 0, loans_n: 0, modes: [],
};

const emptyMonth: DashboardProps['month'] = {
    sales: 0, purchases: 0, gross_profit: 0, net_profit: 0, expenses: 0,
    discounts: 0, tax_collected: 0, refunds: 0, emi_collected: 0, loan_given: 0,
    invoices: 0, purchases_n: 0, loans_n: 0, modes: [],
    closing_stock: 0, receivables: 0, payables: 0, locked: false, label: '',
};

export default function Dashboard({
    store: storeInfo = { name: '', code: '' },
    business_date: businessDate = '',
    today = emptyDay,
    growth = { sales: null, invoices: null, profit: null },
    month = emptyMonth,
    trend = [],
    alerts = [],
}: Partial<DashboardProps>) {
    const trendData = trend.map((d) => ({ ...d, label: shortDate(d.date) }));
    const last7 = [...trend].slice(-7).reverse();
    const last7Totals = last7.reduce(
        (acc, d) => ({
            invoices: acc.invoices + d.invoices,
            sales: acc.sales + d.sales,
            purchases: acc.purchases + d.purchases,
            gross_profit: acc.gross_profit + d.gross_profit,
            net_profit: acc.net_profit + d.net_profit,
        }),
        { invoices: 0, sales: 0, purchases: 0, gross_profit: 0, net_profit: 0 },
    );

    const modesData = month.modes.map((m) => {
        const slug = m.name.toLowerCase();
        return { ...m, slug, fill: `var(--color-${slug})` };
    });
    const modesTotal = modesData.reduce((s, m) => s + m.value, 0);
    const todayModesTotal = today.modes.reduce((s, m) => s + m.value, 0);

    return (
        <>
            <Head title="Dashboard" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
                    <div>
                        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
                            <TrendingUp className="size-6 text-primary" />
                            Dashboard
                        </h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                            {storeInfo.name} ({storeInfo.code}) · {fullDate(businessDate)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant="outline" className="gap-1.5">
                            <CalendarDays className="size-3.5" />
                            {month.label}
                        </Badge>
                        {month.locked && <Badge variant="secondary">Month locked</Badge>}
                    </div>
                </div>

                {/* Today */}
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
                        Today · {shortDate(businessDate)}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Today's Sales"
                            icon={IndianRupee}
                            value={inr.format(today.sales)}
                            subValue={`${today.invoices} invoices`}
                            subtitle="vs yesterday"
                            growth={growth.sales ?? undefined}
                            variant="success"
                            href="/app/sales"
                        />
                        <StatCard
                            title="Net Profit"
                            icon={Wallet}
                            value={inr.format(today.net_profit)}
                            subValue={`Gross ${inrCompact.format(today.gross_profit)}`}
                            subtitle="after expenses"
                            growth={growth.profit ?? undefined}
                            variant="info"
                        />
                        <StatCard
                            title="Invoices"
                            icon={ReceiptText}
                            value={today.invoices}
                            subValue={`${inrCompact.format(today.discounts)} discounts`}
                            subtitle="bills raised"
                            growth={growth.invoices ?? undefined}
                            href="/app/sales"
                        />
                        <StatCard
                            title="EMI Collected"
                            icon={HandCoins}
                            value={inr.format(today.emi_collected)}
                            subValue={`${inrCompact.format(today.loan_given)} disbursed`}
                            subtitle="loan book today"
                            variant="warning"
                            href="/app/loan-installments/today"
                        />
                    </div>

                    {/* Today's collections by mode */}
                    <Card className="mt-3 shadow-sm">
                        <CardHeader className="flex-row items-start justify-between gap-4 pb-3">
                            <div>
                                <CardTitle className="text-sm font-semibold">Collected Today</CardTitle>
                                <CardDescription>Net collections by payment mode</CardDescription>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                    Total collected
                                </p>
                                <p className="text-xl leading-tight font-bold tabular-nums">
                                    {inr.format(todayModesTotal)}
                                </p>
                            </div>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                {today.modes.map((m) => {
                                    const meta = {
                                        Cash: { icon: Banknote, color: 'var(--chart-2)' },
                                        UPI: { icon: Smartphone, color: 'var(--chart-1)' },
                                        Card: { icon: CreditCard, color: 'var(--chart-3)' },
                                        Bank: { icon: Landmark, color: 'var(--chart-4)' },
                                    }[m.name] ?? { icon: Wallet, color: 'var(--chart-5)' };
                                    const ModeIcon = meta.icon;
                                    const share = todayModesTotal > 0 ? (m.value / todayModesTotal) * 100 : 0;
                                    return (
                                        <div key={m.name} className="rounded-lg border bg-muted/20 p-3">
                                            <div className="flex items-center justify-between">
                                                <span
                                                    className="flex size-8 items-center justify-center rounded-md"
                                                    style={{
                                                        color: meta.color,
                                                        backgroundColor: `color-mix(in oklch, ${meta.color} 14%, transparent)`,
                                                    }}
                                                >
                                                    <ModeIcon className="size-4" />
                                                </span>
                                                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                                                    {share.toFixed(1)}%
                                                </span>
                                            </div>
                                            <p className="mt-2.5 text-base leading-none font-bold tabular-nums">
                                                {inr.format(m.value)}
                                            </p>
                                            <p className="mt-1 text-xs text-muted-foreground">{m.name}</p>
                                            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div
                                                    className="h-full rounded-full transition-all"
                                                    style={{ width: `${share}%`, backgroundColor: meta.color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* This month */}
                <div>
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{month.label}</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Month Sales"
                            icon={ShoppingBag}
                            value={inr.format(month.sales)}
                            subValue={`${month.invoices} invoices`}
                            subtitle="total revenue"
                            variant="success"
                            href="/app/sales"
                        />
                        <StatCard
                            title="Month Purchases"
                            icon={ShoppingCart}
                            value={inr.format(month.purchases)}
                            subValue={`${month.purchases_n} bills`}
                            subtitle="stock inward"
                            href="/app/purchases"
                        />
                        <StatCard
                            title="Month Net Profit"
                            icon={TrendingUp}
                            value={inr.format(month.net_profit)}
                            subValue={`${inrCompact.format(month.expenses)} expenses`}
                            subtitle={`tax ${inrCompact.format(month.tax_collected)}`}
                            variant="info"
                        />
                        <StatCard
                            title="Receivables"
                            icon={Landmark}
                            value={inr.format(month.receivables)}
                            subValue={`${inrCompact.format(month.payables)} payables`}
                            subtitle="to collect / to pay"
                            variant={month.receivables > 0 ? 'warning' : undefined}
                            href="/app/sales?payment_status=partial"
                        />
                    </div>
                </div>

                {/* Needs attention */}
                {alerts.some((a) => a.count > 0) && (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Needs attention</h3>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {alerts
                                .filter((a) => a.count > 0)
                                .map((a) => (
                                    <AlertCard key={a.key} alert={a} />
                                ))}
                        </div>
                    </div>
                )}

                {/* Charts — row 1 */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-sm xl:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Sales vs Purchases</CardTitle>
                            <CardDescription>Daily totals, last 30 days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={salesChartConfig} className="h-72 w-full">
                                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="fillSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-sales)" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="var(--color-sales)" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="fillPurchases" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="var(--color-purchases)" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="var(--color-purchases)" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={inrTick}
                                        width={64}
                                    />
                                    <ChartTooltip
                                        cursor={false}
                                        content={<ChartTooltipContent indicator="line" formatter={inrTooltip} />}
                                    />
                                    <Area
                                        dataKey="sales"
                                        type="monotone"
                                        fill="url(#fillSales)"
                                        fillOpacity={0.4}
                                        stroke="var(--color-sales)"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        dataKey="purchases"
                                        type="monotone"
                                        fill="url(#fillPurchases)"
                                        fillOpacity={0.4}
                                        stroke="var(--color-purchases)"
                                        strokeWidth={2}
                                    />
                                    <ChartLegend content={<ChartLegendContent />} />
                                </AreaChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Collections by Mode</CardTitle>
                            <CardDescription>{month.label} — where the money came in</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {modesTotal > 0 ? (
                                <>
                                    <ChartContainer config={modesChartConfig} className="mx-auto h-52 w-full">
                                        <PieChart>
                                            <ChartTooltip
                                                cursor={false}
                                                content={<ChartTooltipContent hideLabel formatter={inrTooltip} />}
                                            />
                                            <Pie
                                                data={modesData}
                                                dataKey="value"
                                                nameKey="name"
                                                innerRadius={60}
                                                outerRadius={88}
                                                paddingAngle={2}
                                                strokeWidth={0}
                                            >
                                                <Label
                                                    content={({ viewBox }) => {
                                                        if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                                                            return (
                                                                <text
                                                                    x={viewBox.cx}
                                                                    y={viewBox.cy}
                                                                    textAnchor="middle"
                                                                    dominantBaseline="middle"
                                                                >
                                                                    <tspan
                                                                        x={viewBox.cx}
                                                                        y={viewBox.cy}
                                                                        className="fill-foreground text-2xl font-bold"
                                                                    >
                                                                        {inrCompact.format(modesTotal)}
                                                                    </tspan>
                                                                    <tspan
                                                                        x={viewBox.cx}
                                                                        y={(viewBox.cy || 0) + 22}
                                                                        className="fill-muted-foreground text-xs"
                                                                    >
                                                                        Collected
                                                                    </tspan>
                                                                </text>
                                                            );
                                                        }
                                                        return null;
                                                    }}
                                                />
                                            </Pie>
                                        </PieChart>
                                    </ChartContainer>
                                    <ul className="mt-2 space-y-1.5 text-sm">
                                        {modesData
                                            .filter((m) => m.value > 0)
                                            .map((m) => (
                                                <li key={m.name} className="flex items-center gap-2">
                                                    <span
                                                        className="size-2.5 shrink-0 rounded-full"
                                                        style={{ background: m.fill }}
                                                    />
                                                    <span className="text-muted-foreground">{m.name}</span>
                                                    <span className="ml-auto font-semibold tabular-nums">
                                                        {inr.format(m.value)}
                                                    </span>
                                                    <span className="w-12 text-right text-xs text-muted-foreground tabular-nums">
                                                        {((m.value / modesTotal) * 100).toFixed(1)}%
                                                    </span>
                                                </li>
                                            ))}
                                    </ul>
                                </>
                            ) : (
                                <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                                    No collections recorded this month.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Charts — row 2 */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-sm xl:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Profit Trend</CardTitle>
                            <CardDescription>Gross vs net profit, last 30 days</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer config={profitChartConfig} className="h-64 w-full">
                                <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={2}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tickLine={false}
                                        axisLine={false}
                                        tickMargin={8}
                                        minTickGap={24}
                                    />
                                    <YAxis
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={inrTick}
                                        width={64}
                                    />
                                    <ChartTooltip
                                        cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                                        content={<ChartTooltipContent indicator="dashed" formatter={inrTooltip} />}
                                    />
                                    <Bar dataKey="gross_profit" fill="var(--color-gross_profit)" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="net_profit" fill="var(--color-net_profit)" radius={[3, 3, 0, 0]} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Money Snapshot</CardTitle>
                            <CardDescription>{month.label}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <dl className="space-y-3 text-sm">
                                {[
                                    { icon: Banknote, label: 'Closing stock value', value: month.closing_stock },
                                    { icon: CreditCard, label: 'Tax collected', value: month.tax_collected },
                                    { icon: HandCoins, label: 'EMI collected', value: month.emi_collected },
                                    { icon: Landmark, label: 'Loans disbursed', value: month.loan_given },
                                    { icon: ReceiptText, label: 'Refunds', value: month.refunds },
                                    { icon: ShoppingBag, label: 'Discounts given', value: month.discounts },
                                ].map(({ icon: Icon, label, value }) => (
                                    <div key={label} className="flex items-center justify-between gap-2">
                                        <span className="flex items-center gap-2 text-muted-foreground">
                                            <Icon className="size-4" />
                                            {label}
                                        </span>
                                        <span className="font-semibold tabular-nums">{inr.format(value)}</span>
                                    </div>
                                ))}
                            </dl>
                        </CardContent>
                    </Card>
                </div>

                {/* Last 7 days */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Last 7 Days</CardTitle>
                        <CardDescription>Every calendar day — quiet days included</CardDescription>
                    </CardHeader>
                    <CardContent className="px-0 sm:px-6">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Invoices</TableHead>
                                    <TableHead className="text-right">Sales</TableHead>
                                    <TableHead className="text-right">Purchases</TableHead>
                                    <TableHead className="text-right">Gross profit</TableHead>
                                    <TableHead className="text-right">Net profit</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {last7.map((d) => {
                                    const isToday = d.date === businessDate;
                                    return (
                                        <TableRow key={d.date} className={isToday ? 'bg-muted/50 font-medium' : undefined}>
                                            <TableCell className="font-medium">
                                                {dayLabel(d.date)}
                                                {isToday && (
                                                    <Badge variant="secondary" className="ml-2">
                                                        Today
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{d.invoices}</TableCell>
                                            <TableCell className="text-right tabular-nums">{inr.format(d.sales)}</TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {inr.format(d.purchases)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums text-blue-600 dark:text-blue-400">
                                                {inr.format(d.gross_profit)}
                                            </TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                {inr.format(d.net_profit)}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                            <TableFooter>
                                <TableRow>
                                    <TableCell>7-day total</TableCell>
                                    <TableCell className="text-right tabular-nums">{last7Totals.invoices}</TableCell>
                                    <TableCell className="text-right tabular-nums">{inr.format(last7Totals.sales)}</TableCell>
                                    <TableCell className="text-right tabular-nums">
                                        {inr.format(last7Totals.purchases)}
                                    </TableCell>
                                    <TableCell className="text-right tabular-nums">{inr.format(last7Totals.gross_profit)}</TableCell>
                                    <TableCell className="text-right tabular-nums">{inr.format(last7Totals.net_profit)}</TableCell>
                                </TableRow>
                            </TableFooter>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Dashboard.layout = {
    breadcrumbs: [{ title: 'Dashboard', href: store.dashboard.url() }],
};

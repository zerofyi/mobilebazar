import { Head } from '@inertiajs/react';
import {
    Banknote,
    CalendarDays,
    CreditCard,
    HandCoins,
    IndianRupee,
    Landmark,
    ReceiptText,
    ShoppingBag,
    ShoppingCart,
    TrendingUp,
    Wallet,
} from 'lucide-react';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Legend,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import StatCard from '@/components/special/stat-card';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
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

const MODE_COLORS: Record<string, string> = {
    Cash: '#10b981',
    UPI: '#3b82f6',
    Card: '#f59e0b',
    Bank: '#8b5cf6',
};

function shortDate(iso?: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
            <p className="mb-1 font-semibold">{label}</p>
            {payload.map((p: any) => (
                <p key={p.dataKey ?? p.name} className="flex items-center gap-2">
                    <span
                        className="size-2 rounded-full"
                        style={{ background: p.color ?? p.payload?.fill ?? p.fill }}
                    />
                    <span className="text-muted-foreground">{p.name}:</span>
                    <span className="font-semibold">
                        {typeof p.value === 'number' && p.dataKey !== 'invoices' ? inr.format(p.value) : p.value}
                    </span>
                </p>
            ))}
        </div>
    );
}

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
    today = emptyDay,
    yesterday = emptyDay,
    growth = { sales: null, invoices: null, profit: null },
    month = emptyMonth,
    trend = [],
}: Partial<DashboardProps>) {
    const trendData = trend.map((d) => ({ ...d, label: shortDate(d.date) }));
    const last7 = [...trend].slice(-7).reverse();
    const modesTotal = month.modes.reduce((s, m) => s + m.value, 0);

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
                            {storeInfo.name} ({storeInfo.code}) ·{' '}
                            {new Date().toLocaleDateString('en-IN', {
                                weekday: 'short',
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                            })}
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
                    <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Today</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <StatCard
                            title="Today's Sales"
                            icon={IndianRupee}
                            value={inr.format(today.sales)}
                            subValue={`${today.invoices} invoices`}
                            subtitle="vs yesterday"
                            growth={growth.sales ?? undefined}
                            variant="success"
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
                        />
                        <StatCard
                            title="EMI Collected"
                            icon={HandCoins}
                            value={inr.format(today.emi_collected)}
                            subValue={`${inrCompact.format(today.loan_given)} disbursed`}
                            subtitle="loan book today"
                            variant="warning"
                        />
                    </div>
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
                        />
                        <StatCard
                            title="Month Purchases"
                            icon={ShoppingCart}
                            value={inr.format(month.purchases)}
                            subValue={`${month.purchases_n} bills`}
                            subtitle="stock inward"
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
                        />
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-sm xl:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Sales vs Purchases — last 30 days</CardTitle>
                        </CardHeader>
                        <CardContent className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gPurch" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.35} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        tickFormatter={(v: number) => inrCompact.format(v)}
                                        width={64}
                                    />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Area
                                        type="monotone"
                                        dataKey="sales"
                                        name="Sales"
                                        stroke="#10b981"
                                        fill="url(#gSales)"
                                        strokeWidth={2}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="purchases"
                                        name="Purchases"
                                        stroke="#3b82f6"
                                        fill="url(#gPurch)"
                                        strokeWidth={2}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Collections by mode — {month.label}</CardTitle>
                        </CardHeader>
                        <CardContent className="h-72">
                            {modesTotal > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={month.modes}
                                            dataKey="value"
                                            nameKey="name"
                                            innerRadius={52}
                                            outerRadius={84}
                                            paddingAngle={2}
                                            strokeWidth={0}
                                        >
                                            {month.modes.map((m) => (
                                                <Cell key={m.name} fill={MODE_COLORS[m.name] ?? '#94a3b8'} />
                                            ))}
                                        </Pie>
                                        <Tooltip content={<ChartTooltip />} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                                    No collections recorded this month.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card className="shadow-sm xl:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Profit trend — last 30 days</CardTitle>
                        </CardHeader>
                        <CardContent className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barGap={2}>
                                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                                    <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} minTickGap={24} />
                                    <YAxis
                                        tick={{ fontSize: 11 }}
                                        tickLine={false}
                                        tickFormatter={(v: number) => inrCompact.format(v)}
                                        width={64}
                                    />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Bar dataKey="gross_profit" name="Gross profit" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="net_profit" name="Net profit" fill="#10b981" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Money snapshot</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <dl className="space-y-3 text-sm">
                                {[
                                    { icon: Banknote, label: 'Closing stock value', value: month.closing_stock },
                                    { icon: CreditCard, label: 'Tax collected (month)', value: month.tax_collected },
                                    { icon: HandCoins, label: 'EMI collected (month)', value: month.emi_collected },
                                    { icon: Landmark, label: 'Loans disbursed (month)', value: month.loan_given },
                                    { icon: ReceiptText, label: 'Refunds (month)', value: month.refunds },
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
                        <CardTitle className="text-base">Last 7 days</CardTitle>
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
                                {last7.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                                            No summary data yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {last7.map((d) => (
                                    <TableRow key={d.date ?? Math.random()}>
                                        <TableCell className="font-medium">{shortDate(d.date)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{d.invoices}</TableCell>
                                        <TableCell className="text-right tabular-nums">{inr.format(d.sales)}</TableCell>
                                        <TableCell className="text-right tabular-nums">{inr.format(d.purchases)}</TableCell>
                                        <TableCell className="text-right tabular-nums text-blue-600 dark:text-blue-400">
                                            {inr.format(d.gross_profit)}
                                        </TableCell>
                                        <TableCell className="text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                                            {inr.format(d.net_profit)}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
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

import React, { useCallback, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';

import {
    Wallet, Download, Search, HandCoins, AlertCircle, Users, ShoppingCart, BadgeIndianRupee,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';

import {
    ReportPagination,
    type ReportLinkItem,
} from './partials/report-shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PayableRow {
    supplier_id: number;
    supplier_name: string;
    phone: string | null;
    gstin: string | null;
    purchase_count: number;
    total_purchased: number;
    total_paid: number;
    total_due: number;
    overdue_amount: number;
}

interface Paginated {
    data: PayableRow[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: ReportLinkItem[];
}

interface Props {
    rows?: Paginated;
    summary?: {
        supplier_count: number;
        total_purchased: number;
        total_paid: number;
        total_due: number;
        overdue_amount: number;
    };
    filters: {
        search?: string | null;
    };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Payables({ rows, summary, filters }: Props) {
    const [search, setSearch] = useState(filters.search || '');

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        router.get(
            app.reports.purchases.payables.url(),
            { search: search.trim() || undefined },
            { preserveState: true, replace: true }
        );
    }, [search]);

    const csvUrl = app.reports.purchases.payables.url({
        query: {
            export: 'csv',
            ...(filters.search ? { search: filters.search } : {}),
        },
    });

    const loading = !rows || !summary;

    return (
        <>
            <Head title="Supplier Payables" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Wallet className="size-6 text-primary" />
                            Supplier Payables
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Outstanding amounts per supplier, sorted by dues — oldest risk first.
                        </p>
                    </div>
                    <Button asChild variant="outline" className="shadow-sm">
                        <a href={csvUrl} download>
                            <Download className="mr-2 size-4" /> Export CSV
                        </a>
                    </Button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <StatCard
                        title="Suppliers Owed"
                        value={summary?.supplier_count ?? 0}
                        icon={Users}
                        subtitle="With outstanding dues"
                        loading={loading}
                    />
                    <StatCard
                        title="Total Purchased"
                        value={<>₹<FormatAmount amount={summary?.total_purchased ?? 0} /></>}
                        icon={ShoppingCart}
                        subtitle="Gross from these vendors"
                        loading={loading}
                    />
                    <StatCard
                        title="Total Paid"
                        value={<>₹<FormatAmount amount={summary?.total_paid ?? 0} /></>}
                        icon={BadgeIndianRupee}
                        subtitle="Paid to vendors"
                        variant="success"
                        loading={loading}
                    />
                    <StatCard
                        title="Total Due"
                        value={<>₹<FormatAmount amount={summary?.total_due ?? 0} /></>}
                        icon={HandCoins}
                        subtitle="Accounts payable"
                        variant={(summary?.total_due ?? 0) > 0 ? 'warning' : 'default'}
                        loading={loading}
                    />
                    <StatCard
                        title="Overdue"
                        value={<>₹<FormatAmount amount={summary?.overdue_amount ?? 0} /></>}
                        icon={AlertCircle}
                        subtitle="Past due date"
                        variant={(summary?.overdue_amount ?? 0) > 0 ? 'danger' : 'default'}
                        loading={loading}
                    />
                </div>

                {/* Table Section */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleSearch} className="flex items-center gap-2">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search supplier name or company…"
                                    className="pl-9 h-9 bg-muted/40 text-xs transition-colors focus:bg-background"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            <Button type="submit" variant="secondary" size="sm" className="h-9 px-4 shrink-0">
                                Search
                            </Button>
                        </form>
                    </CardHeader>

                    <CardContent className="p-0 overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                    <TableHead className="text-xs font-semibold">Supplier</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Purchases</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Total Purchased</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Total Paid</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Total Due</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Overdue</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-10 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : rows.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
                                            <Wallet className="size-10 mx-auto mb-3 opacity-20" />
                                            <p className="font-medium text-foreground">No supplier payables found</p>
                                            <p className="text-sm">Try a different search, or all dues are cleared.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.data.map((row, index) => (
                                        <TableRow
                                            key={row.supplier_id}
                                            className={cn(
                                                'transition-colors',
                                                row.overdue_amount > 0
                                                    ? 'bg-destructive/5 hover:bg-destructive/10'
                                                    : 'hover:bg-muted/20'
                                            )}
                                        >
                                            <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                {(rows.from ?? 1) + index}
                                            </TableCell>
                                            <TableCell>
                                                <p className="font-semibold text-sm">{row.supplier_name}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {row.gstin ? `GSTIN ${row.gstin}` : row.phone ?? ''}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">{row.purchase_count}</TableCell>
                                            <TableCell className="text-right text-xs">₹<FormatAmount amount={row.total_purchased} /></TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground">₹<FormatAmount amount={row.total_paid} /></TableCell>
                                            <TableCell className={cn(
                                                'text-right text-sm font-bold',
                                                row.total_due > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/60'
                                            )}>
                                                ₹<FormatAmount amount={row.total_due} />
                                            </TableCell>
                                            <TableCell className={cn(
                                                'text-right text-xs font-bold',
                                                row.overdue_amount > 0 ? 'text-destructive' : 'text-muted-foreground/60'
                                            )}>
                                                ₹<FormatAmount amount={row.overdue_amount} />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>

                    {rows && (
                        <ReportPagination
                            links={rows.links}
                            from={rows.from}
                            to={rows.to}
                            total={rows.total}
                            label="suppliers"
                        />
                    )}
                </Card>
            </div>
        </>
    );
}

Payables.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Reports', href: app.reports.purchases.register.url() },
        { title: 'Supplier Payables', href: app.reports.purchases.payables.url() },
    ],
};

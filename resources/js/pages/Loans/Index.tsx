import React, { useState, useCallback } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import app from '@/routes/app';

import {
    ReceiptText, Plus, Search, User, Eye,
    Wallet, AlertCircle, CheckCircle2, Clock, MapPin, Phone,
    Landmark, CalendarClock, Banknote, TrendingUp,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { FormatAmount } from '@/components/special/format-amount';

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface BorrowerSummary {
    id: number;
    name?: string | null;
    company_name?: string | null;
    phone_primary?: string | null;
    phone?: string | null;
    care_of?: string | null;
    borrower_type?: string;
}

interface LoanItem {
    id: number;
    uuid: string;
    loan_number: string;
    principal_amount: number | string;
    down_payment: number | string;
    interest_rate: number | string;
    processing_fee: number | string;
    file_charge_mode: 'upfront' | 'spread';
    total_interest: number | string;
    total_payable: number | string;
    paid_amount: number | string;
    balance_amount: number | string;
    tenure_months: number;
    emi_amount: number | string;
    collection_slab: string;
    status: 'active' | 'closed' | 'defaulted';
    disbursed_date: string;
    settled_at?: string | null;
    defaulted_at?: string | null;
    borrower: BorrowerSummary | null;
}

interface PaginationLinkItem {
    url: string | null;
    label: string;
    active: boolean;
}

interface PaginatedLoans {
    data: LoanItem[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: PaginationLinkItem[];
}

interface Props {
    loans?: PaginatedLoans;
    filters: {
        status?: string;
        q?: string;
    };
    stats?: {
        active_count: number;
        active_balance: number;
        overdue_count: number;
        collected_today: number;
    };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number | string | undefined | null): string {
    if (n === undefined || n === null || n === '') return '0.00';
    const v = Number(n);
    if (isNaN(v)) return '0.00';
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Borrower is a Customer|Supplier morph — the two types keep different columns. */
function borrowerName(b: BorrowerSummary | null): string {
    if (!b) return '—';
    return b.name || b.company_name || '—';
}

function borrowerPhone(b: BorrowerSummary | null): string {
    if (!b) return '';
    return b.phone_primary || b.phone || '';
}

function isSupplier(b: BorrowerSummary | null): boolean {
    return !!b && (!!b.company_name || !!b.phone);
}

function StatusBadge({ item }: { item: LoanItem }) {
    const isSettled = item.status === 'closed' && !!item.settled_at;
    const isClosed = item.status === 'closed' && !isSettled;
    const isActive = item.status === 'active';
    const isDefaulted = item.status === 'defaulted';

    return (
        <Badge
            variant="outline"
            className={cn('gap-1 font-medium text-xs whitespace-nowrap', {
                'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400': isActive,
                'text-blue-700 border-blue-400/40 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400': isSettled,
                'text-purple-700 border-purple-400/40 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400': isClosed,
                'text-destructive border-destructive/40 bg-destructive/5': isDefaulted,
            })}
        >
            {isActive && <Clock className="size-3" />}
            {(isSettled || isClosed) && <CheckCircle2 className="size-3" />}
            {isDefaulted && <AlertCircle className="size-3" />}
            {isSettled ? 'Settled' : isClosed ? 'Closed' : isActive ? 'Active' : 'Defaulted'}
        </Badge>
    );
}

function MoneyProgress({ paid, total }: { paid: number | string; total: number | string }) {
    const p = Number(paid) || 0;
    const t = Number(total) || 0;
    const pct = t > 0 ? Math.min(100, Math.round((p / t) * 100)) : 0;
    return (
        <div className="space-y-1.5 min-w-28">
            <div className="flex items-center justify-between text-xs gap-2">
                <span className="font-semibold text-foreground tracking-tight whitespace-nowrap">
                    ₹{fmt(p)} <span className="text-muted-foreground font-normal">/ ₹{fmt(t)}</span>
                </span>
                <span className="text-[10px] text-muted-foreground font-semibold">{pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden border border-border/40 shadow-inner">
                <div
                    className={cn('h-full rounded-full transition-all duration-500', pct >= 100 ? 'bg-blue-500' : 'bg-emerald-500')}
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    );
}

function TableSkeletonRow() {
    return (
        <TableRow>
            <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-24 mb-1" /><Skeleton className="h-3 w-16" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28 mb-1" /><Skeleton className="h-3 w-20" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto mb-1" /><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-2 w-full mb-1" /><Skeleton className="h-3 w-12" /></TableCell>
            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
            <TableCell className="text-center"><Skeleton className="h-7 w-12 mx-auto" /></TableCell>
        </TableRow>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Index({ loans: loanList, filters, stats }: Props) {
    const [search, setSearch] = useState(filters.q || '');
    const [status, setStatus] = useState(filters.status || 'all');

    const indexUrl = app.loans.index.url();

    const updateFilters = useCallback((newSearch: string, newStatus: string) => {
        router.get(indexUrl, {
            q: newSearch || undefined,
            status: newStatus !== 'all' ? newStatus : undefined,
        }, { preserveState: true, replace: true });
    }, [indexUrl]);

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        updateFilters(search, status);
    }, [search, status, updateFilters]);

    const handleStatusChange = useCallback((val: string) => {
        setStatus(val);
        updateFilters(search, val);
    }, [search, updateFilters]);

    const loadingStats = !stats;
    const loadingList = !loanList;

    return (
        <>
            <Head title="Loans" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <ReceiptText className="size-6 text-primary" />
                            Financed Loans
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage device financing loans and their recovery.
                        </p>
                    </div>
                    <Button asChild className="shadow-sm">
                        <Link href={app.loans.create.url()}>
                            <Plus className="mr-2 size-4" /> Issue New Loan
                        </Link>
                    </Button>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="Active Loans"
                        value={stats?.active_count ?? 0}
                        icon={Wallet}
                        subtitle="Currently collecting"
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Active Outstanding"
                        value={<>₹<FormatAmount amount={stats?.active_balance ?? 0} /></>}
                        icon={TrendingUp}
                        subtitle="Balance on active loans"
                        variant={(stats?.active_balance ?? 0) > 0 ? 'warning' : 'default'}
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Loans with Overdue EMI"
                        value={stats?.overdue_count ?? 0}
                        icon={AlertCircle}
                        subtitle="Need follow-up"
                        variant={(stats?.overdue_count ?? 0) > 0 ? 'destructive' : 'default'}
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Collected Today"
                        value={<>₹<FormatAmount amount={stats?.collected_today ?? 0} /></>}
                        icon={Banknote}
                        subtitle="All repayments today"
                        variant="success"
                        loading={loadingStats}
                    />
                </div>

                {/* Table Section */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            <div className="relative flex-1 min-w-50">
                                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search loan #, borrower name, or phone…"
                                    className="pl-9 h-9 bg-muted/40 text-xs transition-colors focus:bg-background"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            <div className="flex h-9 items-center rounded-md border border-border bg-muted p-1 shrink-0">
                                {[
                                    { key: 'all', label: 'All' },
                                    { key: 'active', label: 'Active' },
                                    { key: 'closed', label: 'Closed' },
                                    { key: 'defaulted', label: 'Defaulted' },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handleStatusChange(item.key)}
                                        className={cn(
                                            'flex h-full items-center justify-center rounded px-2.5 text-xs font-medium transition-all',
                                            status === item.key
                                                ? 'bg-background text-foreground shadow-sm font-semibold'
                                                : 'text-muted-foreground hover:text-foreground'
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
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
                                    <TableHead className="text-xs font-semibold">Loan Info</TableHead>
                                    <TableHead className="text-xs font-semibold">Borrower</TableHead>
                                    <TableHead className="text-right text-xs font-semibold">Finance Setup (₹)</TableHead>
                                    <TableHead className="text-xs font-semibold">Recovery Progress</TableHead>
                                    <TableHead className="text-xs font-semibold">Status</TableHead>
                                    <TableHead className="text-center w-20 text-xs font-semibold">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingList ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableSkeletonRow key={i} />)
                                ) : loanList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
                                            <ReceiptText className="size-10 mx-auto mb-3 opacity-20" />
                                            <p className="font-medium text-foreground">No loan records found</p>
                                            <p className="text-sm">Try adjusting your search or filters.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    loanList.data.map((item, index) => {
                                        const serialNumber = (loanList?.from ?? 1) + index;
                                        const isClosed = item.status === 'closed';
                                        const isDefaulted = item.status === 'defaulted';
                                        const borrower = item.borrower;
                                        const fee = Number(item.processing_fee) || 0;

                                        return (
                                            <TableRow
                                                key={item.id}
                                                className={cn(
                                                    'group transition-colors',
                                                    isDefaulted && 'bg-destructive/5 hover:bg-destructive/10',
                                                    isClosed && 'bg-emerald-500/5 hover:bg-emerald-500/10',
                                                    !isClosed && !isDefaulted && 'hover:bg-muted/20'
                                                )}
                                            >
                                                <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                    {serialNumber}
                                                </TableCell>

                                                <TableCell>
                                                    <Link
                                                        href={app.loans.show.url(item.uuid)}
                                                        className="font-bold text-primary hover:underline underline-offset-4 decoration-primary/50 text-sm tracking-tight"
                                                    >
                                                        {item.loan_number}
                                                    </Link>
                                                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                                                        <Clock className="size-3 opacity-60" />{fmtDate(item.disbursed_date)}
                                                        <CalendarClock className="size-3 opacity-60" />Slab: {item.collection_slab}
                                                    </p>
                                                </TableCell>

                                                <TableCell>
                                                    <HoverCard openDelay={200} closeDelay={100}>
                                                        <HoverCardTrigger asChild>
                                                            <div className="flex flex-col cursor-help w-max">
                                                                <div className="flex items-center gap-1.5 group-hover/trigger:text-primary transition-colors">
                                                                    {isSupplier(borrower)
                                                                        ? <Landmark className="size-3.5 text-muted-foreground shrink-0" />
                                                                        : <User className="size-3.5 text-muted-foreground shrink-0" />}
                                                                    <span className="font-semibold text-sm underline decoration-muted-foreground/30 underline-offset-4">
                                                                        {borrowerName(borrower)}
                                                                    </span>
                                                                </div>
                                                                {borrowerPhone(borrower) && (
                                                                    <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                                                                        {borrowerPhone(borrower)}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </HoverCardTrigger>
                                                        <HoverCardContent className="w-80 p-4 shadow-lg border-primary/20" align="start">
                                                            <div className="space-y-1.5">
                                                                <h4 className="text-sm font-bold text-foreground leading-none">
                                                                    {borrowerName(borrower)}
                                                                </h4>
                                                                {borrower?.care_of && (
                                                                    <p className="text-xs text-muted-foreground truncate">C/O: {borrower.care_of}</p>
                                                                )}
                                                                {borrower?.company_name && borrower?.name && (
                                                                    <p className="text-xs text-muted-foreground truncate">{borrower.company_name}</p>
                                                                )}
                                                                {borrowerPhone(borrower) && (
                                                                    <div className="flex items-center text-xs text-muted-foreground pt-1 border-t border-border/40">
                                                                        <Phone className="mr-1.5 size-3" />
                                                                        {borrowerPhone(borrower)}
                                                                    </div>
                                                                )}
                                                                <div className="flex items-center text-xs text-muted-foreground">
                                                                    <MapPin className="mr-1.5 size-3" />
                                                                    {isSupplier(borrower) ? 'Supplier' : 'Customer'}
                                                                </div>
                                                            </div>
                                                        </HoverCardContent>
                                                    </HoverCard>
                                                </TableCell>

                                                <TableCell className="text-right">
                                                    <div className="text-[9px] font-medium mt-1 flex items-center justify-end gap-1 uppercase">
                                                        <span className="text-muted-foreground">₹{fmt(item.principal_amount)} (P)</span>
                                                        <span className="text-border mx-0.5">+</span>
                                                        <span className="text-amber-600/80 dark:text-amber-500/80">₹{fmt(item.total_interest)} (I)</span>
                                                        {fee > 0 && item.file_charge_mode === 'spread' && (
                                                            <>
                                                                <span className="text-border mx-0.5">+</span>
                                                                <span className="text-blue-600/80 dark:text-blue-500/80">₹{fmt(fee)} (F)</span>
                                                            </>
                                                        )}
                                                        <span className="text-border mx-0.5">=</span>
                                                        <p className="font-bold text-green-600 tracking-tight text-[12px]">₹{fmt(item.total_payable)}</p>
                                                        {fee > 0 && item.file_charge_mode === 'upfront' && (
                                                            <>
                                                                <span className="text-border mx-0.5">+</span>
                                                                <span className="text-blue-600/80 dark:text-blue-500/80">₹{fmt(fee)} (F)</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-semibold">
                                                        EMI: ₹{fmt(item.emi_amount)} × {item.tenure_months}
                                                    </p>
                                                </TableCell>

                                                <TableCell>
                                                    <MoneyProgress paid={item.paid_amount} total={item.total_payable} />
                                                </TableCell>

                                                <TableCell>
                                                    <StatusBadge item={item} />
                                                </TableCell>

                                                <TableCell className="text-center">
                                                    <Button variant="ghost" asChild className="h-7 px-2.5 text-xs">
                                                        <Link href={app.loans.show.url(item.uuid)}>
                                                            <Eye className="size-3" />View
                                                        </Link>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>

                    {(() => {
                        if (!loanList || loanList.last_page <= 1) return null;

                        const prevLink = loanList.links.find((l) => l.label.includes('Previous'));
                        const nextLink = loanList.links.find((l) => l.label.includes('Next'));
                        const pageLinks = loanList.links.filter(
                            (l) => !l.label.includes('Previous') && !l.label.includes('Next')
                        );

                        return (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
                                <p className="text-xs text-muted-foreground">
                                    Showing <span className="font-medium text-foreground">{loanList.from ?? 0}</span> to{' '}
                                    <span className="font-medium text-foreground">{loanList.to ?? 0}</span> of{' '}
                                    <span className="font-medium text-foreground">{loanList.total ?? 0}</span> loans
                                </p>

                                <Pagination className="w-auto mx-0">
                                    <PaginationContent className="gap-1">
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href={prevLink?.url ?? '#'}
                                                className={cn('h-8 text-xs px-2.5', !prevLink?.url && 'pointer-events-none opacity-40')}
                                                onClick={(e) => {
                                                    if (!prevLink?.url) return;
                                                    e.preventDefault();
                                                    router.get(prevLink.url, {}, { preserveState: true });
                                                }}
                                            />
                                        </PaginationItem>

                                        {pageLinks.map((link, idx) => (
                                            <PaginationItem key={idx}>
                                                <PaginationLink
                                                    href={link.url ?? '#'}
                                                    isActive={link.active}
                                                    className="h-8 w-8 text-xs"
                                                    onClick={(e) => {
                                                        if (!link.url || link.active) return;
                                                        e.preventDefault();
                                                        router.get(link.url, {}, { preserveState: true });
                                                    }}
                                                >
                                                    {link.label.replace(/&laquo;|&raquo;/g, '').trim()}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ))}

                                        <PaginationItem>
                                            <PaginationNext
                                                href={nextLink?.url ?? '#'}
                                                className={cn('h-8 text-xs px-2.5', !nextLink?.url && 'pointer-events-none opacity-40')}
                                                onClick={(e) => {
                                                    if (!nextLink?.url) return;
                                                    e.preventDefault();
                                                    router.get(nextLink.url, {}, { preserveState: true });
                                                }}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        );
                    })()}
                </Card>
            </div>
        </>
    );
}

Index.layout = {
    breadcrumbs: [{ title: 'Loans', href: app.loans.index.url() }],
};

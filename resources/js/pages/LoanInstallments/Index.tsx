import React, { useState, useCallback } from 'react';
import { Head, router } from '@inertiajs/react';
import app from '@/routes/app';

import { CalendarClock, Search, HandCoins, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';

import ScheduleTable, {
    type InstallmentRow,
    scheduleBalance,
} from './Partials/ScheduleTable';
import CollectionModal, { type CollectionModalSchedule } from '../Loans/Emi/Partials/CollectionModal';

interface PaginatedSchedules {
    data: InstallmentRow[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
}

interface Props {
    schedules: PaginatedSchedules;
    filters: {
        status?: string;
        from?: string;
        to?: string;
    };
}

const STATUS_OPTIONS = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'partial', label: 'Partial' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
];

export default function Index({ schedules, filters }: Props) {
    const [status, setStatus] = useState(filters.status || 'all');
    const [from, setFrom] = useState(filters.from || '');
    const [to, setTo] = useState(filters.to || '');
    const [collectSchedule, setCollectSchedule] = useState<CollectionModalSchedule | null>(null);

    const indexUrl = app.installments.index.url();

    const applyFilters = useCallback((s: string, f: string, t: string) => {
        router.get(indexUrl, {
            status: s !== 'all' ? s : undefined,
            from: f || undefined,
            to: t || undefined,
        }, { preserveState: true, replace: true });
    }, [indexUrl]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters(status, from, to);
    };

    const clearFilters = () => {
        setStatus('all');
        setFrom('');
        setTo('');
        router.get(indexUrl, {}, { preserveState: true, replace: true });
    };

    const openCollect = (s: InstallmentRow) => {
        setCollectSchedule({
            id: s.id,
            uuid: s.uuid,
            installment_no: s.installment_no,
            due_date: s.due_date,
            total_due: s.total_due,
            paid_amount: s.paid_amount,
            penalty_amount: s.penalty_amount,
            status: s.status,
            loan: s.loan ? { id: s.loan.id, loan_number: s.loan.loan_number, borrower: s.loan.borrower ?? undefined } : null,
        });
    };

    const rows = schedules?.data ?? [];
    const totalDue = rows.reduce((sum, s) => sum + (Number(s.total_due) || 0), 0);
    const totalBalance = rows.reduce((sum, s) => sum + scheduleBalance(s), 0);
    const overdueCount = rows.filter((s) => s.status === 'overdue').length;

    const prevLink = schedules?.links.find((l) => l.label.includes('Previous'));
    const nextLink = schedules?.links.find((l) => l.label.includes('Next'));
    const pageLinks = (schedules?.links ?? []).filter(
        (l) => !l.label.includes('Previous') && !l.label.includes('Next')
    );

    return (
        <>
            <Head title="Installments" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <CalendarClock className="size-6 text-primary" />
                        Installments
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Every EMI due across all loans — filter by status and due-date range.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                        title="Listed EMIs"
                        value={schedules?.total ?? 0}
                        icon={CalendarClock}
                        subtitle="Matching filters"
                    />
                    <StatCard
                        title="Total Due (Listed)"
                        value={<>₹<FormatAmount amount={totalDue} /></>}
                        icon={Wallet}
                        subtitle="Sum of installment totals"
                    />
                    <StatCard
                        title="Outstanding (Listed)"
                        value={<>₹<FormatAmount amount={totalBalance} /></>}
                        icon={HandCoins}
                        subtitle={overdueCount > 0 ? `${overdueCount} overdue in view` : 'Nothing overdue in view'}
                        variant={totalBalance > 0 ? 'warning' : 'default'}
                    />
                </div>

                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Status</Label>
                                <Select value={status} onValueChange={setStatus}>
                                    <SelectTrigger className="h-9 text-xs w-36"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="from" className="text-xs font-semibold">Due From</Label>
                                <Input id="from" type="date" className="h-9 text-xs" value={from}
                                    onChange={(e) => setFrom(e.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="to" className="text-xs font-semibold">Due To</Label>
                                <Input id="to" type="date" className="h-9 text-xs" value={to}
                                    onChange={(e) => setTo(e.target.value)} />
                            </div>
                            <Button type="submit" variant="secondary" size="sm" className="h-9">
                                <Search className="mr-1.5 size-3.5" /> Filter
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                                Clear
                            </Button>
                        </form>
                    </CardHeader>

                    <CardContent className="p-0 overflow-auto">
                        <ScheduleTable schedules={rows} onCollect={openCollect} />
                    </CardContent>

                    {schedules && schedules.last_page > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
                            <p className="text-xs text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{schedules.from ?? 0}</span> to{' '}
                                <span className="font-medium text-foreground">{schedules.to ?? 0}</span> of{' '}
                                <span className="font-medium text-foreground">{schedules.total ?? 0}</span> installments
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
                    )}
                </Card>
            </div>

            <CollectionModal
                open={!!collectSchedule}
                onOpenChange={(v) => !v && setCollectSchedule(null)}
                schedule={collectSchedule}
            />
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: 'Installments', href: app.installments.index.url() },
    ],
};

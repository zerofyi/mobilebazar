import React, { useState } from 'react';
import { Head, router } from '@inertiajs/react';
import app from '@/routes/app';

import { AlertTriangle, Wallet, CalendarClock } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
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
}

function daysOverdue(iso: string): number {
    const due = new Date(iso);
    due.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((t.getTime() - due.getTime()) / 86400000));
}

export default function Overdue({ schedules }: Props) {
    const [collectSchedule, setCollectSchedule] = useState<CollectionModalSchedule | null>(null);

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
    const totalOverdue = rows.reduce((sum, s) => sum + scheduleBalance(s), 0);
    const oldestDays = rows.reduce((max, s) => Math.max(max, daysOverdue(s.due_date)), 0);

    const prevLink = schedules?.links.find((l) => l.label.includes('Previous'));
    const nextLink = schedules?.links.find((l) => l.label.includes('Next'));
    const pageLinks = (schedules?.links ?? []).filter(
        (l) => !l.label.includes('Previous') && !l.label.includes('Next')
    );

    return (
        <>
            <Head title="Overdue Installments" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <AlertTriangle className="size-6 text-destructive" />
                        Overdue Installments
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Past due date and not fully paid — follow up for collection.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                        title="Overdue EMIs"
                        value={schedules?.total ?? 0}
                        icon={AlertTriangle}
                        subtitle="Across all loans"
                        variant={(schedules?.total ?? 0) > 0 ? 'destructive' : 'default'}
                    />
                    <StatCard
                        title="Overdue Amount"
                        value={<>₹<FormatAmount amount={totalOverdue} /></>}
                        icon={Wallet}
                        subtitle="Outstanding on listed EMIs"
                        variant={totalOverdue > 0 ? 'destructive' : 'default'}
                    />
                    <StatCard
                        title="Oldest Overdue"
                        value={rows.length > 0 ? `${oldestDays}d` : '—'}
                        icon={CalendarClock}
                        subtitle="Days past due"
                    />
                </div>

                <Card className="border-destructive/20 shadow-sm flex flex-col min-h-0">
                    <CardContent className="p-0 overflow-auto">
                        <ScheduleTable schedules={rows} onCollect={openCollect} />
                    </CardContent>

                    {schedules && schedules.last_page > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
                            <p className="text-xs text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{schedules.from ?? 0}</span> to{' '}
                                <span className="font-medium text-foreground">{schedules.to ?? 0}</span> of{' '}
                                <span className="font-medium text-foreground">{schedules.total ?? 0}</span> overdue installments
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

Overdue.layout = {
    breadcrumbs: [
        { title: 'Installments', href: app.installments.index.url() },
        { title: 'Overdue', href: app.installments.overdue.url() },
    ],
};

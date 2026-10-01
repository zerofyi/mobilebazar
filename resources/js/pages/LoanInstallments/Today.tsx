import React, { useState } from 'react';
import { Head } from '@inertiajs/react';
import app from '@/routes/app';

import { CalendarCheck2, Wallet, HandCoins, AlertTriangle } from 'lucide-react';

import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';

import ScheduleTable, {
    type InstallmentRow,
    scheduleBalance,
    fmtDate,
} from './Partials/ScheduleTable';
import CollectionModal, { type CollectionModalSchedule } from '../Loans/Emi/Partials/CollectionModal';

interface Props {
    schedules: InstallmentRow[];
    date: string;
}

export default function Today({ schedules = [], date }: Props) {
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

    const totalDue = schedules.reduce((sum, s) => sum + (Number(s.total_due) || 0), 0);
    const collected = schedules.reduce((sum, s) => sum + (Number(s.paid_amount) || 0), 0);
    const remaining = schedules.reduce((sum, s) => sum + scheduleBalance(s), 0);
    const overdueToday = schedules.filter((s) => s.status === 'overdue').length;

    return (
        <>
            <Head title="Today's Collections" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <CalendarCheck2 className="size-6 text-primary" />
                        Today's Collections
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        EMIs due on {fmtDate(date)} — collect them here.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="EMIs Due Today"
                        value={schedules.length}
                        icon={CalendarCheck2}
                        subtitle={fmtDate(date)}
                    />
                    <StatCard
                        title="Total Due Today"
                        value={<>₹<FormatAmount amount={totalDue} /></>}
                        icon={Wallet}
                        subtitle="Sum of today's installments"
                        variant={totalDue > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        title="Collected Today"
                        value={<>₹<FormatAmount amount={collected} /></>}
                        icon={HandCoins}
                        subtitle="Paid against today's EMIs"
                        variant="success"
                    />
                    <StatCard
                        title="Still Outstanding"
                        value={<>₹<FormatAmount amount={remaining} /></>}
                        icon={AlertTriangle}
                        subtitle={overdueToday > 0 ? `${overdueToday} marked overdue` : 'All on track'}
                        variant={remaining > 0 ? 'destructive' : 'default'}
                    />
                </div>

                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardContent className="p-0 overflow-auto">
                        <ScheduleTable schedules={schedules} onCollect={openCollect} />
                    </CardContent>
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

Today.layout = {
    breadcrumbs: [
        { title: 'Installments', href: app.installments.index.url() },
        { title: "Today's Collections", href: app.installments.today.url() },
    ],
};

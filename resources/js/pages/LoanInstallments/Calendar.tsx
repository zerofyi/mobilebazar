import React, { useMemo, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import app from '@/routes/app';

import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import ScheduleTable, {
    type InstallmentRow,
    scheduleBalance,
    fmt,
} from './Partials/ScheduleTable';
import CollectionModal, { type CollectionModalSchedule } from '../Loans/Emi/Partials/CollectionModal';

interface Props {
    /** First day of the displayed month (YYYY-MM-DD). */
    month: string;
    /** Schedules grouped by due-date string (YYYY-MM-DD). */
    schedules: Record<string, InstallmentRow[]>;
}

function toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftMonth(iso: string, delta: number): string {
    const d = new Date(iso + 'T00:00:00');
    d.setMonth(d.getMonth() + delta);
    d.setDate(1);
    return toISODate(d);
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Calendar({ month, schedules = {} }: Props) {
    const [selectedDay, setSelectedDay] = useState<string | null>(null);
    const [collectSchedule, setCollectSchedule] = useState<CollectionModalSchedule | null>(null);

    const calendarUrl = app.installments.calendar.url();

    const monthDate = useMemo(() => new Date(month + 'T00:00:00'), [month]);

    /** 6×7 grid cells covering the month (Monday-first). */
    const cells = useMemo(() => {
        const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        // Monday-first offset: JS Sunday=0 → offset 6
        const offset = (first.getDay() + 6) % 7;
        const start = new Date(first);
        start.setDate(start.getDate() - offset);
        return Array.from({ length: 42 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    }, [monthDate]);

    const goMonth = (delta: number) => {
        setSelectedDay(null);
        router.get(calendarUrl, { month: shiftMonth(month, delta) }, { preserveState: true });
    };

    const goToday = () => {
        setSelectedDay(null);
        router.get(calendarUrl, {}, { preserveState: true });
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

    const todayISO = toISODate(new Date());
    const selectedSchedules = selectedDay ? schedules[selectedDay] ?? [] : [];
    const monthTotal = Object.values(schedules).flat().reduce((sum, s) => sum + (Number(s.total_due) || 0), 0);
    const monthOutstanding = Object.values(schedules).flat().reduce((sum, s) => sum + scheduleBalance(s), 0);

    const monthLabel = monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    return (
        <>
            <Head title="Collection Calendar" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <CalendarIcon className="size-6 text-primary" />
                            Collection Calendar
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {monthLabel} · ₹{fmt(monthTotal)} due · ₹{fmt(monthOutstanding)} outstanding
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="icon" className="size-8" onClick={() => goMonth(-1)} aria-label="Previous month">
                            <ChevronLeft className="size-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="h-8" onClick={goToday}>
                            Today
                        </Button>
                        <Button variant="outline" size="icon" className="size-8" onClick={() => goMonth(1)} aria-label="Next month">
                            <ChevronRight className="size-4" />
                        </Button>
                    </div>
                </div>

                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardContent className="p-3 sm:p-4">
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {WEEKDAYS.map((d) => (
                                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground uppercase py-1">
                                    {d}
                                </div>
                            ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                            {cells.map((d) => {
                                const iso = toISODate(d);
                                const daySchedules = schedules[iso] ?? [];
                                const inMonth = d.getMonth() === monthDate.getMonth();
                                const isToday = iso === todayISO;
                                const isSelected = iso === selectedDay;
                                const dayTotal = daySchedules.reduce((sum, s) => sum + (Number(s.total_due) || 0), 0);
                                const hasOverdue = daySchedules.some((s) => s.status === 'overdue');

                                return (
                                    <button
                                        key={iso}
                                        type="button"
                                        onClick={() => setSelectedDay(isSelected ? null : iso)}
                                        className={cn(
                                            'min-h-16 sm:min-h-20 rounded-lg border p-1.5 text-left transition-colors',
                                            !inMonth && 'opacity-40 bg-muted/30',
                                            inMonth && 'bg-background hover:bg-muted/40',
                                            isToday && 'border-primary/60 ring-1 ring-primary/30',
                                            isSelected && 'border-primary bg-primary/5',
                                            !isToday && !isSelected && 'border-border/60',
                                            hasOverdue && inMonth && 'border-destructive/40'
                                        )}
                                    >
                                        <div className={cn(
                                            'text-xs font-semibold size-6 flex items-center justify-center rounded-full',
                                            isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
                                        )}>
                                            {d.getDate()}
                                        </div>
                                        {daySchedules.length > 0 && (
                                            <div className="mt-1 space-y-0.5">
                                                <div className={cn(
                                                    'text-[10px] font-bold px-1 rounded w-max',
                                                    hasOverdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                                                )}>
                                                    {daySchedules.length} EMI{daySchedules.length > 1 ? 's' : ''}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground font-medium px-1">
                                                    ₹{fmt(dayTotal)}
                                                </div>
                                            </div>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {selectedDay && (
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-base">
                                {new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-IN', {
                                    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
                                })}
                                <span className="text-sm font-normal text-muted-foreground ml-2">
                                    {selectedSchedules.length} installment{selectedSchedules.length === 1 ? '' : 's'}
                                </span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 overflow-auto">
                            <ScheduleTable schedules={selectedSchedules} onCollect={openCollect} />
                        </CardContent>
                    </Card>
                )}
            </div>

            <CollectionModal
                open={!!collectSchedule}
                onOpenChange={(v) => !v && setCollectSchedule(null)}
                schedule={collectSchedule}
            />
        </>
    );
}

Calendar.layout = {
    breadcrumbs: [
        { title: 'Installments', href: app.installments.index.url() },
        { title: 'Calendar', href: app.installments.calendar.url() },
    ],
};

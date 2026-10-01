import React from 'react';
import { Link } from '@inertiajs/react';
import app from '@/routes/app';
import { HandCoins } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface InstallmentRow {
    id: number;
    uuid: string;
    installment_no: number;
    due_date: string;
    total_due: number | string;
    paid_amount: number | string;
    penalty_amount?: number | string | null;
    status: string;
    loan?: {
        id: number;
        uuid: string;
        loan_number?: string;
        borrower?: {
            name?: string | null;
            company_name?: string | null;
            phone_primary?: string | null;
            phone?: string | null;
        } | null;
    } | null;
}

export function fmt(n: number | string | undefined | null): string {
    if (n === undefined || n === null || n === '') return '0.00';
    const v = Number(n);
    if (isNaN(v)) return '0.00';
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function borrowerLabel(loan: InstallmentRow['loan']): string {
    const b = loan?.borrower;
    if (!b) return '—';
    return b.name || b.company_name || '—';
}

export function scheduleBalance(s: InstallmentRow): number {
    return Math.max(0, (Number(s.total_due) || 0) + (Number(s.penalty_amount) || 0) - (Number(s.paid_amount) || 0));
}

export function ScheduleStatusBadge({ status }: { status: string }) {
    return (
        <Badge
            variant="outline"
            className={cn('text-[11px] capitalize', {
                'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400': status === 'paid',
                'text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400': status === 'partial',
                'text-destructive border-destructive/40 bg-destructive/5': status === 'overdue',
                'text-muted-foreground': status === 'pending',
            })}
        >
            {status}
        </Badge>
    );
}

interface Props {
    schedules: InstallmentRow[];
    onCollect: (schedule: InstallmentRow) => void;
    /** Extra leading column content per row (e.g. days-overdue). */
    showLoanLink?: boolean;
}

/** Shared installment table used by the Index / Today / Overdue / Calendar pages. */
export default function ScheduleTable({ schedules, onCollect, showLoanLink = true }: Props) {
    if (schedules.length === 0) {
        return (
            <p className="text-sm text-muted-foreground text-center py-12">
                No installments to show.
            </p>
        );
    }

    return (
        <Table>
            <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs font-semibold">Due Date</TableHead>
                    {showLoanLink && <TableHead className="text-xs font-semibold">Loan</TableHead>}
                    <TableHead className="text-xs font-semibold">Borrower</TableHead>
                    <TableHead className="text-xs font-semibold w-16">EMI #</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Total Due</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Paid</TableHead>
                    <TableHead className="text-right text-xs font-semibold">Balance</TableHead>
                    <TableHead className="text-xs font-semibold">Status</TableHead>
                    <TableHead className="text-center text-xs font-semibold w-28">Action</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {schedules.map((s) => {
                    const balance = scheduleBalance(s);
                    return (
                        <TableRow key={s.id} className={cn(s.status === 'overdue' && 'bg-destructive/5')}>
                            <TableCell className="text-xs font-medium whitespace-nowrap">{fmtDate(s.due_date)}</TableCell>
                            {showLoanLink && (
                                <TableCell>
                                    {s.loan ? (
                                        <Link
                                            href={app.loans.show.url(s.loan.uuid)}
                                            className="text-xs font-bold text-primary hover:underline underline-offset-2"
                                        >
                                            {s.loan.loan_number ?? `#${s.loan.id}`}
                                        </Link>
                                    ) : (
                                        <span className="text-xs text-muted-foreground">—</span>
                                    )}
                                </TableCell>
                            )}
                            <TableCell className="text-xs font-medium">{borrowerLabel(s.loan)}</TableCell>
                            <TableCell className="text-xs">{s.installment_no}</TableCell>
                            <TableCell className="text-right text-xs font-bold">₹{fmt(s.total_due)}</TableCell>
                            <TableCell className="text-right text-xs text-emerald-600 font-semibold">₹{fmt(s.paid_amount)}</TableCell>
                            <TableCell className="text-right text-xs font-semibold text-destructive">₹{fmt(balance)}</TableCell>
                            <TableCell><ScheduleStatusBadge status={s.status} /></TableCell>
                            <TableCell className="text-center">
                                {balance > 0.005 ? (
                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onCollect(s)}>
                                        <HandCoins className="mr-1 size-3" /> Collect
                                    </Button>
                                ) : (
                                    <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

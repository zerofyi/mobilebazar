import React from 'react';
import { Head, Link } from '@inertiajs/react';
import app from '@/routes/app';

import { Receipt as ReceiptIcon, Printer, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

import { fmt, fmtDate } from '../LoanInstallments/Partials/ScheduleTable';

interface Props {
    repayment: {
        id: number;
        receipt_number?: string | null;
        amount: number | string;
        principal_component?: number | string | null;
        interest_component?: number | string | null;
        penalty_collected?: number | string | null;
        payment_mode?: string | null;
        txn_reference?: string | null;
        paid_at?: string | null;
        notes?: string | null;
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
        loan_schedule?: {
            installment_no?: number | null;
            due_date?: string | null;
        } | null;
        collected_by?: {
            name?: string | null;
        } | null;
        store?: {
            name?: string | null;
            address?: string | null;
            phone?: string | null;
        } | null;
    };
}

const MODE_LABELS: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    bank_transfer: 'Bank Transfer',
    card: 'Card',
    cheque: 'Cheque',
};

export default function Receipt({ repayment }: Props) {
    const borrower = repayment.loan?.borrower;
    const borrowerName = borrower?.name || borrower?.company_name || '—';
    const borrowerPhone = borrower?.phone_primary || borrower?.phone || '';
    const principal = Number(repayment.principal_component ?? 0) || 0;
    const interest = Number(repayment.interest_component ?? 0) || 0;
    const penalty = Number(repayment.penalty_collected ?? 0) || 0;

    return (
        <>
            <Head title={`Receipt ${repayment.receipt_number ?? repayment.id}`} />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4 print:p-0 print:gap-0">
                <div className="border-b border-border pb-4 print:hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                <ReceiptIcon className="size-6 text-primary" />
                                Payment Receipt
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {repayment.receipt_number ?? `#${repayment.id}`}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Link href={repayment.loan ? app.loans.show.url(repayment.loan.uuid) : app.loans.index.url()}>
                                <Button variant="outline" size="sm">
                                    <ArrowLeft className="mr-1.5 size-4" /> Back to Loan
                                </Button>
                            </Link>
                            <Button variant="default" size="sm" onClick={() => window.print()}>
                                <Printer className="mr-1.5 size-4" /> Print
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex justify-center print:justify-start">
                    <Card className="w-full max-w-md border-sidebar-border/70 dark:border-sidebar-border shadow-sm print:shadow-none print:border print:max-w-none">
                        <CardContent className="p-6 print:p-2">
                            <div className="text-center pb-4 border-b border-dashed border-border">
                                {repayment.store?.name && (
                                    <p className="text-base font-bold text-foreground">{repayment.store.name}</p>
                                )}
                                {repayment.store?.address && (
                                    <p className="text-xs text-muted-foreground mt-0.5">{repayment.store.address}</p>
                                )}
                                {repayment.store?.phone && (
                                    <p className="text-xs text-muted-foreground">Ph: {repayment.store.phone}</p>
                                )}
                                <p className="text-sm font-bold uppercase tracking-widest mt-3 text-foreground">
                                    EMI Collection Receipt
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                    Receipt No: <span className="font-bold text-foreground">{repayment.receipt_number ?? `#${repayment.id}`}</span>
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Date: <span className="font-semibold text-foreground">{fmtDate(repayment.paid_at)}</span>
                                </p>
                            </div>

                            <div className="py-4 space-y-2 text-sm">
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Loan</span>
                                    <span className="font-bold">{repayment.loan?.loan_number ?? '—'}</span>
                                </div>
                                {repayment.loan_schedule?.installment_no != null && (
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">EMI #</span>
                                        <span className="font-semibold">
                                            {repayment.loan_schedule.installment_no}
                                            {repayment.loan_schedule.due_date ? ` (due ${fmtDate(repayment.loan_schedule.due_date)})` : ''}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Received From</span>
                                    <span className="font-semibold text-right">{borrowerName}{borrowerPhone ? ` · ${borrowerPhone}` : ''}</span>
                                </div>
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Payment Mode</span>
                                    <span className="font-semibold">
                                        {repayment.payment_mode ? (MODE_LABELS[repayment.payment_mode] ?? repayment.payment_mode) : '—'}
                                    </span>
                                </div>
                                {repayment.txn_reference && (
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Reference</span>
                                        <span className="font-mono text-xs break-all text-right">{repayment.txn_reference}</span>
                                    </div>
                                )}
                                {repayment.collected_by?.name && (
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Collected By</span>
                                        <span className="font-semibold">{repayment.collected_by.name}</span>
                                    </div>
                                )}
                            </div>

                            <Separator className="border-dashed" />

                            <div className="py-4 space-y-2 text-sm">
                                {principal > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Principal</span>
                                        <span className="font-medium">₹{fmt(principal)}</span>
                                    </div>
                                )}
                                {interest > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Interest</span>
                                        <span className="font-medium">₹{fmt(interest)}</span>
                                    </div>
                                )}
                                {penalty > 0 && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Late Penalty</span>
                                        <span className="font-medium">₹{fmt(penalty)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between pt-2 border-t border-border">
                                    <span className="font-bold text-foreground">Total Received</span>
                                    <span className="text-lg font-extrabold text-emerald-600">₹{fmt(repayment.amount)}</span>
                                </div>
                            </div>

                            {repayment.notes && (
                                <>
                                    <Separator className="border-dashed" />
                                    <p className="text-xs text-muted-foreground py-3">
                                        <span className="font-semibold">Note:</span> {repayment.notes}
                                    </p>
                                </>
                            )}

                            <div className="pt-6 flex justify-between text-xs text-muted-foreground">
                                <div className="text-center">
                                    <div className="w-28 border-t border-muted-foreground/40 pt-1">Collector</div>
                                </div>
                                <div className="text-center">
                                    <div className="w-28 border-t border-muted-foreground/40 pt-1">Borrower</div>
                                </div>
                            </div>

                            <p className="text-center text-[10px] text-muted-foreground mt-6">
                                Computer generated receipt. No signature required.
                            </p>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </>
    );
}

Receipt.layout = {
    breadcrumbs: [
        { title: 'Loans', href: app.loans.index.url() },
        { title: 'Payment Receipt', href: '#' },
    ],
};

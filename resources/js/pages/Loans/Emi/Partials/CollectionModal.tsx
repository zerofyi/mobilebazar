import React, { useState, useEffect } from 'react';
import { router } from '@inertiajs/react';
import { Wallet, Calendar, AlertTriangle, CheckCircle2, Loader2, CreditCard, Banknote, QrCode, Building, Landmark } from 'lucide-react';
import app from '@/routes/app';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/** Loan schedule row as serialized by the backend (LoanSchedule + loan.borrower). */
export interface CollectionModalSchedule {
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
        loan_number?: string;
        borrower?: {
            name?: string | null;
            company_name?: string | null;
            phone_primary?: string | null;
            phone?: string | null;
        } | null;
    } | null;
}

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    schedule: CollectionModalSchedule | null;
    borrowerName?: string;
}

function fmt(n: number | string | undefined | null): string {
    if (n === undefined || n === null || n === '') return '0.00';
    const v = Number(n);
    if (isNaN(v)) return '0.00';
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_MODES = [
    { value: 'cash',   label: 'Cash',          icon: Banknote,  iconClass: 'text-emerald-600' },
    { value: 'upi',    label: 'UPI / QR',      icon: QrCode,    iconClass: 'text-blue-600' },
    { value: 'bank',   label: 'Bank Transfer', icon: Building,  iconClass: 'text-purple-600' },
    { value: 'card',   label: 'Card',          icon: CreditCard, iconClass: 'text-amber-600' },
    { value: 'neft',   label: 'NEFT',         icon: Landmark,   iconClass: 'text-sky-600' },
    { value: 'cheque', label: 'Cheque',        icon: Building,   iconClass: 'text-slate-600' },
] as const;

export default function CollectionModal({ open, onOpenChange, schedule, borrowerName }: Props) {
    // ── All hooks run unconditionally so hook order is stable even when `schedule` is null.
    const [amount, setAmount] = useState<string>('');
    const [paymentMode, setPaymentMode] = useState<string>('cash');
    const [txnReference, setTxnReference] = useState<string>('');
    const [notes, setNotes] = useState<string>('');
    const [submitting, setSubmitting] = useState<boolean>(false);

    const totalDue = schedule ? Number(schedule.total_due) || 0 : 0;
    const paidSoFar = schedule ? Number(schedule.paid_amount) || 0 : 0;
    const penalty = schedule ? Number(schedule.penalty_amount) || 0 : 0;
    const outstanding = schedule
        ? Math.max(0, Math.round((totalDue + penalty - paidSoFar) * 100) / 100)
        : 0;

    useEffect(() => {
        if (open && schedule) {
            setAmount(String(outstanding));
            setPaymentMode('cash');
            setTxnReference('');
            setNotes('');
            setSubmitting(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, schedule]);

    // Null-guard only after every hook has run.
    if (!schedule) return null;

    const resolvedBorrowerName =
        borrowerName ||
        schedule.loan?.borrower?.name ||
        schedule.loan?.borrower?.company_name ||
        'Borrower';

    const numericAmount = parseFloat(amount) || 0;
    const isExceeding = numericAmount > outstanding + 0.001;
    const newRemaining = Math.max(0, Math.round((outstanding - numericAmount) * 100) / 100);
    const isFullPayment = newRemaining === 0 && numericAmount > 0;

    const halfAmount = Math.round((outstanding / 2) * 100) / 100;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (numericAmount < 0.01 || isExceeding || submitting) return;

        setSubmitting(true);
        router.post(
            app.installments.pay.url(schedule.uuid),
            {
                amount: numericAmount,
                payment_mode: paymentMode,
                txn_reference: txnReference || null,
                notes: notes || null,
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                },
                onFinish: () => setSubmitting(false),
            }
        );
    };

    const formattedDueDate = new Date(schedule.due_date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });

    return (
        <Dialog open={open} onOpenChange={(val) => !submitting && onOpenChange(val)}>
            <DialogContent className="max-w-md p-5">
                <DialogHeader className="space-y-1">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <Wallet className="size-5 text-primary shrink-0" />
                        Collect Installment
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Record borrower repayment for <strong className="text-foreground font-semibold">{resolvedBorrowerName}</strong>
                        {schedule.loan?.loan_number && <> (Loan: <strong className="text-foreground">{schedule.loan.loan_number}</strong>, EMI #{schedule.installment_no})</>}.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                    {/* Schedule summary */}
                    <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground flex items-center gap-1.5">
                                <Calendar className="size-3.5 text-muted-foreground/70" /> Due Date
                            </span>
                            <span className="font-semibold text-foreground">
                                {formattedDueDate}
                            </span>
                        </div>

                        <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Installment Total</span>
                            <span className="font-semibold text-foreground">
                                ₹{fmt(totalDue)}
                            </span>
                        </div>

                        {penalty > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Penalty</span>
                                <span className="font-semibold text-destructive">
                                    ₹{fmt(penalty)}
                                </span>
                            </div>
                        )}

                        {paidSoFar > 0 && (
                            <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Previously Paid</span>
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                    ₹{fmt(paidSoFar)}
                                </span>
                            </div>
                        )}

                        <div className="flex justify-between items-center pt-2 border-t border-border/60">
                            <span className="font-bold text-foreground">Current Due Balance</span>
                            <Badge variant="outline" className="font-bold text-destructive bg-destructive/10 border-destructive/30 text-xs">
                                ₹{fmt(outstanding)}
                            </Badge>
                        </div>
                    </div>

                    {/* Amount input & preset chips */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center flex-wrap gap-1">
                            <Label htmlFor="collect_amount" className="text-xs font-semibold">
                                Payment Amount (₹) <span className="text-destructive">*</span>
                            </Label>

                            <div className="flex items-center gap-1 flex-wrap">
                                <button
                                    type="button"
                                    onClick={() => setAmount(String(outstanding))}
                                    className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                >
                                    Full (₹{fmt(outstanding)})
                                </button>

                                {outstanding > 500 && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount(String(halfAmount))}
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                                    >
                                        Half (₹{fmt(halfAmount)})
                                    </button>
                                )}

                                {outstanding >= 500 && halfAmount !== 500 && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount("500")}
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                                    >
                                        ₹500
                                    </button>
                                )}

                                {outstanding >= 1000 && halfAmount !== 1000 && (
                                    <button
                                        type="button"
                                        onClick={() => setAmount("1000")}
                                        className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground transition-colors"
                                    >
                                        ₹1,000
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="relative">
                            <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                            <Input
                                id="collect_amount"
                                type="number"
                                step="any"
                                className={cn("pl-7 h-9 text-xs font-mono font-semibold", isExceeding && "border-destructive focus-visible:ring-destructive")}
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                disabled={submitting}
                                autoFocus
                            />
                        </div>

                        {isExceeding ? (
                            <p className="text-xs font-medium text-destructive flex items-center gap-1">
                                <AlertTriangle className="size-3.5 shrink-0" />
                                Amount cannot exceed current due (₹{fmt(outstanding)}).
                            </p>
                        ) : numericAmount > 0 ? (
                            <div className="flex items-center justify-between text-[11px] px-1 pt-0.5">
                                <span className="text-muted-foreground">
                                    Remaining after collection: <strong className="text-foreground">₹{fmt(newRemaining)}</strong>
                                </span>
                                {isFullPayment ? (
                                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                                        <CheckCircle2 className="size-3" /> Fully Settled
                                    </span>
                                ) : (
                                    <span className="text-amber-600 font-medium">Partial Payment</span>
                                )}
                            </div>
                        ) : null}
                    </div>

                    {/* Payment mode & reference */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Payment Mode</Label>
                            <Select value={paymentMode} onValueChange={setPaymentMode} disabled={submitting}>
                                <SelectTrigger className="h-9 text-xs w-full bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_MODES.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>
                                            <span className="flex items-center gap-1.5">
                                                <m.icon className={cn('size-3.5', m.iconClass)} /> {m.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="txn_reference" className="text-xs font-semibold">
                                Txn / Ref ID {paymentMode !== 'cash' && <span className="text-primary">*</span>}
                            </Label>
                            <Input
                                id="txn_reference"
                                className="h-9 text-xs font-mono bg-background"
                                placeholder={paymentMode === 'cash' ? "Optional" : "UPI/Bank ref #"}
                                value={txnReference}
                                onChange={(e) => setTxnReference(e.target.value)}
                                disabled={submitting}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label htmlFor="collect_notes" className="text-xs font-semibold">
                            Collection Notes <span className="text-muted-foreground font-normal text-[10px]">(Optional)</span>
                        </Label>
                        <Input
                            id="collect_notes"
                            className="h-9 text-xs bg-background"
                            placeholder="e.g. Paid in cash at counter"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            disabled={submitting}
                        />
                    </div>

                    <DialogFooter className="pt-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
                            Cancel
                        </Button>
                        <Button type="submit" size="sm" className="font-bold min-w-28" disabled={submitting || numericAmount < 0.01 || isExceeding}>
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 size-3.5 animate-spin" /> Recording…
                                </>
                            ) : (
                                `Collect ₹${numericAmount > 0 ? fmt(numericAmount) : '0.00'}`
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

import React, { useState, useMemo } from 'react';
import { Head, Link, router, useForm } from '@inertiajs/react';
import app from '@/routes/app';

import {
    ReceiptText, ArrowLeft, Printer, Upload, FileText, AlertTriangle,
    CheckCircle2, Clock, Wallet, Banknote, TrendingUp, User, Landmark,
    Phone, CreditCard, Users, CalendarClock, Eye, Loader2, ChevronDown,
    HandCoins, Scale, MapPin, ShieldCheck, ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';
import CollectionModal, { type CollectionModalSchedule } from './Emi/Partials/CollectionModal';

// ─── Types (mirror the backend contract) ─────────────────────────────────────

interface Borrower {
    id: number;
    name?: string | null;
    company_name?: string | null;
    care_of?: string | null;
    phone_primary?: string | null;
    phone_secondary?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    aadhaar_number?: string | null;
    pan_number?: string | null;
    voter_number?: string | null;
}

interface ScheduleRow {
    id: number;
    uuid: string;
    installment_no: number;
    due_date: string;
    principal_amount: number | string;
    interest_amount: number | string;
    total_due: number | string;
    paid_amount: number | string;
    penalty_amount?: number | string | null;
    status: string;
    paid_date?: string | null;
}

interface RepaymentRow {
    id: number;
    uuid: string;
    receipt_number: string;
    loan_schedule_id?: number | null;
    amount: number | string;
    principal_component?: number | string | null;
    interest_component?: number | string | null;
    penalty_collected?: number | string | null;
    payment_mode: string;
    txn_reference?: string | null;
    paid_at: string;
    notes?: string | null;
    collected_by?: { name?: string | null } | null;
}

interface Guarantor {
    id: number;
    name: string;
    relation?: string | null;
    phone: string;
    aadhaar_number?: string | null;
    pan_number?: string | null;
}

interface Agreement {
    id: number;
    agreement_number: string;
    template_name?: string | null;
    terms_and_conditions?: string | null;
    signed_document_path?: string | null;
    signed_at?: string | null;
}

interface CollectionVisit {
    id: number;
    uuid?: string | null;
    outcome: string;
    visited_at?: string | null;
    amount_collected?: number | string | null;
    notes?: string | null;
    agent?: { name?: string | null } | null;
}

interface KycAsset {
    path?: string | null;
    original_name?: string | null;
    mime_type?: string | null;
}

interface KycDocument {
    id: number;
    uuid?: string | null;
    document_type: string;
    document_number?: string | null;
    is_verified?: boolean | null;
    verified_at?: string | null;
    created_at?: string | null;
    asset?: KycAsset | null;
}

interface Loan {
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
    emi_frequency?: string | null;
    collection_slab: string;
    status: 'active' | 'closed' | 'defaulted';
    disbursed_date: string;
    first_emi_date?: string | null;
    closed_date?: string | null;
    settled_at?: string | null;
    defaulted_at?: string | null;
    outstanding_balance_at_default?: number | string | null;
    notes?: string | null;
    borrower: Borrower | null;
    invoice?: { id: number; invoice_number: string; grand_total?: number | string; due_amount?: number | string } | null;
    financer?: { name: string } | null;
    assigned_agent?: { name: string } | null;
    schedules: ScheduleRow[];
    repayments: RepaymentRow[];
    guarantors: Guarantor[];
    agreement?: Agreement | null;
    collection_visits?: CollectionVisit[] | null;
    kyc_documents?: KycDocument[] | null;
}

interface Props {
    loan: Loan;
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

function fmtDateTime(iso: string | undefined | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function borrowerName(b: Borrower | null): string {
    if (!b) return '—';
    return b.name || b.company_name || '—';
}

function borrowerPhone(b: Borrower | null): string {
    if (!b) return '';
    return b.phone_primary || b.phone || '';
}

function isSupplier(b: Borrower | null): boolean {
    return !!b && (!!b.company_name || (!!b.phone && !b.phone_primary && !b.care_of));
}

/** Whole days from today to the due date (negative = overdue). */
function daysUntilDue(iso: string): number {
    const due = new Date(iso);
    due.setHours(0, 0, 0, 0);
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return Math.round((due.getTime() - t.getTime()) / 86400000);
}

function isOverdueRow(s: ScheduleRow): boolean {
    return s.status !== 'paid' && daysUntilDue(s.due_date) < 0;
}

function DueBadge({ schedule }: { schedule: ScheduleRow }) {
    if (schedule.status === 'paid') {
        return <Badge variant="outline" className="text-emerald-700 border-emerald-400/40 bg-emerald-50 text-[11px]">Paid</Badge>;
    }
    const d = daysUntilDue(schedule.due_date);
    if (d < 0) {
        return <Badge variant="destructive" className="text-[11px]">Overdue {Math.abs(d)}d</Badge>;
    }
    if (d === 0) return <Badge variant="destructive" className="text-[11px]">Due today</Badge>;
    const cls =
        d <= 3 ? 'text-destructive border-destructive/40 bg-destructive/5' :
        d <= 7 ? 'text-amber-700 border-amber-400/40 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30' :
        d <= 15 ? 'text-yellow-700 border-yellow-400/40 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/30' :
        'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30';
    return <Badge variant="outline" className={cn('text-[11px]', cls)}>{d}d left</Badge>;
}

function StatusBadge({ loan }: { loan: Loan }) {
    const isSettled = loan.status === 'closed' && !!loan.settled_at;
    const isClosed = loan.status === 'closed' && !isSettled;
    return (
        <Badge
            variant="outline"
            className={cn('gap-1 font-medium text-xs', {
                'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400': loan.status === 'active',
                'text-blue-700 border-blue-400/40 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400': isSettled,
                'text-purple-700 border-purple-400/40 bg-purple-50 dark:bg-purple-950/30 dark:text-purple-400': isClosed,
                'text-destructive border-destructive/40 bg-destructive/5': loan.status === 'defaulted',
            })}
        >
            {loan.status === 'active' && <Clock className="size-3" />}
            {(isSettled || isClosed) && <CheckCircle2 className="size-3" />}
            {loan.status === 'defaulted' && <AlertTriangle className="size-3" />}
            {isSettled ? 'Settled' : isClosed ? 'Closed' : loan.status === 'active' ? 'Active' : 'Defaulted'}
        </Badge>
    );
}

const PAYMENT_MODES = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'bank', label: 'Bank Transfer' },
    { value: 'card', label: 'Card' },
    { value: 'neft', label: 'NEFT' },
    { value: 'cheque', label: 'Cheque' },
] as const;

const VISIT_OUTCOMES = [
    { value: 'promised_to_pay', label: 'Promised to pay' },
    { value: 'paid_partially', label: 'Paid partially' },
    { value: 'not_available', label: 'Not available' },
    { value: 'refused', label: 'Refused' },
    { value: 'address_changed', label: 'Address changed' },
    { value: 'other', label: 'Other' },
] as const;

const KYC_TYPES = [
    { value: 'aadhaar', label: 'Aadhaar' },
    { value: 'pan', label: 'PAN' },
    { value: 'voter_id', label: 'Voter ID' },
    { value: 'driving_licence', label: 'Driving Licence' },
    { value: 'photo', label: 'Photo' },
    { value: 'other', label: 'Other' },
] as const;

function visitOutcomeLabel(outcome: string): string {
    return VISIT_OUTCOMES.find((o) => o.value === outcome)?.label ?? outcome;
}

function kycTypeLabel(documentType: string): string {
    return KYC_TYPES.find((t) => t.value === documentType)?.label ?? documentType;
}

function visitOutcomeBadgeClass(outcome: string): string {
    if (outcome === 'promised_to_pay') return 'text-blue-700 border-blue-400/40 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/30';
    if (outcome === 'paid_partially') return 'text-amber-700 border-amber-400/40 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/30';
    if (outcome === 'refused') return 'text-destructive border-destructive/40 bg-destructive/5';
    return 'text-slate-600 border-slate-400/40 bg-slate-50 dark:text-slate-400 dark:bg-slate-950/30';
}

/** Today's date as YYYY-MM-DD for native date inputs. */
function todayISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function Show({ loan }: Props) {
    const [collectSchedule, setCollectSchedule] = useState<CollectionModalSchedule | null>(null);
    const [settleOpen, setSettleOpen] = useState(false);
    const [defaultOpen, setDefaultOpen] = useState(false);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false);
    const [dossierOpen, setDossierOpen] = useState(false);
    const [visitOpen, setVisitOpen] = useState(false);
    const [kycOpen, setKycOpen] = useState(false);

    const settleForm = useForm({ payment_mode: 'cash', notes: '' });
    const termsForm = useForm({ terms_and_conditions: loan.agreement?.terms_and_conditions ?? '' });
    const uploadForm = useForm<{ signed_document: File | null }>({ signed_document: null });
    const visitForm = useForm({ outcome: 'promised_to_pay', visited_at: todayISO(), amount_collected: '', notes: '' });
    const kycForm = useForm<{ document_type: string; document_number: string; document: File | null }>({
        document_type: 'aadhaar',
        document_number: '',
        document: null,
    });

    const overdueSchedules = useMemo(() => loan.schedules.filter(isOverdueRow), [loan.schedules]);
    const overdueAmount = useMemo(
        () => overdueSchedules.reduce((s, r) => s + (Number(r.total_due) || 0) + (Number(r.penalty_amount) || 0) - (Number(r.paid_amount) || 0), 0),
        [overdueSchedules]
    );
    const nextDue = useMemo(
        () => loan.schedules.filter((s) => s.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0] ?? null,
        [loan.schedules]
    );

    const canCollect = loan.status === 'active' || loan.status === 'defaulted';

    const handleSettle = (e: React.FormEvent) => {
        e.preventDefault();
        settleForm.post(app.loans.settle.url(loan.uuid), {
            onSuccess: () => setSettleOpen(false),
        });
    };

    const handleMarkDefault = () => {
        router.post(app.loans['mark-default'].url(loan.uuid), {}, {
            onSuccess: () => setDefaultOpen(false),
        });
    };

    const handleUpload = (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadForm.data.signed_document) return;
        uploadForm.post(app.loans.agreement.upload.url(loan.uuid), {
            forceFormData: true,
            onSuccess: () => setUploadOpen(false),
        });
    };

    const handleTerms = (e: React.FormEvent) => {
        e.preventDefault();
        termsForm.post(app.loans.agreement.url(loan.uuid), {
            onSuccess: () => setTermsOpen(false),
        });
    };

    const handleVisit = (e: React.FormEvent) => {
        e.preventDefault();
        visitForm.post(app.loans.visits.store.url(loan.uuid), {
            onSuccess: () => {
                setVisitOpen(false);
                visitForm.reset();
            },
        });
    };

    const handleKyc = (e: React.FormEvent) => {
        e.preventDefault();
        if (!kycForm.data.document) return;
        kycForm.post(app.loans.kyc.upload.url(loan.uuid), {
            forceFormData: true,
            onSuccess: () => {
                setKycOpen(false);
                kycForm.reset();
            },
        });
    };

    const openCollect = (s: ScheduleRow) => {
        setCollectSchedule({
            id: s.id,
            uuid: s.uuid,
            installment_no: s.installment_no,
            due_date: s.due_date,
            total_due: s.total_due,
            paid_amount: s.paid_amount,
            penalty_amount: s.penalty_amount,
            status: s.status,
            loan: { id: loan.id, loan_number: loan.loan_number, borrower: loan.borrower ?? undefined },
        });
    };

    const supplier = isSupplier(loan.borrower);

    return (
        <>
            <Head title={`Loan ${loan.loan_number}`} />

            {/* Print stylesheet: only the agreement prints */}
            <style>{`
                @media print {
                    body * { visibility: hidden; }
                    #agreement-print, #agreement-print * { visibility: visible; }
                    #agreement-print { position: absolute; inset: 0; padding: 32px; }
                }
            `}</style>

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4 print:hidden">

                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
                    <div className="flex items-start gap-3">
                        <Button variant="ghost" size="icon" asChild className="mt-1">
                            <Link href={app.loans.index.url()}><ArrowLeft className="size-4" /></Link>
                        </Button>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 flex-wrap">
                                <ReceiptText className="size-6 text-primary" />
                                {loan.loan_number}
                                <StatusBadge loan={loan} />
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                                {supplier ? <Landmark className="size-3.5" /> : <User className="size-3.5" />}
                                {borrowerName(loan.borrower)}
                                {borrowerPhone(loan.borrower) && <> · {borrowerPhone(loan.borrower)}</>}
                                <span className="mx-1">·</span> Disbursed {fmtDate(loan.disbursed_date)}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => window.print()}>
                            <Printer className="mr-1.5 size-3.5" /> Print Agreement
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
                            <Upload className="mr-1.5 size-3.5" /> Upload Signed Copy
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setTermsOpen(true)}>
                            <FileText className="mr-1.5 size-3.5" /> Update Terms
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setKycOpen(true)}>
                            <ShieldCheck className="mr-1.5 size-3.5" /> Upload KYC
                        </Button>
                        {canCollect && (
                            <Button variant="outline" size="sm" onClick={() => { visitForm.setData('visited_at', todayISO()); setVisitOpen(true); }}>
                                <MapPin className="mr-1.5 size-3.5" /> Log Visit
                            </Button>
                        )}
                        {loan.status === 'active' && (
                            <>
                                <Button variant="default" size="sm" onClick={() => setSettleOpen(true)}>
                                    <HandCoins className="mr-1.5 size-3.5" /> Settle Loan
                                </Button>
                                <Button variant="destructive" size="sm" onClick={() => setDefaultOpen(true)}>
                                    <Scale className="mr-1.5 size-3.5" /> Mark Default
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                {/* Overdue banner */}
                {overdueSchedules.length > 0 && loan.status !== 'closed' && (
                    <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                        <AlertTriangle className="size-5 shrink-0 text-destructive" />
                        <div className="flex-1">
                            <p className="text-sm font-semibold text-destructive">
                                {overdueSchedules.length} overdue installment{overdueSchedules.length > 1 ? 's' : ''}
                                {' '}· ₹{fmt(overdueAmount)} outstanding
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Oldest overdue: {fmtDate(overdueSchedules.sort((a, b) => a.due_date.localeCompare(b.due_date))[0].due_date)}
                            </p>
                        </div>
                        {nextDue && canCollect && (
                            <Button size="sm" variant="destructive" onClick={() => openCollect(nextDue)}>
                                Collect Oldest Due
                            </Button>
                        )}
                    </div>
                )}

                {/* Defaulted banner */}
                {loan.status === 'defaulted' && (
                    <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
                        <Scale className="size-5 shrink-0 text-destructive" />
                        <p className="text-sm text-muted-foreground">
                            Marked defaulted on <strong className="text-foreground">{fmtDateTime(loan.defaulted_at)}</strong>
                            {loan.outstanding_balance_at_default != null && (
                                <> · outstanding at default: <strong className="text-foreground">₹{fmt(loan.outstanding_balance_at_default)}</strong></>
                            )}.
                            Collections are still allowed on this loan.
                        </p>
                    </div>
                )}

                {/* Stat cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="Total Payable"
                        value={<>₹<FormatAmount amount={Number(loan.total_payable) || 0} /></>}
                        icon={Wallet}
                        subtitle={`Principal ₹${fmt(loan.principal_amount)} + Interest ₹${fmt(loan.total_interest)}`}
                    />
                    <StatCard
                        title="Paid"
                        value={<>₹<FormatAmount amount={Number(loan.paid_amount) || 0} /></>}
                        icon={Banknote}
                        subtitle={`${loan.repayments.length} repayment${loan.repayments.length === 1 ? '' : 's'}`}
                        variant="success"
                    />
                    <StatCard
                        title="Balance Outstanding"
                        value={<>₹<FormatAmount amount={Number(loan.balance_amount) || 0} /></>}
                        icon={TrendingUp}
                        subtitle={nextDue ? `Next due ${fmtDate(nextDue.due_date)}` : 'Nothing due'}
                        variant={Number(loan.balance_amount) > 0 ? 'warning' : 'default'}
                    />
                    <StatCard
                        title="Overdue"
                        value={overdueSchedules.length}
                        icon={AlertTriangle}
                        subtitle={overdueSchedules.length > 0 ? `₹${fmt(overdueAmount)} overdue` : 'All clear'}
                        variant={overdueSchedules.length > 0 ? 'destructive' : 'default'}
                    />
                </div>

                {/* Schedules */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-base flex items-center gap-2">
                            <CalendarClock className="size-4 text-primary" />
                            Installment Schedule
                        </CardTitle>
                        <CardDescription>
                            EMI ₹{fmt(loan.emi_amount)} × {loan.tenure_months} · Slab {loan.collection_slab} · First EMI {fmtDate(loan.first_emi_date)}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="text-xs font-semibold w-14">#</TableHead>
                                    <TableHead className="text-xs font-semibold">Due Date</TableHead>
                                    <TableHead className="text-right text-xs font-semibold">Principal</TableHead>
                                    <TableHead className="text-right text-xs font-semibold">Interest</TableHead>
                                    <TableHead className="text-right text-xs font-semibold">Total Due</TableHead>
                                    <TableHead className="text-right text-xs font-semibold">Paid</TableHead>
                                    <TableHead className="text-xs font-semibold">Status</TableHead>
                                    <TableHead className="text-center text-xs font-semibold w-28">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loan.schedules.map((s) => {
                                    const outstanding = Math.max(0, (Number(s.total_due) || 0) + (Number(s.penalty_amount) || 0) - (Number(s.paid_amount) || 0));
                                    return (
                                        <TableRow key={s.id} className={cn(isOverdueRow(s) && 'bg-destructive/5')}>
                                            <TableCell className="font-semibold text-sm">{s.installment_no}</TableCell>
                                            <TableCell>
                                                <div className="font-medium text-sm">{fmtDate(s.due_date)}</div>
                                                <div className="mt-1"><DueBadge schedule={s} /></div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">₹{fmt(s.principal_amount)}</TableCell>
                                            <TableCell className="text-right text-xs">₹{fmt(s.interest_amount)}</TableCell>
                                            <TableCell className="text-right text-sm font-bold">₹{fmt(s.total_due)}</TableCell>
                                            <TableCell className="text-right text-xs text-emerald-600 font-semibold">₹{fmt(s.paid_amount)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn('text-[11px] capitalize', {
                                                    'text-emerald-700 border-emerald-400/40 bg-emerald-50': s.status === 'paid',
                                                    'text-amber-700 border-amber-400/40 bg-amber-50': s.status === 'partial',
                                                    'text-destructive border-destructive/40 bg-destructive/5': s.status === 'overdue',
                                                })}>
                                                    {s.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {canCollect && outstanding > 0.005 ? (
                                                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openCollect(s)}>
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
                    </CardContent>
                </Card>

                {/* Repayments */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Banknote className="size-4 text-primary" />
                            Repayment History
                        </CardTitle>
                        <CardDescription>{loan.repayments.length} recorded repayment{loan.repayments.length === 1 ? '' : 's'}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto">
                        {loan.repayments.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">No repayments recorded yet.</p>
                        ) : (
                            <Table>
                                <TableHeader className="bg-muted/30">
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="text-xs font-semibold">Paid At</TableHead>
                                        <TableHead className="text-xs font-semibold">Receipt</TableHead>
                                        <TableHead className="text-right text-xs font-semibold">Amount</TableHead>
                                        <TableHead className="text-xs font-semibold">Mode</TableHead>
                                        <TableHead className="text-xs font-semibold">Collected By</TableHead>
                                        <TableHead className="text-xs font-semibold">Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loan.repayments.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell className="text-xs whitespace-nowrap">{fmtDateTime(r.paid_at)}</TableCell>
                                            <TableCell>
                                                <Link
                                                    href={app.installments.receipt.url(r.uuid)}
                                                    className="text-xs font-mono font-semibold text-primary hover:underline underline-offset-2"
                                                >
                                                    {r.receipt_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-right text-sm font-bold">₹{fmt(r.amount)}</TableCell>
                                            <TableCell><Badge variant="secondary" className="text-[11px] uppercase">{r.payment_mode}</Badge></TableCell>
                                            <TableCell className="text-xs">{r.collected_by?.name ?? '—'}</TableCell>
                                            <TableCell className="text-xs text-muted-foreground max-w-48 truncate">{r.notes ?? '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>

                {/* Collection visits */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="size-4 text-primary" />
                                Collection Visits
                            </CardTitle>
                            <CardDescription>{(loan.collection_visits ?? []).length} logged visit{(loan.collection_visits ?? []).length === 1 ? '' : 's'}</CardDescription>
                        </div>
                        {canCollect && (
                            <Button variant="outline" size="sm" onClick={() => { visitForm.setData('visited_at', todayISO()); setVisitOpen(true); }}>
                                <MapPin className="mr-1.5 size-3.5" /> Log Visit
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto">
                        {(loan.collection_visits ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">No collection visits logged yet.</p>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {(loan.collection_visits ?? []).map((v) => (
                                    <div key={v.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                                        <div className="min-w-28">
                                            <p className="text-sm font-semibold">{fmtDate(v.visited_at)}</p>
                                            {v.agent?.name && (
                                                <p className="text-[11px] text-muted-foreground">{v.agent.name}</p>
                                            )}
                                        </div>
                                        <Badge variant="outline" className={cn('text-[11px] capitalize', visitOutcomeBadgeClass(v.outcome))}>
                                            {visitOutcomeLabel(v.outcome)}
                                        </Badge>
                                        {Number(v.amount_collected) > 0 && (
                                            <span className="text-sm font-bold text-emerald-600">₹{fmt(v.amount_collected)}</span>
                                        )}
                                        {v.notes && (
                                            <p className="text-xs text-muted-foreground w-full">{v.notes}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* KYC documents */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <ShieldCheck className="size-4 text-primary" />
                                KYC Documents
                            </CardTitle>
                            <CardDescription>{(loan.kyc_documents ?? []).length} document{(loan.kyc_documents ?? []).length === 1 ? '' : 's'} on file</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setKycOpen(true)}>
                            <Upload className="mr-1.5 size-3.5" /> Upload KYC
                        </Button>
                    </CardHeader>
                    <CardContent className="p-0 overflow-auto">
                        {(loan.kyc_documents ?? []).length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">No KYC documents uploaded yet.</p>
                        ) : (
                            <div className="divide-y divide-border/50">
                                {(loan.kyc_documents ?? []).map((d) => (
                                    <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                                        <div className="min-w-32">
                                            <p className="text-sm font-semibold">{kycTypeLabel(d.document_type)}</p>
                                            {d.document_number && (
                                                <p className="text-[11px] text-muted-foreground font-mono">{d.document_number}</p>
                                            )}
                                        </div>
                                        <Badge
                                            variant="outline"
                                            className={cn('text-[11px]', d.is_verified
                                                ? 'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/30'
                                                : 'text-slate-600 border-slate-400/40 bg-slate-50 dark:text-slate-400 dark:bg-slate-950/30')}
                                        >
                                            {d.is_verified ? 'Verified' : 'Pending'}
                                        </Badge>
                                        <span className="text-[11px] text-muted-foreground">Uploaded {fmtDate(d.created_at)}</span>
                                        <span className="flex-1" />
                                        {d.asset?.path && (
                                            <a
                                                href={`/storage/${d.asset.path}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline underline-offset-2"
                                            >
                                                <ExternalLink className="size-3" /> View
                                            </a>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Dossier */}
                <Collapsible open={dossierOpen} onOpenChange={setDossierOpen}>
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm overflow-hidden">
                        <CollapsibleTrigger asChild>
                            <button type="button" className="w-full">
                                <CardHeader className="pb-3 flex flex-row items-center justify-between hover:bg-muted/30 transition-colors">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Eye className="size-4 text-primary" />
                                        Loan Dossier
                                    </CardTitle>
                                    <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', dossierOpen && 'rotate-180')} />
                                </CardHeader>
                            </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <CardContent className="pt-4 space-y-6 relative">
                                <div className="pointer-events-none absolute inset-x-0 top-0 h-6 bg-gradient-to-b from-background to-transparent" />

                                {/* Borrower */}
                                <section className="space-y-3">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        {supplier ? <Landmark className="size-4 text-primary" /> : <User className="size-4 text-primary" />}
                                        Borrower {supplier ? '(Supplier)' : '(Customer)'}
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                        {[
                                            { label: 'Name', value: borrowerName(loan.borrower) },
                                            { label: 'Phone', value: borrowerPhone(loan.borrower) || '—' },
                                            ...(supplier
                                                ? [
                                                    { label: 'Company', value: loan.borrower?.company_name ?? '—' },
                                                    { label: 'GSTIN', value: loan.borrower?.gstin ?? '—' },
                                                    { label: 'Email', value: loan.borrower?.email ?? '—' },
                                                ]
                                                : [
                                                    { label: 'Care Of', value: loan.borrower?.care_of ?? '—' },
                                                    { label: 'Aadhaar', value: loan.borrower?.aadhaar_number ?? '—' },
                                                    { label: 'PAN', value: loan.borrower?.pan_number ?? '—' },
                                                    { label: 'Voter ID', value: loan.borrower?.voter_number ?? '—' },
                                                    { label: 'Alt Phone', value: loan.borrower?.phone_secondary ?? '—' },
                                                ]),
                                        ].map(({ label, value }) => (
                                            <div key={label} className="rounded-lg border border-border/60 p-2.5">
                                                <p className="text-muted-foreground text-[10px] uppercase font-medium">{label}</p>
                                                <p className="font-semibold mt-0.5 break-words">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                </section>

                                <Separator />

                                {/* Invoice & financial */}
                                <section className="space-y-3">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <Wallet className="size-4 text-primary" /> Invoice & Financial Terms
                                    </h4>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                                        {[
                                            { label: 'Invoice', value: loan.invoice?.invoice_number ?? `#${loan.invoice?.id ?? '—'}` },
                                            { label: 'Principal', value: `₹${fmt(loan.principal_amount)}` },
                                            { label: 'Down Payment', value: `₹${fmt(loan.down_payment)}` },
                                            { label: 'Interest Rate', value: `${fmt(loan.interest_rate)}% / month` },
                                            { label: 'Total Interest', value: `₹${fmt(loan.total_interest)}` },
                                            { label: `File Charge (${loan.file_charge_mode})`, value: `₹${fmt(loan.processing_fee)}` },
                                            { label: 'Total Payable', value: `₹${fmt(loan.total_payable)}` },
                                            { label: 'Tenure', value: `${loan.tenure_months} months` },
                                            { label: 'Financer', value: loan.financer?.name ?? 'Self-financed' },
                                            { label: 'Collection Agent', value: loan.assigned_agent?.name ?? '—' },
                                            { label: 'Closed Date', value: fmtDate(loan.closed_date) },
                                            { label: 'Settled At', value: fmtDateTime(loan.settled_at) },
                                        ].map(({ label, value }) => (
                                            <div key={label} className="rounded-lg border border-border/60 p-2.5">
                                                <p className="text-muted-foreground text-[10px] uppercase font-medium">{label}</p>
                                                <p className="font-semibold mt-0.5 break-words">{value}</p>
                                            </div>
                                        ))}
                                    </div>
                                    {loan.notes && (
                                        <p className="text-xs text-muted-foreground"><strong className="text-foreground">Notes:</strong> {loan.notes}</p>
                                    )}
                                </section>

                                <Separator />

                                {/* Guarantors */}
                                <section className="space-y-3">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <Users className="size-4 text-primary" /> Guarantors ({loan.guarantors.length})
                                    </h4>
                                    {loan.guarantors.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No guarantors on this loan.</p>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                            {loan.guarantors.map((g) => (
                                                <div key={g.id} className="rounded-lg border border-border/60 p-3 text-xs space-y-1">
                                                    <p className="font-semibold text-sm">{g.name}</p>
                                                    <p className="text-muted-foreground flex items-center gap-1"><Phone className="size-3" />{g.phone}</p>
                                                    {g.relation && <p className="text-muted-foreground">Relation: {g.relation}</p>}
                                                    {g.aadhaar_number && <p className="text-muted-foreground flex items-center gap-1"><CreditCard className="size-3" />{g.aadhaar_number}</p>}
                                                    {g.pan_number && <p className="text-muted-foreground">PAN: {g.pan_number}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <Separator />

                                {/* Agreement */}
                                <section className="space-y-3">
                                    <h4 className="text-sm font-semibold flex items-center gap-2">
                                        <FileText className="size-4 text-primary" /> Agreement
                                    </h4>
                                    {loan.agreement ? (
                                        <div className="rounded-lg border border-border/60 p-3 text-xs space-y-2">
                                            <div className="flex flex-wrap gap-x-6 gap-y-1">
                                                <span><strong>Number:</strong> <span className="font-mono">{loan.agreement.agreement_number}</span></span>
                                                <span><strong>Signed:</strong> {loan.agreement.signed_at ? fmtDateTime(loan.agreement.signed_at) : 'Not yet signed'}</span>
                                                {loan.agreement.signed_document_path && (
                                                    <span className="text-emerald-600 font-semibold flex items-center gap-1">
                                                        <CheckCircle2 className="size-3.5" /> Signed copy uploaded
                                                    </span>
                                                )}
                                            </div>
                                            {loan.agreement.terms_and_conditions && (
                                                <p className="text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto rounded bg-muted/30 p-2.5">
                                                    {loan.agreement.terms_and_conditions}
                                                </p>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">No agreement generated yet.</p>
                                    )}
                                </section>
                            </CardContent>
                        </CollapsibleContent>
                    </Card>
                </Collapsible>
            </div>

            {/* Print-only agreement */}
            <div id="agreement-print" className="hidden print:block">
                <h1 className="text-xl font-bold mb-1">Device Financing Agreement</h1>
                <p className="text-sm mb-4">
                    Agreement No: <strong>{loan.agreement?.agreement_number ?? '—'}</strong>
                    {' '}· Loan No: <strong>{loan.loan_number}</strong>
                </p>
                <div className="text-sm space-y-1 mb-4">
                    <p><strong>Borrower:</strong> {borrowerName(loan.borrower)} ({borrowerPhone(loan.borrower)})</p>
                    <p><strong>Principal:</strong> ₹{fmt(loan.principal_amount)} · <strong>Total Payable:</strong> ₹{fmt(loan.total_payable)}</p>
                    <p><strong>Tenure:</strong> {loan.tenure_months} months · <strong>EMI:</strong> ₹{fmt(loan.emi_amount)}</p>
                    <p><strong>Interest:</strong> {fmt(loan.interest_rate)}% per month (flat) · <strong>Disbursed:</strong> {fmtDate(loan.disbursed_date)}</p>
                </div>
                <div className="text-sm whitespace-pre-wrap border-t pt-4">
                    {loan.agreement?.terms_and_conditions ?? 'Terms and conditions not yet recorded.'}
                </div>
                <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
                    <div><div className="border-t border-black pt-1 mt-16">Borrower Signature</div></div>
                    <div><div className="border-t border-black pt-1 mt-16">Authorised Signatory</div></div>
                </div>
            </div>

            {/* Collection modal */}
            <CollectionModal
                open={!!collectSchedule}
                onOpenChange={(v) => !v && setCollectSchedule(null)}
                schedule={collectSchedule}
            />

            {/* Settle dialog */}
            <Dialog open={settleOpen} onOpenChange={setSettleOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <HandCoins className="size-5 text-primary" /> Settle Loan Early
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Settle the full outstanding balance of <strong>₹{fmt(loan.balance_amount)}</strong> on loan{' '}
                            <strong>{loan.loan_number}</strong>. This closes the loan and records a settlement receipt.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSettle} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Payment Mode <span className="text-destructive">*</span></Label>
                            <Select value={settleForm.data.payment_mode} onValueChange={(v) => settleForm.setData('payment_mode', v)}>
                                <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {PAYMENT_MODES.map((m) => (
                                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {settleForm.errors.payment_mode && <p className="text-xs text-destructive">{settleForm.errors.payment_mode}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                            <Textarea rows={3} className="text-xs" placeholder="Settlement notes…"
                                value={settleForm.data.notes} onChange={(e) => settleForm.setData('notes', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setSettleOpen(false)}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={settleForm.processing}>
                                {settleForm.processing ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Settling…</> : `Settle ₹${fmt(loan.balance_amount)}`}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Mark default dialog */}
            <Dialog open={defaultOpen} onOpenChange={setDefaultOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="size-5" /> Mark Loan as Defaulted
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            This snapshots the current outstanding balance (₹{fmt(loan.balance_amount)}) and marks{' '}
                            <strong>{loan.loan_number}</strong> as defaulted. Collections remain allowed afterwards.
                            This cannot be undone from here.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setDefaultOpen(false)}>Cancel</Button>
                        <Button variant="destructive" size="sm" onClick={handleMarkDefault}>
                            Mark Defaulted
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Upload signed copy dialog */}
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Upload className="size-5 text-primary" /> Upload Signed Agreement
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            PDF, JPG or PNG up to 10 MB. Uploading marks the agreement as signed.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpload} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Signed Document <span className="text-destructive">*</span></Label>
                            <Input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="h-9 text-xs"
                                onChange={(e) => uploadForm.setData('signed_document', e.target.files?.[0] ?? null)}
                            />
                            {uploadForm.errors.signed_document && (
                                <p className="text-xs text-destructive">{uploadForm.errors.signed_document}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setUploadOpen(false)}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={uploadForm.processing || !uploadForm.data.signed_document}>
                                {uploadForm.processing ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Uploading…</> : 'Upload'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Update terms dialog */}
            <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="size-5 text-primary" /> Agreement Terms & Conditions
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            These terms appear on the printed agreement for loan <strong>{loan.loan_number}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleTerms} className="space-y-4">
                        <Textarea
                            rows={12}
                            className="text-xs font-mono"
                            value={termsForm.data.terms_and_conditions}
                            onChange={(e) => termsForm.setData('terms_and_conditions', e.target.value)}
                        />
                        {termsForm.errors.terms_and_conditions && (
                            <p className="text-xs text-destructive">{termsForm.errors.terms_and_conditions}</p>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setTermsOpen(false)}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={termsForm.processing}>
                                {termsForm.processing ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Saving…</> : 'Save Terms'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            {/* Log collection visit dialog */}
            <Dialog open={visitOpen} onOpenChange={setVisitOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MapPin className="size-5 text-primary" /> Log Collection Visit
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Record a field visit for loan <strong>{loan.loan_number}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleVisit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Outcome <span className="text-destructive">*</span></Label>
                                <Select value={visitForm.data.outcome} onValueChange={(v) => visitForm.setData('outcome', v)}>
                                    <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {VISIT_OUTCOMES.map((o) => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {visitForm.errors.outcome && <p className="text-xs text-destructive">{visitForm.errors.outcome}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Visited On</Label>
                                <Input
                                    type="date"
                                    className="h-9 text-xs"
                                    value={visitForm.data.visited_at}
                                    onChange={(e) => visitForm.setData('visited_at', e.target.value)}
                                />
                                {visitForm.errors.visited_at && <p className="text-xs text-destructive">{visitForm.errors.visited_at}</p>}
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Amount Collected (₹) <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                            <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-9 text-xs"
                                placeholder="0.00"
                                value={visitForm.data.amount_collected}
                                onChange={(e) => visitForm.setData('amount_collected', e.target.value)}
                            />
                            {visitForm.errors.amount_collected && <p className="text-xs text-destructive">{visitForm.errors.amount_collected}</p>}
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                            <Textarea rows={3} className="text-xs" placeholder="Visit notes…"
                                value={visitForm.data.notes} onChange={(e) => visitForm.setData('notes', e.target.value)} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setVisitOpen(false)}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={visitForm.processing}>
                                {visitForm.processing ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Saving…</> : 'Log Visit'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Upload KYC dialog */}
            <Dialog open={kycOpen} onOpenChange={setKycOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="size-5 text-primary" /> Upload KYC Document
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            PDF, JPG or PNG up to 10 MB for loan <strong>{loan.loan_number}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleKyc} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Document Type <span className="text-destructive">*</span></Label>
                                <Select value={kycForm.data.document_type} onValueChange={(v) => kycForm.setData('document_type', v)}>
                                    <SelectTrigger className="h-9 text-xs w-full"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {KYC_TYPES.map((t) => (
                                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {kycForm.errors.document_type && <p className="text-xs text-destructive">{kycForm.errors.document_type}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Document Number <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                <Input
                                    className="h-9 text-xs"
                                    placeholder="e.g. XXXX-XXXX-1234"
                                    value={kycForm.data.document_number}
                                    onChange={(e) => kycForm.setData('document_number', e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Document <span className="text-destructive">*</span></Label>
                            <Input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                className="h-9 text-xs"
                                onChange={(e) => kycForm.setData('document', e.target.files?.[0] ?? null)}
                            />
                            {kycForm.errors.document && (
                                <p className="text-xs text-destructive">{kycForm.errors.document}</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" size="sm" onClick={() => setKycOpen(false)}>Cancel</Button>
                            <Button type="submit" size="sm" disabled={kycForm.processing || !kycForm.data.document}>
                                {kycForm.processing ? <><Loader2 className="mr-2 size-3.5 animate-spin" /> Uploading…</> : 'Upload'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}

Show.layout = {
    breadcrumbs: [
        { title: 'Loans', href: app.loans.index.url() },
        { title: 'Loan Details', href: '' },
    ],
};

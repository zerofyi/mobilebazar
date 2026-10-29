import React, { useMemo, useState } from 'react';
import { todayLocal } from "@/lib/local-date";
import { Head, Link, router } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';
import { usePermissions } from '@/hooks/user-permissions';
import SecurityPinModal from '@/components/SecurityPinModal';

import {
    ShoppingCart, ArrowLeft, Printer, Edit, Trash2, Building2, UserRound, FileMinus2,
    Phone, Mail, MapPin, BadgeCheck, FileText,
    AlertCircle, Download, User, Clock, CalendarClock,
    ChevronDown, ChevronRight, Receipt, Cpu, Boxes, Wallet,
    History, StickyNote, Landmark,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FormatAmount } from '@/components/special/format-amount';
import { cn } from '@/lib/utils';

// ─── Interfaces (mirror serializeForShow exactly) ────────────────────

interface StockUnit {
    id: number;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    device_condition: string | null;
    overall_health: string | null;
    battery_health: number | null;
    status: string;
    landed_cost: number;
    is_margin_scheme: boolean;
    wholesale_price: number | null;
    selling_price: number | null;
}

interface StockBatch {
    id: number;
    batch_number: string;
    received_qty: number;
    remaining_qty: number;
    landed_cost: number;
}

interface PurchaseItem {
    id: number;
    product_name: string;
    sku: string | null;
    is_serialized: boolean;
    is_margin_scheme: boolean;
    tax_type: string | null;
    tax_pct: number;
    tax_amount: number;
    ordered_qty: number;
    unit_cost: number;
    discount_amount: number;
    base_cost: number;
    landed_cost: number;
    line_total: number;
    units: StockUnit[];
    batches: StockBatch[];
}

// Optional future fields — the backend does not serialize these yet.
// Sections render a graceful empty state until they arrive.
// Keys mirror PurchaseEntryController::serializeForShow exactly.
interface DebitNote {
    uuid: string;
    number: string;
    date: string | null;
    grand_total: number;
    reason: string | null;
    status: string | null;
}

interface PurchasePayment {
    uuid: string;
    mode: string | null;
    amount: number;
    paid_at: string | null;
    reference: string | null;
}

interface PurchaseDetail {
    id: number;
    uuid: string;
    po_number: string;
    vendor_invoice_no: string | null;
    bill_type: 'po' | 'pv';
    is_gst_billed: boolean;
    is_intra_state: boolean;
    order_date: string | null;
    due_date: string | null;
    type: string;
    status: string;
    payment_status: string;
    payment_mode: string | null;
    notes: string | null;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    shipping_charge: number;
    round_off?: number | null;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    invoice_document_path: string | null;
    created_at: string | null;
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    revision: number;
    revised_at: string | null;
    revised_by: string | null;
    revision_reason: string | null;
    mutable: { mutable: boolean; reason: string | null };
    vendor: {
        id: number;
        name: string;
        type: 'supplier' | 'customer';
        gstin: string | null;
        phone: string | null;
        email: string | null;
        address: string | null;
    } | null;
    debit_notes?: DebitNote[];
    payments?: PurchasePayment[];
    items: PurchaseItem[];
}

interface Props {
    purchase: PurchaseDetail;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
    const s = status.toLowerCase();
    if (s === 'completed' || s === 'posted' || s === 'approved') {
        return 'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400';
    }
    if (s === 'pending' || s === 'partial') {
        return 'text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400';
    }
    if (s === 'cancelled' || s === 'rejected') {
        return 'text-destructive border-destructive/40 bg-destructive/5';
    }
    return 'text-muted-foreground border-border bg-muted/40';
}

function paymentStatusBadge(status: string) {
    const s = status.toLowerCase().replace(/[\s_]+/g, '');
    if (s === 'paid') {
        return 'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400';
    }
    if (s === 'partial' || s === 'partiallypaid') {
        return 'text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400';
    }
    if (s === 'unpaid' || s === 'due' || s === 'overdue') {
        return 'text-rose-700 border-rose-400/40 bg-rose-50 dark:bg-rose-950/30 dark:text-rose-400';
    }
    return 'text-muted-foreground border-border bg-muted/40';
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 py-1.5">
            <dt className="text-xs text-muted-foreground shrink-0">{label}</dt>
            <dd className="text-xs font-medium text-foreground text-right">{children}</dd>
        </div>
    );
}

function TotalRow({ label, amount, className, prefix = '₹' }: { label: string; amount: number; className?: string; prefix?: string }) {
    return (
        <div className={cn('flex items-center justify-between py-1 text-sm', className)}>
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums text-foreground">{prefix}<FormatAmount amount={amount} /></span>
        </div>
    );
}

export default function Show({ purchase }: Props) {
    const { can } = usePermissions();
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

    const isOverdue = purchase.due_date && purchase.due_amount > 0 && purchase.due_date < todayLocal();
    const paidPct = purchase.grand_total > 0
        ? Math.min(100, Math.max(0, (purchase.paid_amount / purchase.grand_total) * 100))
        : 0;

    const toggleRow = (id: number) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    // Delete is PIN-gated: confirm dialog -> store PIN -> delete request.
    const handleDelete = () => {
        setPinError(null);
        setDeleteOpen(false);
        setPinOpen(true);
    };

    const confirmDelete = (securityPin: string) => {
        setDeleting(true);
        router.delete(
            app.purchases.destroy ? app.purchases.destroy.url(purchase.uuid) : `/purchases/${purchase.uuid}`,
            {
                data: { security_pin: securityPin },
                onError: (errs) => {
                    if (errs.security_pin) {
                        setPinError(errs.security_pin as string);
                        setPinOpen(true);
                    }
                },
                onFinish: () => {
                    setDeleting(false);
                },
                onSuccess: () => setPinOpen(false),
            },
        );
    };

    // GST rate-wise tax summary (Tally-style): taxable value per rate slab
    const taxGroups = useMemo(() => {
        const map = new Map<number, { taxable: number; tax: number }>();
        for (const item of purchase.items) {
            const g = map.get(item.tax_pct) ?? { taxable: 0, tax: 0 };
            g.taxable += item.line_total - item.tax_amount;
            g.tax += item.tax_amount;
            map.set(item.tax_pct, g);
        }
        return [...map.entries()].sort((a, b) => a[0] - b[0]);
    }, [purchase.items]);

    const anyMarginScheme = purchase.items.some((i) => i.is_margin_scheme);
    const debitNotes = purchase.debit_notes ?? [];
    const payments = purchase.payments ?? [];
    const roundOff = purchase.round_off ?? null;

    return (
        <>
            <Head title={`Purchase ${purchase.po_number}`} />

            <div className="flex h-full flex-1 flex-col gap-5 overflow-x-auto rounded-xl p-4 md:p-6">

                {/* ── Action Bar ─────────────────────────────────────── */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-border pb-4">
                    <div className="flex items-start gap-3">
                        <Button variant="outline" size="icon" className="size-9 shrink-0" asChild>
                            <Link href={app.purchases.index.url()}>
                                <ArrowLeft className="size-4" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                    <ShoppingCart className="size-6 text-primary" />
                                    {purchase.po_number}
                                </h1>
                                <Badge variant="outline" className="uppercase text-[11px] font-semibold">
                                    {purchase.bill_type === 'po' ? 'Purchase Bill · B2B' : 'Purchase Voucher · Unregistered'}
                                </Badge>
                                <Badge variant="outline" className={cn('capitalize text-[11px] font-medium', statusBadge(purchase.status))}>
                                    {purchase.status}
                                </Badge>
                                <Badge variant="outline" className={cn('capitalize text-[11px] font-medium', paymentStatusBadge(purchase.payment_status))}>
                                    {purchase.payment_status}
                                </Badge>
                                {purchase.revision > 0 && (
                                    <Badge variant="outline" className="text-[11px] font-medium text-muted-foreground">
                                        Rev {purchase.revision}
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-2 flex-wrap">
                                <span>Order Date: <strong className="text-foreground">{fmtDate(purchase.order_date)}</strong></span>
                                {purchase.vendor_invoice_no && (
                                    <>
                                        <span>•</span>
                                        <span>Supplier Bill Ref: <strong className="text-foreground">{purchase.vendor_invoice_no}</strong></span>
                                    </>
                                )}
                                <span>•</span>
                                <span>{purchase.is_gst_billed ? 'GST Billed' : 'Non-GST Bill'}</span>
                                <span>•</span>
                                <span>{purchase.is_intra_state ? 'Intra-state (CGST + SGST)' : 'Inter-state (IGST)'}</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button variant="outline" size="sm" asChild>
                            <Link href={app.purchases.print.url(purchase.uuid)} target="_blank" rel="noopener noreferrer">
                                <Printer className="mr-2 size-4 text-muted-foreground" /> Print
                            </Link>
                        </Button>

                        {can('debit-notes.create') && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/app/debit-notes/create?purchase=${purchase.uuid}`}>
                                    <FileMinus2 className="mr-2 size-4 text-muted-foreground" /> Raise Debit Note
                                </Link>
                            </Button>
                        )}

                        {can('supplier-payments.create') && purchase.payment_status !== 'paid' && (
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/app/supplier-payments/create?purchase=${purchase.uuid}`}>
                                    <Wallet className="mr-2 size-4 text-muted-foreground" /> Record Payment
                                </Link>
                            </Button>
                        )}

                        {purchase.invoice_document_path && (
                            <Button variant="outline" size="sm" asChild>
                                <a href={purchase.invoice_document_path} target="_blank" rel="noreferrer">
                                    <Download className="mr-2 size-4 text-muted-foreground" /> Supplier Document
                                </a>
                            </Button>
                        )}

                        {can('purchases.update') && (
                            <Button size="sm" asChild>
                                <Link href={app.purchases.edit ? app.purchases.edit.url(purchase.uuid) : `/purchases/${purchase.uuid}/edit`}>
                                    <Edit className="mr-2 size-4" /> Edit
                                </Link>
                            </Button>
                        )}

                        {can('purchases.delete') && (
                            <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}>
                                <Trash2 className="mr-2 size-4" /> Delete
                            </Button>
                        )}
                    </div>
                </div>

                {/* ── Bill Document ──────────────────────────────────── */}
                <Card className="shadow-sm overflow-hidden">
                    <CardContent className="p-0">

                        {/* Party + Document meta */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-5 md:p-6 border-b border-border">
                            {/* Billed From */}
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                                    {purchase.vendor?.type === 'supplier'
                                        ? <Building2 className="size-3.5" />
                                        : <UserRound className="size-3.5" />}
                                    Billed From · Supplier
                                </p>
                                {purchase.vendor ? (
                                    <div>
                                        <p className="text-lg font-bold text-foreground">{purchase.vendor.name}</p>
                                        <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
                                            {purchase.vendor.gstin ? (
                                                <p className="font-semibold text-foreground">GSTIN: {purchase.vendor.gstin}</p>
                                            ) : (
                                                <p className="italic">Unregistered supplier — self purchase voucher</p>
                                            )}
                                            {purchase.vendor.phone && (
                                                <p className="flex items-center gap-2"><Phone className="size-3.5 shrink-0" /> {purchase.vendor.phone}</p>
                                            )}
                                            {purchase.vendor.email && (
                                                <p className="flex items-center gap-2"><Mail className="size-3.5 shrink-0" /> {purchase.vendor.email}</p>
                                            )}
                                            <p className="flex items-start gap-2">
                                                <MapPin className="size-3.5 shrink-0 mt-0.5" />
                                                <span>{purchase.vendor.address || 'No address recorded.'}</span>
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic">Walk-in / OTC purchase — no supplier on record.</p>
                                )}
                            </div>

                            {/* Document meta */}
                            <div className="lg:border-l lg:border-border lg:pl-6">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                    <FileText className="size-3.5" /> Document Details
                                </p>
                                <dl>
                                    <MetaRow label="Purchase Bill No.">
                                        <span className="font-bold">{purchase.po_number}</span>
                                    </MetaRow>
                                    <MetaRow label="Supplier Bill Ref.">{purchase.vendor_invoice_no || '—'}</MetaRow>
                                    <MetaRow label="Bill Type">
                                        {purchase.bill_type === 'po' ? 'Purchase Bill (B2B tax invoice)' : 'Purchase Voucher (unregistered)'}
                                    </MetaRow>
                                    <MetaRow label="Order Date">{fmtDate(purchase.order_date)}</MetaRow>
                                    <MetaRow label="Payment Due Date">
                                        <span className={cn(isOverdue && 'text-destructive font-semibold')}>
                                            {fmtDate(purchase.due_date)}
                                            {isOverdue && ' · Overdue'}
                                        </span>
                                    </MetaRow>
                                    <MetaRow label="GST Billed">
                                        {purchase.is_gst_billed
                                            ? <Badge variant="outline" className="text-[10px] text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400">Yes</Badge>
                                            : <Badge variant="outline" className="text-[10px] text-muted-foreground">No</Badge>}
                                    </MetaRow>
                                    <MetaRow label="Supply Type">
                                        {purchase.is_intra_state ? 'Intra-state · CGST + SGST' : 'Inter-state · IGST'}
                                    </MetaRow>
                                    <MetaRow label="Payment Mode">{purchase.payment_mode || '—'}</MetaRow>
                                </dl>
                            </div>
                        </div>

                        {/* Line Items */}
                        <div className="p-5 md:p-6 border-b border-border">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                                Line Items · {purchase.items.length}
                            </p>
                            <div className="overflow-auto rounded-md border border-border">
                                <Table>
                                    <TableHeader className="bg-muted/40">
                                        <TableRow>
                                            <TableHead className="w-10" />
                                            <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                            <TableHead className="text-xs font-semibold">Item</TableHead>
                                            <TableHead className="text-center text-xs font-semibold">Qty</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Rate</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Tax %</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Tax Amt</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {purchase.items.map((item, idx) => {
                                            const expanded = expandedRows.has(item.id);
                                            const hasTrace = item.units.length > 0 || item.batches.length > 0;
                                            return (
                                                <React.Fragment key={item.id}>
                                                    <TableRow className={cn('hover:bg-muted/20', expanded && 'bg-muted/20')}>
                                                        <TableCell className="w-10 pr-0">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="size-7"
                                                                onClick={() => toggleRow(item.id)}
                                                                aria-label={expanded ? 'Collapse line detail' : 'Expand line detail'}
                                                            >
                                                                {expanded
                                                                    ? <ChevronDown className="size-4 text-muted-foreground" />
                                                                    : <ChevronRight className="size-4 text-muted-foreground" />}
                                                            </Button>
                                                        </TableCell>
                                                        <TableCell className="text-center text-xs font-medium text-muted-foreground">{idx + 1}</TableCell>
                                                        <TableCell>
                                                            <p className="text-xs font-bold text-foreground">{item.product_name}</p>
                                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                                {item.sku && <span className="text-[11px] text-muted-foreground">SKU: {item.sku}</span>}
                                                                <Badge variant="outline" className="text-[10px] capitalize">
                                                                    {item.is_serialized ? 'Serialized' : 'Bulk'}
                                                                </Badge>
                                                                {item.is_margin_scheme && (
                                                                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">Margin Scheme</Badge>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-center text-xs font-semibold tabular-nums">{item.ordered_qty}</TableCell>
                                                        <TableCell className="text-right text-xs tabular-nums">₹<FormatAmount amount={item.unit_cost} /></TableCell>
                                                        <TableCell className="text-right text-xs tabular-nums">{item.tax_amount > 0 ? `${item.tax_pct}%` : '—'}</TableCell>
                                                        <TableCell className="text-right text-xs tabular-nums text-primary font-medium">
                                                            {item.tax_amount > 0 ? <>₹<FormatAmount amount={item.tax_amount} /></> : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs font-bold tabular-nums text-foreground">₹<FormatAmount amount={item.line_total} /></TableCell>
                                                    </TableRow>
                                                    {expanded && (
                                                        <TableRow className="bg-muted/20 hover:bg-muted/20">
                                                            <TableCell colSpan={8} className="py-3 px-4 md:px-10">
                                                                {item.is_serialized && item.units.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                                                            <Cpu className="size-3.5" />
                                                                            Serialized stock · {item.units.length} unit{item.units.length === 1 ? '' : 's'} — IMEI / serial numbers
                                                                        </p>
                                                                        <div className="overflow-auto rounded-md border border-border bg-background">
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead className="text-[11px]">IMEI 1 / Serial</TableHead>
                                                                                        <TableHead className="text-[11px]">IMEI 2</TableHead>
                                                                                        <TableHead className="text-[11px]">Condition</TableHead>
                                                                                        <TableHead className="text-[11px]">Health</TableHead>
                                                                                        <TableHead className="text-[11px]">Stock Status</TableHead>
                                                                                        <TableHead className="text-right text-[11px]">Landed Cost</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {item.units.map((u) => (
                                                                                        <TableRow key={u.id}>
                                                                                            <TableCell className="text-xs font-bold text-primary font-mono">
                                                                                                {u.imei1 || u.serial_number || '—'}
                                                                                            </TableCell>
                                                                                            <TableCell className="text-xs text-muted-foreground font-mono">{u.imei2 || '—'}</TableCell>
                                                                                            <TableCell className="text-xs capitalize">{u.device_condition || 'New'}</TableCell>
                                                                                            <TableCell className="text-xs">
                                                                                                {u.battery_health ? `${u.battery_health}% battery` : u.overall_health || '—'}
                                                                                            </TableCell>
                                                                                            <TableCell>
                                                                                                <Badge variant="outline" className="text-[10px] uppercase">{u.status}</Badge>
                                                                                                {u.is_margin_scheme && (
                                                                                                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 ml-1.5">Margin</Badge>
                                                                                                )}
                                                                                            </TableCell>
                                                                                            <TableCell className="text-right text-xs font-semibold tabular-nums">
                                                                                                ₹<FormatAmount amount={u.landed_cost} />
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {!item.is_serialized && item.batches.length > 0 && (
                                                                    <div>
                                                                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                                                                            <Boxes className="size-3.5" />
                                                                            Bulk stock · {item.batches.length} batch{item.batches.length === 1 ? '' : 'es'} received
                                                                        </p>
                                                                        <div className="overflow-auto rounded-md border border-border bg-background">
                                                                            <Table>
                                                                                <TableHeader>
                                                                                    <TableRow>
                                                                                        <TableHead className="text-[11px]">Batch No.</TableHead>
                                                                                        <TableHead className="text-center text-[11px]">Received Qty</TableHead>
                                                                                        <TableHead className="text-center text-[11px]">Remaining Qty</TableHead>
                                                                                        <TableHead className="text-right text-[11px]">Landed Cost / unit</TableHead>
                                                                                    </TableRow>
                                                                                </TableHeader>
                                                                                <TableBody>
                                                                                    {item.batches.map((b) => (
                                                                                        <TableRow key={b.id}>
                                                                                            <TableCell className="text-xs font-bold text-primary">#{b.batch_number}</TableCell>
                                                                                            <TableCell className="text-center text-xs font-semibold tabular-nums">{b.received_qty}</TableCell>
                                                                                            <TableCell className="text-center text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{b.remaining_qty}</TableCell>
                                                                                            <TableCell className="text-right text-xs font-semibold tabular-nums">
                                                                                                ₹<FormatAmount amount={b.landed_cost} />
                                                                                            </TableCell>
                                                                                        </TableRow>
                                                                                    ))}
                                                                                </TableBody>
                                                                            </Table>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {!hasTrace && (
                                                                    <p className="text-xs text-muted-foreground italic">No stock trace recorded for this line.</p>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-2">
                                Click the chevron on any row to view IMEI / serial numbers or batch details.
                            </p>
                        </div>

                        {/* Tax breakup + Totals */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 p-5 md:p-6">
                            {/* Tax breakup */}
                            <div className="lg:col-span-3">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                                    <Receipt className="size-3.5" /> Tax Breakup
                                </p>
                                {purchase.is_gst_billed ? (
                                    <>
                                        <div className="overflow-auto rounded-md border border-border">
                                            <Table>
                                                <TableHeader className="bg-muted/40">
                                                    <TableRow>
                                                        <TableHead className="text-[11px] font-semibold">GST Rate</TableHead>
                                                        <TableHead className="text-right text-[11px] font-semibold">Taxable Value</TableHead>
                                                        {purchase.is_intra_state ? (
                                                            <>
                                                                <TableHead className="text-right text-[11px] font-semibold">CGST</TableHead>
                                                                <TableHead className="text-right text-[11px] font-semibold">SGST</TableHead>
                                                            </>
                                                        ) : (
                                                            <TableHead className="text-right text-[11px] font-semibold">IGST</TableHead>
                                                        )}
                                                        <TableHead className="text-right text-[11px] font-semibold">Total Tax</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {taxGroups.map(([rate, g]) => (
                                                        <TableRow key={rate}>
                                                            <TableCell className="text-xs font-semibold">{rate}%</TableCell>
                                                            <TableCell className="text-right text-xs tabular-nums">₹<FormatAmount amount={g.taxable} /></TableCell>
                                                            {purchase.is_intra_state ? (
                                                                <>
                                                                    <TableCell className="text-right text-xs tabular-nums">₹<FormatAmount amount={g.tax / 2} /></TableCell>
                                                                    <TableCell className="text-right text-xs tabular-nums">₹<FormatAmount amount={g.tax / 2} /></TableCell>
                                                                </>
                                                            ) : (
                                                                <TableCell className="text-right text-xs tabular-nums">₹<FormatAmount amount={g.tax} /></TableCell>
                                                            )}
                                                            <TableCell className="text-right text-xs font-semibold tabular-nums text-primary">
                                                                ₹<FormatAmount amount={g.tax} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        {anyMarginScheme && (
                                            <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-2">
                                                Margin-scheme lines are taxed only on the margin (selling price − landed cost).
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic border border-dashed border-border rounded-md p-4">
                                        No GST billed on this purchase — tax breakup not applicable.
                                    </p>
                                )}
                            </div>

                            {/* Totals */}
                            <div className="lg:col-span-2 lg:border-l lg:border-border lg:pl-6">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                    Bill Totals
                                </p>
                                <TotalRow label="Subtotal (taxable)" amount={purchase.subtotal} />
                                {purchase.discount_amount > 0 && (
                                    <div className="flex items-center justify-between py-1 text-sm">
                                        <span className="text-emerald-600 dark:text-emerald-400">Less: Discount</span>
                                        <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">− ₹<FormatAmount amount={purchase.discount_amount} /></span>
                                    </div>
                                )}
                                {purchase.shipping_charge > 0 && (
                                    <div className="flex items-center justify-between py-1 text-sm">
                                        <span className="text-muted-foreground">Add: Shipping / Freight</span>
                                        <span className="font-semibold tabular-nums text-foreground">+ ₹<FormatAmount amount={purchase.shipping_charge} /></span>
                                    </div>
                                )}
                                {purchase.is_gst_billed && (
                                    <div className="flex items-center justify-between py-1 text-sm">
                                        <span className="text-muted-foreground">
                                            Add: GST ({purchase.is_intra_state ? 'CGST + SGST' : 'IGST'})
                                        </span>
                                        <span className="font-semibold tabular-nums text-primary">+ ₹<FormatAmount amount={purchase.tax_amount} /></span>
                                    </div>
                                )}
                                {roundOff !== null && roundOff !== 0 && (
                                    <div className="flex items-center justify-between py-1 text-sm">
                                        <span className="text-muted-foreground">Round Off</span>
                                        <span className="font-semibold tabular-nums text-foreground">
                                            {roundOff > 0 ? '+' : '−'} ₹<FormatAmount amount={Math.abs(roundOff)} />
                                        </span>
                                    </div>
                                )}
                                <Separator className="my-2" />
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-sm font-bold text-foreground">Grand Total</span>
                                    <span className="text-xl font-bold tabular-nums text-foreground">₹<FormatAmount amount={purchase.grand_total} /></span>
                                </div>
                                <Separator className="my-2" />
                                <div className="flex items-center justify-between py-1 text-sm">
                                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">Paid</span>
                                    <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">₹<FormatAmount amount={purchase.paid_amount} /></span>
                                </div>
                                <div className="flex items-center justify-between py-1 text-sm">
                                    <span className={cn('font-bold', purchase.due_amount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>Balance Due</span>
                                    <span className={cn('font-bold tabular-nums', purchase.due_amount > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
                                        ₹<FormatAmount amount={purchase.due_amount} />
                                    </span>
                                </div>
                            </div>
                        </div>

                    </CardContent>
                </Card>

                {/* ── Payment Summary ────────────────────────────────── */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3 border-b border-border/50">
                        <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Wallet className="size-4 text-primary" /> Payment Summary
                        </CardTitle>
                        <CardDescription className="text-xs">Settlement position against this purchase bill.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Paid</p>
                                <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                                    ₹<FormatAmount amount={purchase.paid_amount} />
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Mode: {purchase.payment_mode || '—'}</p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Due</p>
                                <p className={cn('text-2xl font-bold tabular-nums mt-1', purchase.due_amount > 0 ? (isOverdue ? 'text-destructive' : 'text-amber-600 dark:text-amber-400') : 'text-foreground')}>
                                    ₹<FormatAmount amount={purchase.due_amount} />
                                </p>
                                <p className={cn('text-xs mt-1 flex items-center gap-1', isOverdue ? 'text-destructive font-semibold' : 'text-muted-foreground')}>
                                    <CalendarClock className="size-3" />
                                    {purchase.due_date ? `Due ${fmtDate(purchase.due_date)}` : 'No due date set'}
                                    {isOverdue && ' · Overdue'}
                                </p>
                            </div>
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</p>
                                <div className="mt-2">
                                    <Badge variant="outline" className={cn('capitalize text-xs font-medium', paymentStatusBadge(purchase.payment_status))}>
                                        {purchase.payment_status}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">of ₹<FormatAmount amount={purchase.grand_total} /> grand total</p>
                            </div>
                        </div>
                        <Progress value={paidPct} className="h-2" />
                        <p className="text-[11px] text-muted-foreground mt-1.5 text-right">{paidPct.toFixed(1)}% settled</p>
                    </CardContent>
                </Card>

                {/* ── Linked Documents ───────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    {/* Debit Notes */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <FileText className="size-4 text-primary" /> Debit Notes
                                <Badge variant="outline" className="text-[10px] ml-1">{debitNotes.length}</Badge>
                            </CardTitle>
                            <CardDescription className="text-xs">Purchase returns / debit notes raised against this bill.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {debitNotes.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-[11px]">Note No.</TableHead>
                                            <TableHead className="text-[11px]">Date</TableHead>
                                            <TableHead className="text-[11px]">Reason</TableHead>
                                            <TableHead className="text-right text-[11px]">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {debitNotes.map((dn) => (
                                            <TableRow key={dn.uuid}>
                                                <TableCell className="text-xs font-bold text-primary">{dn.number}</TableCell>
                                                <TableCell className="text-xs">{fmtDate(dn.date)}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{dn.reason || '—'}</TableCell>
                                                <TableCell className="text-right text-xs font-semibold tabular-nums">₹<FormatAmount amount={dn.grand_total} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-xs text-muted-foreground italic py-2">No debit notes raised against this purchase.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payments */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <Landmark className="size-4 text-primary" /> Payments Made
                                <Badge variant="outline" className="text-[10px] ml-1">{payments.length}</Badge>
                            </CardTitle>
                            <CardDescription className="text-xs">Supplier payments recorded against this bill.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4">
                            {payments.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-[11px]">Payment</TableHead>
                                            <TableHead className="text-[11px]">Date</TableHead>
                                            <TableHead className="text-[11px]">Mode</TableHead>
                                            <TableHead className="text-right text-[11px]">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {payments.map((p) => (
                                            <TableRow key={p.uuid}>
                                                <TableCell className="text-xs font-bold text-primary">
                                                    {p.reference ? `Ref: ${p.reference}` : `#${p.uuid.slice(0, 8)}`}
                                                </TableCell>
                                                <TableCell className="text-xs">{fmtDate(p.paid_at)}</TableCell>
                                                <TableCell className="text-xs capitalize">{p.mode || '—'}</TableCell>
                                                <TableCell className="text-right text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                                                    ₹<FormatAmount amount={p.amount} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="text-xs text-muted-foreground italic py-2">No payments recorded against this purchase yet.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Notes + Audit Trail ────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <StickyNote className="size-4 text-primary" /> Remarks
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {purchase.notes || 'No remarks recorded for this purchase bill.'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <History className="size-4 text-primary" /> Audit Trail
                            </CardTitle>
                            <CardDescription className="text-xs">Who created, approved, and revised this bill.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 text-xs space-y-2.5">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5"><User className="size-3.5" /> Created By</span>
                                <span className="font-semibold text-foreground">{purchase.created_by || 'System'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="size-3.5" /> Created At</span>
                                <span className="text-foreground">{fmtDate(purchase.created_at)}</span>
                            </div>
                            {purchase.approved_by && (
                                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                    <span className="text-muted-foreground flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-primary" /> Approved By</span>
                                    <span className="font-semibold text-foreground">
                                        {purchase.approved_by}
                                        {purchase.approved_at && <span className="block text-[11px] font-normal text-muted-foreground">{fmtDate(purchase.approved_at)}</span>}
                                    </span>
                                </div>
                            )}
                            {purchase.revision > 0 && (
                                <div className="pt-2 border-t border-border/50 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Revision</span>
                                        <Badge variant="outline" className="text-[10px]">Rev {purchase.revision}</Badge>
                                    </div>
                                    {purchase.revised_by && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Revised By</span>
                                            <span className="font-semibold text-foreground">{purchase.revised_by}</span>
                                        </div>
                                    )}
                                    {purchase.revision_reason && (
                                        <p className="text-muted-foreground"><span className="font-medium text-foreground">Reason:</span> {purchase.revision_reason}</p>
                                    )}
                                </div>
                            )}
                            {!purchase.mutable.mutable && purchase.mutable.reason && (
                                <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5 pt-2 border-t border-border/50">
                                    <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                                    {purchase.mutable.reason}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </div>

            </div>

            {/* ── Delete confirm ─────────────────────────────────────── */}
            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Purchase {purchase.po_number}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will reverse the stock intake and journal entries for this purchase and delete the bill.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Delete Purchase
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* ── Security PIN for delete ─────────────────────────────── */}
            <SecurityPinModal
                open={pinOpen}
                onOpenChange={setPinOpen}
                onConfirm={confirmDelete}
                title="Confirm purchase delete"
                description={`Enter the store's 6-digit security PIN to delete ${purchase.po_number}.`}
                error={pinError}
                verifying={deleting}
                confirmLabel="Delete purchase"
            />
        </>
    );
}

Show.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Purchases', href: app.purchases.index.url() },
        { title: 'Purchase Bill', href: '#' },
    ],
};

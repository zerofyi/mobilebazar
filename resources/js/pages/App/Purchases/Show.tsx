import React, { useState } from 'react';
import { Head, Link } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';
import { usePermissions } from '@/hooks/user-permissions';

import {
    ShoppingCart, ArrowLeft, Printer, Edit, Building2, UserRound,
    Phone, Mail, MapPin, BadgeCheck, FileText, CheckCircle2, Clock,
    AlertCircle, Download, User, CalendarClock, ShieldCheck,
    Layers, Cpu, HardDrive, DollarSign, Receipt, FileSpreadsheet
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormatAmount } from '@/components/special/format-amount';
import { cn } from '@/lib/utils';

// ─── Interfaces ─────────────────────────────────────────────────────────

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
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    invoice_document_path: string | null;
    created_at: string | null;
    created_by: string | null;
    approved_by: string | null;
    approved_at: string | null;
    vendor: {
        id: number;
        name: string;
        type: 'supplier' | 'customer';
        gstin: string | null;
        phone: string | null;
        email: string | null;
        address: string | { village_or_area?: string; district?: string; line1?: string } | null;
    } | null;
    items: PurchaseItem[];
}

interface Props {
    purchase: PurchaseDetail;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderAddress(address: PurchaseDetail['vendor'] extends null ? never : NonNullable<PurchaseDetail['vendor']>['address']) {
    if (!address) return 'No primary address recorded.';
    if (typeof address === 'string') return address;
    return [address.line1 || address.village_or_area, address.district].filter(Boolean).join(', ');
}

export default function Show({ purchase }: Props) {
    const { can } = usePermissions();
    const isOverdue = purchase.due_date && purchase.due_amount > 0 && new Date(purchase.due_date) < new Date();

    const allUnits = purchase.items.flatMap((item) => item.units || []);
    const allBatches = purchase.items.flatMap((item) => item.batches || []);

    return (
        <>
            <Head title={`Purchase Order ${purchase.po_number}`} />

            <div className="flex h-full flex-1 flex-col gap-6 overflow-x-auto rounded-xl p-4 md:p-6">

                {/* ── Top Header Actions & Ref ───────────────────────────── */}
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
                                <Badge variant="outline" className="uppercase text-xs font-semibold">
                                    {purchase.bill_type === 'po' ? 'B2B Tax Invoice' : 'Self Purchase Voucher'}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={cn("capitalize text-xs font-medium", {
                                        'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400': purchase.status === 'completed',
                                        'text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400': purchase.status === 'pending',
                                        'text-muted-foreground border-border bg-muted/40': purchase.status === 'draft',
                                    })}
                                >
                                    {purchase.status}
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                                <span>Order Date: <strong className="text-foreground">{fmtDate(purchase.order_date)}</strong></span>
                                {purchase.vendor_invoice_no && (
                                    <>
                                        <span>•</span>
                                        <span>Supplier Bill Ref: <strong className="text-foreground">{purchase.vendor_invoice_no}</strong></span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Link
                            href={app.purchases.print.url(purchase.uuid)} // Or `/app/purchases/${item.uuid}/print`
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center text-xs font-medium text-foreground hover:text-primary transition-colors cursor-pointer"
                        >
                            <Printer className="mr-2 size-4 text-muted-foreground" />
                            <span>Print Voucher</span>
                        </Link>

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
                                    <Edit className="mr-2 size-4" /> Edit Order
                                </Link>
                            </Button>
                        )}
                    </div>
                </div>

                {/* ── Executive Metric Cards ─────────────────────────────── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Payable Grand Total
                            </CardTitle>
                            <DollarSign className="size-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-foreground">
                                ₹<FormatAmount amount={purchase.grand_total} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Base: ₹<FormatAmount amount={purchase.subtotal} /> + Tax: ₹<FormatAmount amount={purchase.tax_amount} />
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Total Paid
                            </CardTitle>
                            <CheckCircle2 className="size-4 text-emerald-600" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                ₹<FormatAmount amount={purchase.paid_amount} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1 capitalize">
                                Mode: {purchase.payment_mode || 'Unspecified'} ({purchase.payment_status})
                            </p>
                        </CardContent>
                    </Card>

                    <Card className={cn(isOverdue && "border-destructive/40 bg-destructive/5")}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Balance Outstanding
                            </CardTitle>
                            <AlertCircle className={cn("size-4", isOverdue ? "text-destructive" : "text-amber-600")} />
                        </CardHeader>
                        <CardContent>
                            <div className={cn("text-2xl font-bold", purchase.due_amount > 0 ? (isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400") : "text-foreground")}>
                                ₹<FormatAmount amount={purchase.due_amount} />
                            </div>
                            <p className={cn("text-xs mt-1 flex items-center gap-1", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                                <CalendarClock className="size-3" />
                                {purchase.due_date ? `Due: ${fmtDate(purchase.due_date)}` : 'No due date set'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Input Tax Credit (ITC)
                            </CardTitle>
                            <Receipt className="size-4 text-primary" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary">
                                ₹<FormatAmount amount={purchase.tax_amount} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {purchase.is_gst_billed ? (purchase.is_intra_state ? 'CGST + SGST (Intra-state)' : 'IGST (Inter-state)') : 'Non-GST Eligible'}
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Vendor & Compliance Card ───────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Vendor Box */}
                    <Card className="lg:col-span-2 shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                    {purchase.vendor?.type === 'supplier' ? <Building2 className="size-4 text-primary" /> : <UserRound className="size-4 text-primary" />}
                                    Vendor & Entity Profile
                                </CardTitle>
                                <CardDescription className="text-xs">Supplier information associated with this order.</CardDescription>
                            </div>
                            {purchase.vendor?.gstin && (
                                <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                                    <BadgeCheck className="mr-1 size-3" /> Registered GST Vendor
                                </Badge>
                            )}
                        </CardHeader>
                        <CardContent className="pt-4">
                            {purchase.vendor ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                    <div className="space-y-1">
                                        <p className="text-base font-bold text-foreground">{purchase.vendor.name}</p>
                                        <p className="text-muted-foreground capitalize">Classification: {purchase.vendor.type}</p>
                                        {purchase.vendor.gstin ? (
                                            <p className="text-foreground font-semibold pt-1">GSTIN: {purchase.vendor.gstin}</p>
                                        ) : (
                                            <p className="text-muted-foreground italic pt-1">Unregistered Seller</p>
                                        )}
                                    </div>
                                    <div className="space-y-1.5 text-muted-foreground border-t sm:border-t-0 sm:border-l border-border/50 pt-3 sm:pt-0 sm:pl-4">
                                        {purchase.vendor.phone && (
                                            <p className="flex items-center gap-2"><Phone className="size-3.5 text-muted-foreground shrink-0" /> {purchase.vendor.phone}</p>
                                        )}
                                        {purchase.vendor.email && (
                                            <p className="flex items-center gap-2"><Mail className="size-3.5 text-muted-foreground shrink-0" /> {purchase.vendor.email}</p>
                                        )}
                                        <p className="flex items-start gap-2">
                                            <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                            <span>{renderAddress(purchase.vendor.address)}</span>
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">Direct OTC / Self Purchase Voucher</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Order Meta / Audit */}
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                                <ShieldCheck className="size-4 text-primary" />
                                Audit & Execution
                            </CardTitle>
                            <CardDescription className="text-xs">System logging details.</CardDescription>
                        </CardHeader>
                        <CardContent className="pt-4 text-xs space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5"><User className="size-3.5" /> Created By:</span>
                                <span className="font-semibold text-foreground">{purchase.created_by || 'System'}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5"><Clock className="size-3.5" /> Timestamp:</span>
                                <span className="text-foreground">{fmtDate(purchase.created_at)}</span>
                            </div>
                            {purchase.approved_by && (
                                <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                    <span className="text-muted-foreground flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-primary" /> Approved By:</span>
                                    <span className="font-semibold text-foreground">{purchase.approved_by}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Tabbed Detail Management ────────────────────────────── */}
                <Tabs defaultValue="items" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 max-w-md">
                        <TabsTrigger value="items" className="text-xs flex items-center gap-1.5">
                            <FileSpreadsheet className="size-3.5" /> Line Items ({purchase.items.length})
                        </TabsTrigger>
                        <TabsTrigger value="units" className="text-xs flex items-center gap-1.5" disabled={allUnits.length === 0}>
                            <Cpu className="size-3.5" /> IMEIs / Serials ({allUnits.length})
                        </TabsTrigger>
                        <TabsTrigger value="batches" className="text-xs flex items-center gap-1.5" disabled={allBatches.length === 0}>
                            <HardDrive className="size-3.5" /> Stock Batches ({allBatches.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* Tab 1: Line Items */}
                    <TabsContent value="items" className="mt-3">
                        <Card className="shadow-sm">
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                            <TableHead className="text-xs font-semibold">Item & Description</TableHead>
                                            <TableHead className="text-center text-xs font-semibold">Qty</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Unit Cost</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Base Total</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Tax (GST)</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Landed Cost</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Line Total</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {purchase.items.map((item, idx) => (
                                            <TableRow key={item.id} className="hover:bg-muted/20">
                                                <TableCell className="text-center text-xs font-medium text-muted-foreground">{idx + 1}</TableCell>
                                                <TableCell>
                                                    <p className="text-xs font-bold text-foreground">{item.product_name}</p>
                                                    {item.sku && <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>}
                                                    {item.is_margin_scheme && (
                                                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 mt-1">Margin Scheme</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center text-xs font-semibold">{item.ordered_qty}</TableCell>
                                                <TableCell className="text-right text-xs">₹<FormatAmount amount={item.unit_cost} /></TableCell>
                                                <TableCell className="text-right text-xs text-muted-foreground">₹<FormatAmount amount={item.base_cost} /></TableCell>
                                                <TableCell className="text-right text-xs text-primary font-medium">
                                                    {item.tax_amount > 0 ? <>₹<FormatAmount amount={item.tax_amount} /> ({item.tax_pct}%)</> : '—'}
                                                </TableCell>
                                                <TableCell className="text-right text-xs font-medium">₹<FormatAmount amount={item.landed_cost} /></TableCell>
                                                <TableCell className="text-right text-xs font-bold text-foreground">₹<FormatAmount amount={item.line_total} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 2: Serialized Units */}
                    <TabsContent value="units" className="mt-3">
                        <Card className="shadow-sm">
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                            <TableHead className="text-xs font-semibold">IMEI 1 / Serial</TableHead>
                                            <TableHead className="text-xs font-semibold">IMEI 2</TableHead>
                                            <TableHead className="text-xs font-semibold">Device Condition</TableHead>
                                            <TableHead className="text-xs font-semibold">Health</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Landed Cost</TableHead>
                                            <TableHead className="text-xs font-semibold">Stock Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allUnits.map((u, i) => (
                                            <TableRow key={u.id} className="hover:bg-muted/20">
                                                <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="text-xs font-bold text-primary">{u.imei1 || u.serial_number || '—'}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{u.imei2 || '—'}</TableCell>
                                                <TableCell className="text-xs capitalize">{u.device_condition || 'New'}</TableCell>
                                                <TableCell className="text-xs">{u.battery_health ? `${u.battery_health}% Battery` : u.overall_health || '—'}</TableCell>
                                                <TableCell className="text-right text-xs font-semibold">₹<FormatAmount amount={u.landed_cost} /></TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px] uppercase">{u.status}</Badge>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tab 3: Stock Batches */}
                    <TabsContent value="batches" className="mt-3">
                        <Card className="shadow-sm">
                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                            <TableHead className="text-xs font-semibold">Batch Number</TableHead>
                                            <TableHead className="text-center text-xs font-semibold">Received Qty</TableHead>
                                            <TableHead className="text-center text-xs font-semibold">Remaining Qty</TableHead>
                                            <TableHead className="text-right text-xs font-semibold">Landed Cost</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {allBatches.map((b, i) => (
                                            <TableRow key={b.id} className="hover:bg-muted/20">
                                                <TableCell className="text-center text-xs text-muted-foreground">{i + 1}</TableCell>
                                                <TableCell className="text-xs font-bold text-primary">#{b.batch_number}</TableCell>
                                                <TableCell className="text-center text-xs font-semibold">{b.received_qty}</TableCell>
                                                <TableCell className="text-center text-xs font-semibold text-emerald-600">{b.remaining_qty}</TableCell>
                                                <TableCell className="text-right text-xs font-bold">₹<FormatAmount amount={b.landed_cost} /></TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>

                {/* ── Financial Ledger Breakdown ──────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Vendor Voucher Notes
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4">
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                                {purchase.notes || 'No remarks recorded for this purchase voucher.'}
                            </p>
                        </CardContent>
                    </Card>

                    <Card className="shadow-sm">
                        <CardHeader className="pb-3 border-b border-border/50">
                            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Order Accounting Summary
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-4 text-xs space-y-2">
                            <div className="flex justify-between text-muted-foreground">
                                <span>Subtotal Base Cost:</span>
                                <span className="font-semibold text-foreground">₹<FormatAmount amount={purchase.subtotal} /></span>
                            </div>
                            {purchase.is_gst_billed && (
                                <div className="flex justify-between text-primary font-medium">
                                    <span>Tax Amount (GST):</span>
                                    <span>+ ₹<FormatAmount amount={purchase.tax_amount} /></span>
                                </div>
                            )}
                            {purchase.discount_amount > 0 && (
                                <div className="flex justify-between text-emerald-600 font-medium">
                                    <span>Discount Received:</span>
                                    <span>- ₹<FormatAmount amount={purchase.discount_amount} /></span>
                                </div>
                            )}
                            {purchase.shipping_charge > 0 && (
                                <div className="flex justify-between text-amber-600 font-medium">
                                    <span>Freight Inward Charge:</span>
                                    <span>+ ₹<FormatAmount amount={purchase.shipping_charge} /></span>
                                </div>
                            )}
                            <div className="border-t border-border pt-2 flex justify-between text-base font-bold text-foreground">
                                <span>Grand Total Payable:</span>
                                <span>₹<FormatAmount amount={purchase.grand_total} /></span>
                            </div>
                            <div className="flex justify-between text-emerald-600 font-semibold pt-1">
                                <span>Amount Settled / Paid:</span>
                                <span>₹<FormatAmount amount={purchase.paid_amount} /></span>
                            </div>
                            <div className="flex justify-between text-amber-600 font-bold pt-1 border-t border-border/50">
                                <span>Outstanding Balance Due:</span>
                                <span>₹<FormatAmount amount={purchase.due_amount} /></span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

            </div>
        </>
    );
}

Show.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Purchases', href: app.purchases.index.url() },
        { title: 'View Details', href: '#' },
    ],
};

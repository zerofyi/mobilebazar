import React from "react";
import { Head, Link } from "@inertiajs/react";
import {
    ChevronRight, ArrowLeft, Printer, UserRound, Phone, BadgeCheck,
    Package, Smartphone, Boxes,
} from "lucide-react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// ─── Types (serialized by SaleEntryController@show) ──────────────────────────

export interface ShowInvoiceUnit {
    id: number;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    device_condition: string;
    landed_cost: number;
    is_margin_scheme: boolean;
}

export interface ShowInvoiceBatchAlloc {
    batch_number: string;
    qty: number;
    landed_cost: number;
}

export interface ShowInvoiceItem {
    id: number;
    product_name: string;
    sku: string | null;
    hsn_code: string | null;
    is_serialized: boolean;
    warranty: string | null;
    qty: number;
    unit_price: number;
    discount_amount: number;
    taxable_value: number;
    tax_pct: number;
    tax_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    line_total: number;
    is_margin_scheme: boolean;
    units: ShowInvoiceUnit[];
    batch_allocations: ShowInvoiceBatchAlloc[];
}

export interface ShowInvoice {
    id: number;
    uuid: string;
    invoice_number: string;
    invoice_date: string;
    invoice_type: "retail" | "wholesale" | string;
    is_gst_billed: boolean;
    is_intra_state: boolean;
    payment_status: "paid" | "partial" | "unpaid" | string;
    payment_mode: string | null;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    shipping_charge: number;
    round_off: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    notes: string | null;
    created_by: string | null;
    created_at: string | null;
    party: { type: "customer" | "supplier" | null; id: number | null; name: string; phone: string | null; gstin: string | null };
    items: ShowInvoiceItem[];
}

interface Props {
    invoice: ShowInvoice;
}

function statusBadge(status: string) {
    switch (status) {
        case "paid":
            return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">Paid</Badge>;
        case "partial":
            return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">Partial</Badge>;
        default:
            return <Badge className="bg-destructive/10 text-destructive border-destructive/30">Unpaid</Badge>;
    }
}

export default function SaleShow({ invoice }: Props) {
    useFlashToast();
    const intra = invoice.is_intra_state;
    const cgst = invoice.items.reduce((s, i) => s + i.cgst_amount, 0);
    const sgst = invoice.items.reduce((s, i) => s + i.sgst_amount, 0);
    const igst = invoice.items.reduce((s, i) => s + i.igst_amount, 0);
    const marginItems = invoice.items.filter((i) => i.is_margin_scheme).length;

    return (
        <>
            <Head title={`Invoice ${invoice.invoice_number}`} />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <nav className="flex items-center space-x-1.5 text-xs text-muted-foreground font-medium">
                            <Link href={dashboard.url()} className="hover:text-foreground transition-colors">Dashboard</Link>
                            <ChevronRight className="size-3 text-muted-foreground/60" />
                            <Link href={app.sales.index.url()} className="hover:text-foreground transition-colors">Sales</Link>
                            <ChevronRight className="size-3 text-muted-foreground/60" />
                            <span className="font-semibold text-foreground">{invoice.invoice_number}</span>
                        </nav>
                        <div className="mt-0.5 flex items-center gap-2">
                            <h1 className="text-xl font-semibold font-mono">{invoice.invoice_number}</h1>
                            {statusBadge(invoice.payment_status)}
                            {!invoice.is_gst_billed && <Badge variant="outline">Non-GST</Badge>}
                            {marginItems > 0 && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400">{marginItems} margin line{marginItems !== 1 ? "s" : ""}</Badge>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Link href={app.sales.index.url()}>
                            <Button variant="outline"><ArrowLeft className="size-4 mr-1.5" /> Back</Button>
                        </Link>
                        <Link href={app.sales.print.url(invoice.uuid)}>
                            <Button><Printer className="size-4 mr-1.5" /> Print Invoice</Button>
                        </Link>
                    </div>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">{invoice.party?.type === "supplier" ? "Party" : "Customer"}</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <p className="flex items-center gap-1.5 font-medium"><UserRound className="size-4 text-muted-foreground" />{invoice.party?.name ?? "—"}</p>
                            {invoice.party?.phone && (
                                <p className="mt-1 flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" />{invoice.party.phone}</p>
                            )}
                            {invoice.party?.gstin && (
                                <p className="mt-1"><Badge variant="outline" className="gap-1"><BadgeCheck className="size-3 text-primary" />{invoice.party.gstin}</Badge></p>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Invoice</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <dl className="space-y-1">
                                <div className="flex justify-between"><dt className="text-muted-foreground">Date</dt><dd>{invoice.invoice_date}</dd></div>
                                <div className="flex justify-between"><dt className="text-muted-foreground">Tax routing</dt><dd>{invoice.is_gst_billed ? (intra ? "CGST + SGST" : "IGST") : "No GST"}</dd></div>
                                <div className="flex justify-between"><dt className="text-muted-foreground">Sale type</dt><dd className="capitalize">{invoice.invoice_type}</dd></div>
                                <div className="flex justify-between"><dt className="text-muted-foreground">Payment mode</dt><dd className="capitalize">{invoice.payment_mode ?? "—"}</dd></div>
                                {invoice.created_by && <div className="flex justify-between"><dt className="text-muted-foreground">Billed by</dt><dd>{invoice.created_by}</dd></div>}
                            </dl>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Totals</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <dl className="space-y-1">
                                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">₹<FormatAmount amount={invoice.subtotal} /></dd></div>
                                {invoice.discount_amount > 0 && (
                                    <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="tabular-nums">− ₹<FormatAmount amount={invoice.discount_amount} /></dd></div>
                                )}
                                {invoice.is_gst_billed && intra && (
                                    <>
                                        <div className="flex justify-between"><dt className="text-muted-foreground">CGST</dt><dd className="tabular-nums">₹<FormatAmount amount={cgst} /></dd></div>
                                        <div className="flex justify-between"><dt className="text-muted-foreground">SGST</dt><dd className="tabular-nums">₹<FormatAmount amount={sgst} /></dd></div>
                                    </>
                                )}
                                {invoice.is_gst_billed && !intra && (
                                    <div className="flex justify-between"><dt className="text-muted-foreground">IGST</dt><dd className="tabular-nums">₹<FormatAmount amount={igst} /></dd></div>
                                )}
                                {invoice.shipping_charge > 0 && (
                                    <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular-nums">+ ₹<FormatAmount amount={invoice.shipping_charge} /></dd></div>
                                )}
                                {invoice.round_off !== 0 && (
                                    <div className="flex justify-between"><dt className="text-muted-foreground">Round off</dt><dd className="tabular-nums">₹<FormatAmount amount={invoice.round_off} /></dd></div>
                                )}
                                <Separator />
                                <div className="flex justify-between text-base font-bold"><dt>Grand Total</dt><dd className="tabular-nums text-primary">₹<FormatAmount amount={invoice.grand_total} /></dd></div>
                                <div className="flex justify-between"><dt className="text-muted-foreground">Paid</dt><dd className="tabular-nums">₹<FormatAmount amount={invoice.paid_amount} /></dd></div>
                                <div className="flex justify-between"><dt className={cn(invoice.due_amount > 0.009 ? "text-destructive font-medium" : "text-muted-foreground")}>Due</dt><dd className={cn("tabular-nums", invoice.due_amount > 0.009 && "text-destructive font-medium")}>₹<FormatAmount amount={invoice.due_amount} /></dd></div>
                            </dl>
                        </CardContent>
                    </Card>
                </div>

                <Card className="mt-4">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Items ({invoice.items.length})</CardTitle></CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto rounded-lg border border-border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead className="text-right">Qty</TableHead>
                                        <TableHead className="text-right">Rate</TableHead>
                                        <TableHead className="text-right">Taxable</TableHead>
                                        <TableHead className="text-right">Tax</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invoice.items.map((it) => (
                                        <TableRow key={it.id} className="align-top">
                                            <TableCell>
                                                <p className="flex items-center gap-1.5 font-medium">
                                                    {it.is_serialized ? <Smartphone className="size-3.5 text-muted-foreground" /> : <Package className="size-3.5 text-muted-foreground" />}
                                                    {it.product_name}
                                                    {it.is_margin_scheme && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px]">Margin</Badge>}
                                                </p>
                                                {it.sku && <p className="font-mono text-[11px] text-muted-foreground">{it.sku}{it.hsn_code ? ` · HSN ${it.hsn_code}` : ""}</p>}
                                                {it.warranty && <p className="text-[11px] text-muted-foreground">Warranty: <span className="font-medium text-foreground">{it.warranty}</span></p>}
                                                {it.units.length > 0 && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {it.units.map((u) => (
                                                            <span key={u.id} className="rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]" title={`${u.device_condition} · landed ₹${u.landed_cost}`}>
                                                                {u.imei1 || u.serial_number || `#${u.id}`}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                                {it.batch_allocations.length > 0 && (
                                                    <div className="mt-1 space-y-0.5">
                                                        {it.batch_allocations.map((b, bi) => (
                                                            <p key={bi} className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                                <Boxes className="size-3" /> {b.batch_number} × {b.qty}
                                                            </p>
                                                        ))}
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{it.qty}</TableCell>
                                            <TableCell className="text-right tabular-nums">₹<FormatAmount amount={it.unit_price} /></TableCell>
                                            <TableCell className="text-right tabular-nums">₹<FormatAmount amount={it.taxable_value} /></TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                ₹<FormatAmount amount={it.tax_amount} />
                                                <p className="text-[11px] text-muted-foreground">{it.tax_pct}%</p>
                                            </TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">₹<FormatAmount amount={it.line_total} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        {invoice.notes && (
                            <p className="mt-3 text-sm text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {invoice.notes}</p>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

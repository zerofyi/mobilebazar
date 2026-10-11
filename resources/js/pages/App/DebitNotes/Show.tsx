import React from "react";
import { Head, Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import {
    ArrowLeft, Building2, Phone, FileText, CalendarDays, UserRound,
    ReceiptText, Landmark, BadgePercent, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// Wayfinder route group for debit notes (generated from the `debit-notes`
// route group; regenerates on `npm run build`).
const dn = (app as any)["debit-notes"];

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebitNoteItem {
    id: number;
    product_name: string;
    sku: string | null;
    quantity: number;
    unit_cost: number;
    tax_pct: number;
    tax_amount: number;
    line_total: number;
}

interface DebitNote {
    id: number;
    uuid: string;
    debit_note_number: string;
    debit_note_date: string;
    status: string;
    reason: string;
    notes: string | null;
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    created_at: string | null;
    created_by: string | null;
    supplier: { name: string; phone: string | null; gstin: string | null } | null;
    purchase_order: { uuid: string; po_number: string; order_date: string | null; vendor_invoice_no: string | null } | null;
    items: DebitNoteItem[];
}

interface Props {
    debitNote: DebitNote;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="mt-1 text-sm font-medium">{children}</div>
        </div>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DebitNoteShow({ debitNote: d }: Props) {
    useFlashToast();

    return (
        <>
            <Head title={`Debit Note ${d.debit_note_number}`} />
            <div className="space-y-4 max-w-5xl">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Button variant="ghost" size="icon" asChild>
                            <Link href={dn.index.url()}><ArrowLeft className="size-4" /></Link>
                        </Button>
                        <div>
                            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
                                {d.debit_note_number}
                                <Badge variant="outline" className="capitalize">{d.status}</Badge>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Purchase return · {fmtDate(d.debit_note_date)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Document meta */}
                <Card>
                    <CardContent className="pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <Field label="Debit note date">
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="size-3.5 text-muted-foreground" /> {fmtDate(d.debit_note_date)}
                            </span>
                        </Field>
                        <Field label="Linked purchase">
                            {d.purchase_order ? (
                                <span>
                                    {d.purchase_order.po_number}
                                    {d.purchase_order.vendor_invoice_no && (
                                        <span className="block text-xs font-normal text-muted-foreground">
                                            Vendor inv: {d.purchase_order.vendor_invoice_no}
                                        </span>
                                    )}
                                </span>
                            ) : "—"}
                        </Field>
                        <Field label="Reason">
                            <span className="inline-flex items-center gap-1.5">
                                <FileText className="size-3.5 text-muted-foreground" /> {d.reason}
                            </span>
                        </Field>
                        <Field label="Issued by">
                            <span className="inline-flex items-center gap-1.5">
                                <UserRound className="size-3.5 text-muted-foreground" /> {d.created_by ?? "—"}
                            </span>
                        </Field>
                    </CardContent>
                </Card>

                {/* Supplier */}
                {d.supplier && (
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                                <Building2 className="size-4 text-muted-foreground" /> Supplier
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Field label="Name">{d.supplier.name}</Field>
                            <Field label="Phone">
                                <span className="inline-flex items-center gap-1.5">
                                    <Phone className="size-3.5 text-muted-foreground" /> {d.supplier.phone ?? "—"}
                                </span>
                            </Field>
                            <Field label="GSTIN">{d.supplier.gstin ?? "—"}</Field>
                        </CardContent>
                    </Card>
                )}

                {/* Items */}
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Package className="size-4 text-muted-foreground" /> Returned items ({d.items.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Unit cost</TableHead>
                                    <TableHead className="text-right">Tax %</TableHead>
                                    <TableHead className="text-right">Tax amount</TableHead>
                                    <TableHead className="text-right">Line total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {d.items.map((it) => (
                                    <TableRow key={it.id}>
                                        <TableCell className="font-medium">
                                            {it.product_name}
                                            {it.sku && <span className="block text-xs font-normal text-muted-foreground">SKU: {it.sku}</span>}
                                        </TableCell>
                                        <TableCell className="text-right">{it.quantity}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={it.unit_cost} /></TableCell>
                                        <TableCell className="text-right">{it.tax_pct}%</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={it.tax_amount} /></TableCell>
                                        <TableCell className="text-right font-medium whitespace-nowrap">₹<FormatAmount amount={it.line_total} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        <Separator className="my-4" />

                        <div className="flex justify-end">
                            <dl className="w-64 space-y-1.5 text-sm">
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground flex items-center gap-1.5">
                                        <Landmark className="size-3.5" /> Subtotal
                                    </dt>
                                    <dd className="font-medium">₹<FormatAmount amount={d.subtotal} /></dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-muted-foreground flex items-center gap-1.5">
                                        <BadgePercent className="size-3.5" /> ITC reversed
                                    </dt>
                                    <dd className="font-medium">₹<FormatAmount amount={d.tax_amount} /></dd>
                                </div>
                                <div className="flex justify-between text-base pt-1 border-t">
                                    <dt className="font-medium flex items-center gap-1.5">
                                        <ReceiptText className="size-4" /> Grand total
                                    </dt>
                                    <dd className="font-semibold">₹<FormatAmount amount={d.grand_total} /></dd>
                                </div>
                            </dl>
                        </div>

                        <p className="mt-4 text-xs text-muted-foreground">
                            Journal: Dr 2010 Accounts Payable / Cr 1040 Inventory / Cr 1050 ITC — entry JE-{d.debit_note_number}.
                        </p>
                    </CardContent>
                </Card>

                {d.notes && (
                    <Card>
                        <CardContent className="pt-4">
                            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                            <p className="text-sm whitespace-pre-wrap">{d.notes}</p>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}

DebitNoteShow.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Debit Notes", href: dn.index.url() },
        { title: "Debit Note", href: "#" },
    ],
};

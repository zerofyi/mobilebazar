import React from "react";
import { Head, Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import {
    Wallet, Plus, Building2, Phone, ArrowLeft,
    ShoppingCart, CircleCheck, AlertTriangle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/special/stat-card";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OutstandingPoRow {
    uuid: string;
    po_number: string;
    order_date: string | null;
    due_date: string | null;
    payment_status: string;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
}

export interface SupplierInfo {
    id: number;
    name: string | null;
    company_name: string | null;
    phone: string | null;
}

export interface OutstandingSummary {
    total_purchased: number;
    total_paid: number;
    total_due: number;
    overdue_count: number;
    overdue_total: number;
    open_count: number;
}

interface Props {
    supplier: SupplierInfo;
    summary: OutstandingSummary;
    overduePos: OutstandingPoRow[];
    openPos: OutstandingPoRow[];
}

// Wayfinder regenerates these route helpers at build time; bracket access mirrors
// the existing `app.loans['invoice-lookup']` pattern for hyphenated names.
// Plain URL helpers (wayfinder-free): stable under the /app prefix.
const spRoutes: Record<string, { url: (...args: string[]) => string }> = {
    index: { url: () => '/app/supplier-payments' },
    create: { url: () => '/app/supplier-payments/create' },
    store: { url: () => '/app/supplier-payments' },
};

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function PoTable({ rows, emptyText }: { rows: OutstandingPoRow[]; emptyText: string }) {
    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Order Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead className="text-right">Grand Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Due</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.length === 0 && (
                    <TableRow>
                        <TableCell colSpan={6} className="h-20 text-center text-muted-foreground">{emptyText}</TableCell>
                    </TableRow>
                )}
                {rows.map((po) => (
                    <TableRow key={po.uuid}>
                        <TableCell>
                            <Link href={`/app/purchases/${po.uuid}`} className="font-medium text-primary hover:underline">
                                {po.po_number}
                            </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(po.order_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(po.due_date)}</TableCell>
                        <TableCell className="text-right">₹<FormatAmount amount={po.grand_total} /></TableCell>
                        <TableCell className="text-right text-muted-foreground">₹<FormatAmount amount={po.paid_amount} /></TableCell>
                        <TableCell className="text-right font-semibold text-destructive">₹<FormatAmount amount={po.due_amount} /></TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupplierOutstanding({ supplier, summary, overduePos, openPos }: Props) {
    useFlashToast();
    const name = supplier.name || supplier.company_name || "Supplier";

    return (
        <>
            <Head title={`Outstanding — ${name}`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                        <Link href={spRoutes.index.url()}>
                            <Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button>
                        </Link>
                        <div>
                            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
                                <Building2 className="size-5 text-muted-foreground" />
                                {name}
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                {supplier.company_name && supplier.name ? `${supplier.company_name} · ` : ""}
                                {supplier.phone && (
                                    <span className="inline-flex items-center gap-1">
                                        <Phone className="size-3" />{supplier.phone}
                                    </span>
                                )}
                                {!supplier.phone && "Outstanding dues by purchase order"}
                            </p>
                        </div>
                    </div>
                    <Link href={`${spRoutes.create.url()}?supplier=${supplier.id}`}>
                        <Button className="gap-1.5">
                            <Plus className="size-4" /> Record Payment
                        </Button>
                    </Link>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard
                        title="Total Purchased"
                        icon={ShoppingCart}
                        variant="info"
                        value={<span className="text-2xl font-bold">₹<FormatAmount amount={summary.total_purchased} /></span>}
                        subtitle={`${summary.open_count} open orders`}
                    />
                    <StatCard
                        title="Total Paid"
                        icon={CircleCheck}
                        variant="success"
                        value={<span className="text-2xl font-bold">₹<FormatAmount amount={summary.total_paid} /></span>}
                        subtitle="paid to this supplier"
                    />
                    <StatCard
                        title="Total Due"
                        icon={Wallet}
                        variant={summary.total_due > 0 ? "warning" : "default"}
                        value={<span className="text-2xl font-bold">₹<FormatAmount amount={summary.total_due} /></span>}
                        subtitle="outstanding balance"
                    />
                    <StatCard
                        title="Overdue"
                        icon={AlertTriangle}
                        variant={summary.overdue_count > 0 ? "danger" : "default"}
                        value={<span className="text-2xl font-bold">₹<FormatAmount amount={summary.overdue_total} /></span>}
                        subtitle={`${summary.overdue_count} overdue orders`}
                    />
                </div>

                {/* Overdue */}
                {overduePos.length > 0 && (
                    <Card className="border-destructive/30">
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base text-destructive">
                                <Clock className="size-4" />
                                Overdue Orders
                                <Badge variant="destructive" className="ml-1">{overduePos.length}</Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <PoTable rows={overduePos} emptyText="Nothing overdue." />
                        </CardContent>
                    </Card>
                )}

                {/* All open */}
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">Open Orders</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <PoTable rows={openPos} emptyText="No open orders — nothing due." />
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

SupplierOutstanding.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Supplier Payments", href: spRoutes.index.url() },
        { title: "Outstanding", href: "#" },
    ],
};

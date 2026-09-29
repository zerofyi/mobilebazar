import React, { useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { ChevronRight, Plus, Search, Eye, Printer, ReceiptText, Wallet, Landmark, BadgePercent } from "lucide-react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/special/stat-card";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SaleListRow {
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
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    item_count: number;
    party: { type: "customer" | "supplier" | null; id: number | null; name: string; phone: string | null; gstin: string | null };
}

export interface Paginator<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
}

export interface SalesSummary {
    invoice_count: number;
    total_revenue: number;
    total_due: number;
    total_tax: number;
}

export interface SalesFilters {
    search?: string | null;
    payment_status?: string | null;
    date_from?: string | null;
    date_to?: string | null;
}

interface Props {
    sales: Paginator<SaleListRow>;
    summary: SalesSummary;
    filters: SalesFilters;
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

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SalesIndex({ sales, summary, filters }: Props) {
    useFlashToast();
    const [search, setSearch] = useState(filters.search ?? "");
    const [paymentStatus, setPaymentStatus] = useState(filters.payment_status ?? "all");
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? "");
    const [dateTo, setDateTo] = useState(filters.date_to ?? "");

    const applyFilters = (extra: Record<string, string | number | undefined> = {}) => {
        router.get(
            app.sales.index.url(),
            {
                search: search.trim() || undefined,
                payment_status: paymentStatus === "all" ? undefined : paymentStatus,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                ...extra,
            },
            { preserveState: true, replace: true }
        );
    };

    const pageLink = (page: number) => {
        const params = new URLSearchParams(window.location.search);
        params.set("page", String(page));
        return `${app.sales.index.url()}?${params.toString()}`;
    };

    return (
        <>
            <Head title="Sales" />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div>
                        <nav className="flex items-center space-x-1.5 text-xs text-muted-foreground font-medium">
                            <Link href={dashboard.url()} className="hover:text-foreground transition-colors">Dashboard</Link>
                            <ChevronRight className="size-3 text-muted-foreground/60" />
                            <span className="font-semibold text-foreground">Sales</span>
                        </nav>
                        <h1 className="mt-0.5 text-xl font-semibold">Sales</h1>
                    </div>
                    <Link href={app.sales.create.url()}>
                        <Button><Plus className="size-4 mr-1.5" /> New Sale</Button>
                    </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <StatCard title="Invoices" icon={ReceiptText} value={summary.invoice_count.toLocaleString("en-IN")} />
                    <StatCard title="Revenue" icon={Wallet} variant="success" value={<span>₹<FormatAmount amount={summary.total_revenue} /></span>} />
                    <StatCard title="Due" icon={Landmark} variant={summary.total_due > 0 ? "warning" : "default"} value={<span>₹<FormatAmount amount={summary.total_due} /></span>} />
                    <StatCard title="Tax Collected" icon={BadgePercent} variant="info" value={<span>₹<FormatAmount amount={summary.total_tax} /></span>} />
                </div>

                <Card className="mt-4">
                    <CardContent className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-52">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === "Enter") applyFilters({ page: 1 }); }}
                                    placeholder="Search invoice no. / customer…"
                                    className="pl-9"
                                />
                            </div>
                            <Select value={paymentStatus} onValueChange={(v) => { setPaymentStatus(v); }}>
                                <SelectTrigger className="w-36"><SelectValue placeholder="Payment" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All payments</SelectItem>
                                    <SelectItem value="paid">Paid</SelectItem>
                                    <SelectItem value="partial">Partial</SelectItem>
                                    <SelectItem value="unpaid">Unpaid</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" aria-label="From date" />
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" aria-label="To date" />
                            <Button onClick={() => applyFilters()}>Filter</Button>
                            <Button
                                variant="ghost"
                                onClick={() => { setSearch(""); setPaymentStatus("all"); setDateFrom(""); setDateTo(""); router.get(app.sales.index.url(), {}, { preserveState: true }); }}
                            >
                                Reset
                            </Button>
                        </div>

                        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Customer / Party</TableHead>
                                        <TableHead className="text-right">Items</TableHead>
                                        <TableHead className="text-right">Tax</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                        <TableHead className="text-right">Due</TableHead>
                                        <TableHead>Payment</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sales.data.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                                                No sales found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    {sales.data.map((s) => (
                                        <TableRow key={s.uuid}>
                                            <TableCell>
                                                <Link href={`/app/sales/${s.uuid}`} className="font-mono font-medium text-primary hover:underline">
                                                    {s.invoice_number}
                                                </Link>
                                                {!s.is_gst_billed && <Badge variant="outline" className="ml-1.5 text-[10px]">Non-GST</Badge>}
                                                {s.invoice_type === "wholesale" && <Badge variant="outline" className="ml-1.5 border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px]">Wholesale</Badge>}
                                            </TableCell>
                                            <TableCell className="whitespace-nowrap">{s.invoice_date}</TableCell>
                                            <TableCell>
                                                <p className="font-medium">{s.party?.name ?? "—"}</p>
                                                <p className="text-xs text-muted-foreground">
                                                    {s.party?.type === "supplier" ? "Party" : "Customer"}
                                                    {s.party?.phone ? ` · ${s.party.phone}` : ""}
                                                </p>
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">{s.item_count}</TableCell>
                                            <TableCell className="text-right tabular-nums">₹<FormatAmount amount={s.tax_amount} /></TableCell>
                                            <TableCell className="text-right font-semibold tabular-nums">₹<FormatAmount amount={s.grand_total} /></TableCell>
                                            <TableCell className={cn("text-right tabular-nums", s.due_amount > 0.009 ? "text-destructive font-medium" : "text-muted-foreground")}>
                                                ₹<FormatAmount amount={s.due_amount} />
                                            </TableCell>
                                            <TableCell>{statusBadge(s.payment_status)}</TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Link href={`/app/sales/${s.uuid}`}>
                                                        <Button variant="ghost" size="icon" className="size-8" aria-label="View"><Eye className="size-4" /></Button>
                                                    </Link>
                                                    <Link href={app.sales.print.url(s.uuid)}>
                                                        <Button variant="ghost" size="icon" className="size-8" aria-label="Print"><Printer className="size-4" /></Button>
                                                    </Link>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>

                        {sales.last_page > 1 && (
                            <Pagination className="mt-4">
                                <PaginationContent>
                                    {sales.current_page > 1 && (
                                        <PaginationItem>
                                            <PaginationPrevious href={pageLink(sales.current_page - 1)} />
                                        </PaginationItem>
                                    )}
                                    {Array.from({ length: sales.last_page }, (_, i) => i + 1)
                                        .filter((p) => p === 1 || p === sales.last_page || Math.abs(p - sales.current_page) <= 1)
                                        .map((p, i, arr) => (
                                            <React.Fragment key={p}>
                                                {i > 0 && arr[i - 1] !== p - 1 && <PaginationItem><span className="px-2 text-muted-foreground">…</span></PaginationItem>}
                                                <PaginationItem>
                                                    <PaginationLink href={pageLink(p)} isActive={p === sales.current_page}>{p}</PaginationLink>
                                                </PaginationItem>
                                            </React.Fragment>
                                        ))}
                                    {sales.current_page < sales.last_page && (
                                        <PaginationItem>
                                            <PaginationNext href={pageLink(sales.current_page + 1)} />
                                        </PaginationItem>
                                    )}
                                </PaginationContent>
                            </Pagination>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

import React, { useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import { usePermissions } from "@/hooks/user-permissions";
import {
    Wallet, Plus, Search, Landmark, Banknote, CreditCard, QrCode,
    ReceiptText, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/special/stat-card";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SupplierPaymentRow {
    id: number;
    uuid: string;
    amount: number;
    payment_mode: string;
    txn_reference: string | null;
    status: string;
    paid_at: string;
    po_number: string | null;
    po_uuid: string | null;
    vendor_name: string | null;
    recorded_by: string | null;
}

export interface Paginator<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from?: number | null;
    to?: number | null;
}

export interface SupplierPaymentsSummary {
    payment_count: number;
    total_paid: number;
}

export interface SupplierPaymentsFilters {
    search?: string | null;
    supplier_id?: string | null;
    payment_mode?: string | null;
    date_from?: string | null;
    date_to?: string | null;
}

export interface SupplierOption {
    id: number;
    name: string;
}

interface Props {
    payments: Paginator<SupplierPaymentRow>;
    summary: SupplierPaymentsSummary;
    filters: SupplierPaymentsFilters;
    suppliers: SupplierOption[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAYMENT_MODES = ["cash", "bank", "upi", "card", "neft", "rtgs", "imps", "cheque"] as const;

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ModeBadge({ mode }: { mode: string }) {
    const Icon = mode === "cash" ? Banknote : mode === "upi" ? QrCode : mode === "card" ? CreditCard : Landmark;
    return (
        <Badge variant="outline" className="gap-1 font-medium text-xs capitalize">
            <Icon className="size-3" />
            {mode}
        </Badge>
    );
}

// ─── Page ────────────────────────────────────────────────────────────────────

// Wayfinder regenerates these route helpers at build time; bracket access mirrors
// the existing `app.loans['invoice-lookup']` pattern for hyphenated names.
// Plain URL helpers (wayfinder-free): stable under the /app prefix.
const spRoutes: Record<string, { url: (...args: string[]) => string }> = {
    index: { url: () => '/app/supplier-payments' },
    create: { url: () => '/app/supplier-payments/create' },
    store: { url: () => '/app/supplier-payments' },
};

const sp = () => spRoutes;

export default function SupplierPaymentsIndex({ payments, summary, filters, suppliers }: Props) {
    useFlashToast();
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? "");
    const [supplierId, setSupplierId] = useState(filters.supplier_id ?? "all");
    const [paymentMode, setPaymentMode] = useState(filters.payment_mode ?? "all");
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? "");
    const [dateTo, setDateTo] = useState(filters.date_to ?? "");

    const currentParams = () => ({
        search: search.trim() || undefined,
        supplier_id: supplierId === "all" ? undefined : supplierId,
        payment_mode: paymentMode === "all" ? undefined : paymentMode,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
    });

    const applyFilters = (extra: Record<string, string | number | undefined> = {}) => {
        router.get(sp().index.url(), { ...currentParams(), ...extra }, { preserveState: true, replace: true });
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters({ page: 1 });
    };

    const resetFilters = () => {
        setSearch("");
        setSupplierId("all");
        setPaymentMode("all");
        setDateFrom("");
        setDateTo("");
        router.get(sp().index.url(), {}, { preserveState: true });
    };

    const pageLink = (page: number) => {
        const params = new URLSearchParams(window.location.search);
        params.set("page", String(page));
        return `${sp().index.url()}?${params.toString()}`;
    };

    const from = payments.from ?? (payments.current_page - 1) * payments.per_page + 1;
    const to = payments.to ?? Math.min(payments.current_page * payments.per_page, payments.total);

    return (
        <>
            <Head title="Supplier Payments" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Supplier Payments</h1>
                        <p className="text-sm text-muted-foreground">
                            Every payment made to vendors against purchase orders.
                        </p>
                    </div>
                    {can('supplier-payments.create') && (
                        <Link href={sp().create.url()}>
                            <Button className="gap-1.5">
                                <Plus className="size-4" /> Record Payment
                            </Button>
                        </Link>
                    )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                    <StatCard
                        title="Total Paid"
                        icon={Wallet}
                        variant="success"
                        value={<span className="text-2xl font-bold">₹<FormatAmount amount={summary.total_paid} /></span>}
                        subtitle="across the filtered payments"
                    />
                    <StatCard
                        title="Payments"
                        icon={ReceiptText}
                        variant="info"
                        value={<span className="text-2xl font-bold">{summary.payment_count}</span>}
                        subtitle="payment entries recorded"
                    />
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-4">
                        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-3">
                            <div className="relative min-w-52 flex-1">
                                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search PO number or reference…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                            <Select value={supplierId} onValueChange={(v) => { setSupplierId(v); applyFilters({ supplier_id: v === "all" ? undefined : v, page: 1 }); }}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Supplier" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All suppliers</SelectItem>
                                    {suppliers.map((s) => (
                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={paymentMode} onValueChange={(v) => { setPaymentMode(v); applyFilters({ payment_mode: v === "all" ? undefined : v, page: 1 }); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="Mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All modes</SelectItem>
                                    {PAYMENT_MODES.map((m) => (
                                        <SelectItem key={m} value={m} className="capitalize">{m}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
                            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
                            <Button type="submit" variant="secondary">Apply</Button>
                            <Button type="button" variant="ghost" size="icon" onClick={resetFilters} title="Reset filters">
                                <RotateCcw className="size-4" />
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="pb-2">
                        <div className="text-sm text-muted-foreground">
                            Showing <span className="font-medium text-foreground">{payments.total === 0 ? 0 : from}–{to}</span> of{" "}
                            <span className="font-medium text-foreground">{payments.total}</span> payments
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Paid On</TableHead>
                                    <TableHead>Purchase Order</TableHead>
                                    <TableHead>Vendor</TableHead>
                                    <TableHead>Mode</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {payments.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                                            No payments recorded yet.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {payments.data.map((p) => (
                                    <TableRow key={p.uuid}>
                                        <TableCell className="whitespace-nowrap">{fmtDate(p.paid_at)}</TableCell>
                                        <TableCell>
                                            {p.po_uuid ? (
                                                <Link
                                                    href={`/app/purchases/${p.po_uuid}`}
                                                    className="font-medium text-primary hover:underline"
                                                >
                                                    {p.po_number}
                                                </Link>
                                            ) : (
                                                <span className="font-medium">{p.po_number ?? "—"}</span>
                                            )}
                                        </TableCell>
                                        <TableCell>{p.vendor_name ?? "—"}</TableCell>
                                        <TableCell><ModeBadge mode={p.payment_mode} /></TableCell>
                                        <TableCell className="text-muted-foreground">{p.txn_reference ?? "—"}</TableCell>
                                        <TableCell className="text-right font-semibold">
                                            ₹<FormatAmount amount={p.amount} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {payments.last_page > 1 && (
                            <div className="flex items-center justify-center border-t border-border py-3">
                                <Pagination>
                                    <PaginationContent>
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href={pageLink(payments.current_page - 1)}
                                                className={cn("h-8 text-xs px-2.5", payments.current_page <= 1 && "pointer-events-none opacity-40")}
                                            />
                                        </PaginationItem>
                                        {Array.from({ length: payments.last_page }, (_, i) => i + 1)
                                            .filter((n) => n === 1 || n === payments.last_page || Math.abs(n - payments.current_page) <= 1)
                                            .map((n, i, arr) => (
                                                <React.Fragment key={n}>
                                                    {i > 0 && arr[i - 1] !== n - 1 && (
                                                        <PaginationItem><span className="px-1 text-muted-foreground">…</span></PaginationItem>
                                                    )}
                                                    <PaginationItem>
                                                        <PaginationLink
                                                            href={pageLink(n)}
                                                            isActive={n === payments.current_page}
                                                            className="h-8 min-w-8 text-xs"
                                                        >
                                                            {n}
                                                        </PaginationLink>
                                                    </PaginationItem>
                                                </React.Fragment>
                                            ))}
                                        <PaginationItem>
                                            <PaginationNext
                                                href={pageLink(payments.current_page + 1)}
                                                className={cn("h-8 text-xs px-2.5", payments.current_page >= payments.last_page && "pointer-events-none opacity-40")}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

SupplierPaymentsIndex.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Supplier Payments", href: spRoutes.index.url() },
    ],
};

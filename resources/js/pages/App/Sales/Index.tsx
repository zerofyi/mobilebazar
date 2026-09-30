import React, { useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import {
    ReceiptText, Wallet, Landmark, BadgePercent, Plus, Search, Eye, Printer,
    MoreVertical, CheckCircle2, Clock, AlertCircle, UserRound, Building2,
    Phone, BadgeCheck, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
    from?: number | null;
    to?: number | null;
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function PaymentBadge({ status }: { status: string }) {
    const isPaid = status === "paid";
    const isPartial = status === "partial";
    return (
        <Badge
            variant="outline"
            className={cn("gap-1 font-medium text-xs capitalize", {
                "text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400": isPaid,
                "text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400": isPartial,
                "text-muted-foreground border-border bg-muted/40": !isPaid && !isPartial,
            })}
        >
            {isPaid && <CheckCircle2 className="size-3" />}
            {isPartial && <Clock className="size-3" />}
            {!isPaid && !isPartial && <AlertCircle className="size-3" />}
            {status}
        </Badge>
    );
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

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        applyFilters({ page: 1 });
    };

    const handlePaymentStatusChange = (val: string) => {
        setPaymentStatus(val);
        router.get(
            app.sales.index.url(),
            {
                search: search.trim() || undefined,
                payment_status: val === "all" ? undefined : val,
                date_from: dateFrom || undefined,
                date_to: dateTo || undefined,
                page: 1,
            },
            { preserveState: true, replace: true }
        );
    };

    const resetFilters = () => {
        setSearch("");
        setPaymentStatus("all");
        setDateFrom("");
        setDateTo("");
        router.get(app.sales.index.url(), {}, { preserveState: true });
    };

    const pageLink = (page: number) => {
        const params = new URLSearchParams(window.location.search);
        params.set("page", String(page));
        return `${app.sales.index.url()}?${params.toString()}`;
    };

    const from = sales.from ?? (sales.current_page - 1) * sales.per_page + 1;
    const to = sales.to ?? Math.min(sales.current_page * sales.per_page, sales.total);

    return (
        <>
            <Head title="Sales" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <ReceiptText className="size-6 text-primary" />
                            Sales
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage invoices, collections, and customer receivables.
                        </p>
                    </div>
                    <Button asChild className="shadow-sm">
                        <Link href={app.sales.create.url()}>
                            <Plus className="mr-2 size-4" /> New Sale
                        </Link>
                    </Button>
                </div>

                {/* Summary Stats Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="Invoices"
                        value={summary.invoice_count.toLocaleString("en-IN")}
                        icon={ReceiptText}
                        subtitle="Bills raised"
                    />
                    <StatCard
                        title="Revenue"
                        value={<>₹<FormatAmount amount={summary.total_revenue} /></>}
                        icon={Wallet}
                        subtitle="Gross outward value"
                        variant="success"
                    />
                    <StatCard
                        title="Receivables"
                        value={<>₹<FormatAmount amount={summary.total_due} /></>}
                        icon={Landmark}
                        subtitle="Unpaid customer balance"
                        variant={summary.total_due > 0 ? "warning" : "default"}
                    />
                    <StatCard
                        title="Tax Collected"
                        value={<>₹<FormatAmount amount={summary.total_tax} /></>}
                        icon={BadgePercent}
                        subtitle="GST on outward supplies"
                        variant="info"
                    />
                </div>

                {/* Table Section */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            <div className="relative flex-1 min-w-50">
                                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search invoice no., customer, or phone…"
                                    className="pl-9 h-9 bg-muted/40 text-xs transition-colors focus:bg-background"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            {/* Payment Status Segmented Controls */}
                            <div className="flex h-9 items-center rounded-md border border-border bg-muted p-1 shrink-0">
                                {[
                                    { key: "all", label: "All Payments" },
                                    { key: "paid", label: "Paid" },
                                    { key: "partial", label: "Partial" },
                                    { key: "unpaid", label: "Unpaid" },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handlePaymentStatusChange(item.key)}
                                        className={cn(
                                            "flex h-full items-center justify-center rounded px-2.5 text-xs font-medium transition-all",
                                            paymentStatus === item.key
                                                ? "bg-background text-foreground shadow-sm font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="h-9 w-40 text-xs shrink-0"
                                aria-label="From date"
                            />
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="h-9 w-40 text-xs shrink-0"
                                aria-label="To date"
                            />
                            <Button type="submit" variant="secondary" size="sm" className="h-9 px-4 shrink-0">
                                Search
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-9 px-3 shrink-0" onClick={resetFilters}>
                                Reset
                            </Button>
                        </form>
                    </CardHeader>

                    <CardContent className="p-0 overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                    <TableHead className="text-xs font-semibold">Invoice & Date</TableHead>
                                    <TableHead className="text-xs font-semibold">Customer / Party</TableHead>
                                    <TableHead className="text-xs font-semibold">Cost Breakdown</TableHead>
                                    <TableHead className="text-xs font-semibold">Grand Total</TableHead>
                                    <TableHead className="text-xs font-semibold">Paid</TableHead>
                                    <TableHead className="text-xs font-semibold">Due</TableHead>
                                    <TableHead className="text-xs font-semibold">Payment</TableHead>
                                    <TableHead className="text-center w-12 text-xs font-semibold">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sales.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-20 text-muted-foreground">
                                            <ReceiptText className="size-10 mx-auto mb-3 opacity-20" />
                                            <p className="font-medium text-foreground">No sales found</p>
                                            <p className="text-sm">Try adjusting your search or filters.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sales.data.map((s, index) => {
                                        const serialNumber = from + index;
                                        const loanable = s.due_amount > 0.009 && s.party?.type === "customer";
                                        const loanBlockReason = s.due_amount <= 0.009
                                            ? "No due amount on this invoice"
                                            : "Loans need a customer party";

                                        return (
                                            <TableRow key={s.uuid} className="group transition-colors hover:bg-muted/20">
                                                <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                    {serialNumber}
                                                </TableCell>

                                                <TableCell>
                                                    <Link
                                                        href={`/app/sales/${s.uuid}`}
                                                        className="font-bold text-primary hover:underline underline-offset-4 decoration-primary/50 text-sm tracking-tight flex items-center gap-1"
                                                    >
                                                        {s.invoice_number}
                                                        <ArrowUpRight className="size-3 text-muted-foreground/50" />
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <Clock className="size-3 opacity-60" />{fmtDate(s.invoice_date)}
                                                        {!s.is_gst_billed && (
                                                            <Badge variant="outline" className="ml-1 text-[10px]">Non-GST</Badge>
                                                        )}
                                                        {s.invoice_type === "wholesale" && (
                                                            <Badge variant="outline" className="ml-1 border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px]">
                                                                Wholesale
                                                            </Badge>
                                                        )}
                                                    </p>
                                                </TableCell>

                                                <TableCell>
                                                    <HoverCard openDelay={200} closeDelay={100}>
                                                        <HoverCardTrigger asChild>
                                                            <div className="flex flex-col cursor-help w-max">
                                                                <div className="flex items-center gap-1.5 group-hover/trigger:text-primary transition-colors">
                                                                    {s.party?.type === "supplier" ? (
                                                                        <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                                                                    ) : (
                                                                        <UserRound className="size-3.5 text-muted-foreground shrink-0" />
                                                                    )}
                                                                    <span className="font-semibold text-sm underline decoration-muted-foreground/30 underline-offset-4">
                                                                        {s.party?.name ?? "—"}
                                                                    </span>
                                                                </div>
                                                                <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                                                                    {s.party?.gstin ? `GSTIN: ${s.party.gstin}` : s.party?.type === "supplier" ? "Party" : "Customer"}
                                                                </p>
                                                            </div>
                                                        </HoverCardTrigger>
                                                        <HoverCardContent className="w-80 p-4 shadow-lg border-primary/20" align="start">
                                                            <div className="space-y-2">
                                                                <div className="flex items-center gap-2">
                                                                    {s.party?.type === "supplier" ? (
                                                                        <Building2 className="size-5 text-primary" />
                                                                    ) : (
                                                                        <UserRound className="size-5 text-primary" />
                                                                    )}
                                                                    <div>
                                                                        <h4 className="text-sm font-bold text-foreground leading-none">{s.party?.name ?? "—"}</h4>
                                                                        <p className="text-xs text-muted-foreground capitalize mt-1">
                                                                            Type: {s.party?.type === "supplier" ? "Party" : "Customer"}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {s.party?.phone && (
                                                                    <div className="flex items-center text-xs text-muted-foreground pt-1 border-t border-border/40">
                                                                        <Phone className="mr-1.5 size-3" />
                                                                        {s.party.phone}
                                                                    </div>
                                                                )}
                                                                {s.party?.gstin && (
                                                                    <div className="flex items-center text-xs text-muted-foreground">
                                                                        <BadgeCheck className="mr-1.5 size-3 text-primary" />
                                                                        {s.party.gstin}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </HoverCardContent>
                                                    </HoverCard>
                                                </TableCell>

                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-foreground">₹<FormatAmount amount={s.subtotal} /></span>
                                                        {s.is_gst_billed && s.tax_amount > 0 && (
                                                            <span className="text-xs text-primary">+ ₹<FormatAmount amount={s.tax_amount} /></span>
                                                        )}
                                                        {s.discount_amount > 0 && (
                                                            <span className="text-xs text-destructive">- ₹<FormatAmount amount={s.discount_amount} /></span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground mt-0.5">{s.item_count} item{s.item_count !== 1 ? "s" : ""}</p>
                                                </TableCell>

                                                <TableCell className="font-semibold text-sm text-primary">
                                                    ₹<FormatAmount amount={s.grand_total} />
                                                </TableCell>

                                                <TableCell className="text-xs text-muted-foreground">
                                                    ₹<FormatAmount amount={s.paid_amount} />
                                                </TableCell>

                                                <TableCell>
                                                    {s.due_amount > 0.009 ? (
                                                        <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                                                            ₹<FormatAmount amount={s.due_amount} />
                                                        </span>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground/60">0.00</span>
                                                    )}
                                                </TableCell>

                                                <TableCell>
                                                    <PaymentBadge status={s.payment_status} />
                                                </TableCell>

                                                <TableCell className="text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-foreground hover:text-primary transition-colors cursor-pointer"
                                                        onClick={() => window.open(app.sales.print.url(s.uuid), "_blank", "noopener,noreferrer")}
                                                    >
                                                        <Printer className="size-4 text-muted-foreground" />
                                                        <span className="sr-only">Print</span>
                                                    </Button>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="size-8">
                                                                <MoreVertical className="size-4" />
                                                                <span className="sr-only">Actions</span>
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44">
                                                            <DropdownMenuItem asChild>
                                                                <Link href={`/app/sales/${s.uuid}`} className="cursor-pointer text-xs">
                                                                    <Eye className="mr-2 size-4 text-muted-foreground" /> View Details
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem asChild>
                                                                <Link href={app.sales.print.url(s.uuid)} className="cursor-pointer text-xs">
                                                                    <Printer className="mr-2 size-4 text-muted-foreground" /> Print
                                                                </Link>
                                                            </DropdownMenuItem>
                                                            <DropdownMenuSeparator />
                                                            {loanable ? (
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/app/loans/create?invoice=${s.uuid}`} className="cursor-pointer text-xs">
                                                                        <Landmark className="mr-2 size-4 text-muted-foreground" /> Apply for Loan
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            ) : (
                                                                <DropdownMenuItem disabled className="text-xs" title={loanBlockReason}>
                                                                    <Landmark className="mr-2 size-4" /> Apply for Loan
                                                                </DropdownMenuItem>
                                                            )}
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>

                    {/* Pagination */}
                    {sales.last_page > 1 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
                            <p className="text-xs text-muted-foreground">
                                Showing <span className="font-medium text-foreground">{sales.total === 0 ? 0 : from}</span> to{" "}
                                <span className="font-medium text-foreground">{to}</span> of{" "}
                                <span className="font-medium text-foreground">{sales.total}</span> sales
                            </p>
                            <Pagination className="w-auto mx-0">
                                <PaginationContent className="gap-1">
                                    <PaginationItem>
                                        <PaginationPrevious
                                            href={pageLink(sales.current_page - 1)}
                                            className={cn("h-8 text-xs px-2.5", sales.current_page <= 1 && "pointer-events-none opacity-40")}
                                        />
                                    </PaginationItem>
                                    {Array.from({ length: sales.last_page }, (_, i) => i + 1)
                                        .filter((p) => p === 1 || p === sales.last_page || Math.abs(p - sales.current_page) <= 1)
                                        .map((p, i, arr) => (
                                            <React.Fragment key={p}>
                                                {i > 0 && arr[i - 1] !== p - 1 && (
                                                    <PaginationItem><span className="px-2 text-muted-foreground">…</span></PaginationItem>
                                                )}
                                                <PaginationItem>
                                                    <PaginationLink href={pageLink(p)} isActive={p === sales.current_page} className="h-8 w-8 text-xs">
                                                        {p}
                                                    </PaginationLink>
                                                </PaginationItem>
                                            </React.Fragment>
                                        ))}
                                    <PaginationItem>
                                        <PaginationNext
                                            href={pageLink(sales.current_page + 1)}
                                            className={cn("h-8 text-xs px-2.5", sales.current_page >= sales.last_page && "pointer-events-none opacity-40")}
                                        />
                                    </PaginationItem>
                                </PaginationContent>
                            </Pagination>
                        </div>
                    )}
                </Card>
            </div>
        </>
    );
}

SalesIndex.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Sales", href: app.sales.index.url() },
    ],
};

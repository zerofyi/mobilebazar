import React, { useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import { usePermissions } from "@/hooks/user-permissions";
import {
    ReceiptText, Wallet, BadgePercent, Plus, Search, Eye, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { StatCard } from "@/components/special/stat-card";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

// Wayfinder route group for debit notes (generated from the `debit-notes`
// route group; regenerates on `npm run build`).
// Plain URL helpers (wayfinder-free): stable under the /app prefix.
const dn: Record<string, { url: (...args: string[]) => string }> = {
    index: { url: () => '/app/debit-notes' },
    create: { url: () => '/app/debit-notes/create' },
    store: { url: () => '/app/debit-notes' },
    show: { url: (uuid: string) => `/app/debit-notes/${uuid}` },
    'purchases.search': { url: () => '/app/debit-notes/purchases/search' },
    'purchase-stock': { url: (uuid: string) => `/app/debit-notes/purchase-stock/${uuid}` },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DebitNoteListRow {
    id: number;
    uuid: string;
    debit_note_number: string;
    debit_note_date: string;
    status: string;
    reason: string;
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    item_count: number;
    supplier_name: string;
    po_number: string | null;
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

export interface DebitNotesSummary {
    note_count: number;
    total_returned: number;
    total_tax_reversed: number;
}

export interface DebitNotesFilters {
    search?: string | null;
    date_from?: string | null;
    date_to?: string | null;
}

interface Props {
    notes: Paginator<DebitNoteListRow>;
    summary: DebitNotesSummary;
    filters: DebitNotesFilters;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DebitNotesIndex({ notes, summary, filters }: Props) {
    useFlashToast();
    const { can } = usePermissions();
    const [search, setSearch] = useState(filters.search ?? "");
    const [dateFrom, setDateFrom] = useState(filters.date_from ?? "");
    const [dateTo, setDateTo] = useState(filters.date_to ?? "");

    const applyFilters = () => {
        router.get(
            dn.index.url(),
            { search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined },
            { preserveState: true, replace: true },
        );
    };

    const pageUrl = (page: number) => {
        const params = new URLSearchParams();
        params.set("page", String(page));
        if (search) params.set("search", search);
        if (dateFrom) params.set("date_from", dateFrom);
        if (dateTo) params.set("date_to", dateTo);
        return `${dn.index.url()}?${params.toString()}`;
    };

    return (
        <>
            <Head title="Debit Notes" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Purchase Returns</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Debit notes issued against supplier purchases. Stock is removed and ITC reversed on posting.
                        </p>
                    </div>
                    {can('debit-notes.create') && (
                        <Button asChild className="shadow-sm">
                            <Link href={dn.create.url()}>
                                <Plus className="mr-2 size-4" /> New Return
                            </Link>
                        </Button>
                    )}
                </div>

                {/* Summary Stats Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <StatCard
                        title="Debit Notes"
                        value={summary.note_count.toLocaleString("en-IN")}
                        icon={ReceiptText}
                        subtitle="Returns issued"
                    />
                    <StatCard
                        title="Value Returned"
                        value={<>₹<FormatAmount amount={summary.total_returned} /></>}
                        icon={Wallet}
                        subtitle="AP reduced"
                        variant="info"
                    />
                    <StatCard
                        title="ITC Reversed"
                        value={<>₹<FormatAmount amount={summary.total_tax_reversed} /></>}
                        icon={BadgePercent}
                        subtitle="Input tax given back"
                        variant={summary.total_tax_reversed > 0 ? "warning" : "default"}
                    />
                </div>

                {/* Filters */}
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="relative flex-1 min-w-56">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                                    placeholder="Search DN number, supplier, PO, reason…"
                                    className="pl-9"
                                />
                            </div>
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                                className="w-auto"
                                aria-label="From date"
                            />
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                                className="w-auto"
                                aria-label="To date"
                            />
                            <Button onClick={applyFilters}>Apply</Button>
                            <Button
                                variant="ghost"
                                onClick={() => {
                                    setSearch("");
                                    setDateFrom("");
                                    setDateTo("");
                                    router.get(dn.index.url(), {}, { preserveState: true, replace: true });
                                }}
                            >
                                Clear
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Table */}
                <Card>
                    <CardHeader className="py-3">
                        <p className="text-sm text-muted-foreground">
                            Showing {notes.from ?? 0}–{notes.to ?? 0} of {notes.total.toLocaleString("en-IN")} debit notes
                        </p>
                    </CardHeader>
                    <CardContent className="pt-0 overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Debit Note</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Supplier</TableHead>
                                    <TableHead>Purchase</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead className="text-right">Subtotal</TableHead>
                                    <TableHead className="text-right">Tax</TableHead>
                                    <TableHead className="text-right">Grand Total</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {notes.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                                            No debit notes yet. Issue one from a supplier purchase.
                                        </TableCell>
                                    </TableRow>
                                )}
                                {notes.data.map((n) => (
                                    <TableRow key={n.id}>
                                        <TableCell className="font-medium whitespace-nowrap">
                                            <Link href={dn.show.url(n.uuid)} className="text-primary hover:underline">
                                                {n.debit_note_number}
                                            </Link>
                                            <span className="ml-2 text-xs text-muted-foreground">{n.item_count} item{n.item_count === 1 ? "" : "s"}</span>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap">{fmtDate(n.debit_note_date)}</TableCell>
                                        <TableCell>
                                            <span className="inline-flex items-center gap-1.5">
                                                <Building2 className="size-3.5 text-muted-foreground" />
                                                {n.supplier_name}
                                            </span>
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-muted-foreground">{n.po_number ?? "—"}</TableCell>
                                        <TableCell className="max-w-48 truncate" title={n.reason}>{n.reason}</TableCell>
                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={n.subtotal} /></TableCell>
                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={n.tax_amount} /></TableCell>
                                        <TableCell className="text-right font-medium whitespace-nowrap">₹<FormatAmount amount={n.grand_total} /></TableCell>
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="icon" asChild title="View">
                                                <Link href={dn.show.url(n.uuid)}>
                                                    <Eye className="size-4" />
                                                </Link>
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>

                        {notes.last_page > 1 && (
                            <div className="mt-4 flex justify-center">
                                <Pagination>
                                    <PaginationContent>
                                        {notes.current_page > 1 && (
                                            <PaginationItem>
                                                <PaginationPrevious href={pageUrl(notes.current_page - 1)} />
                                            </PaginationItem>
                                        )}
                                        {Array.from({ length: notes.last_page }, (_, i) => i + 1)
                                            .filter((p) => p === 1 || p === notes.last_page || Math.abs(p - notes.current_page) <= 2)
                                            .map((p, i, arr) => (
                                                <React.Fragment key={p}>
                                                    {i > 0 && arr[i - 1] !== p - 1 && (
                                                        <PaginationItem><span className="px-2 text-muted-foreground">…</span></PaginationItem>
                                                    )}
                                                    <PaginationItem>
                                                        <PaginationLink href={pageUrl(p)} isActive={p === notes.current_page}>
                                                            {p}
                                                        </PaginationLink>
                                                    </PaginationItem>
                                                </React.Fragment>
                                            ))}
                                        {notes.current_page < notes.last_page && (
                                            <PaginationItem>
                                                <PaginationNext href={pageUrl(notes.current_page + 1)} />
                                            </PaginationItem>
                                        )}
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

DebitNotesIndex.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Debit Notes", href: dn.index.url() },
    ],
};

import React, { useState, useCallback } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';
import { usePermissions } from '@/hooks/user-permissions';

import {
    ShoppingCart, Plus, Search, Building2, UserRound, Eye,
    TrendingUp, AlertCircle, CheckCircle2, Clock, MapPin, Phone,
    Layers, Wallet, ArrowUpRight, BadgeCheck, FileText, CalendarClock,
    Receipt, MoreVertical, Edit, Trash2, Printer
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { FormatAmount } from '@/components/special/format-amount';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchaseItem {
    id: number;
    uuid: string;
    po_number: string;
    vendor_invoice_no: string | null;
    bill_type: 'po' | 'pv';
    is_gst_billed: boolean;
    is_intra_state: boolean;
    order_date: string;
    due_date: string | null;
    status: 'draft' | 'pending' | 'completed' | string;
    payment_status: 'paid' | 'partial' | 'unpaid' | string;
    payment_mode: string | null;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    shipping_charge: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    item_count: number;
    vendor: {
        id: number;
        name: string;
        type: 'supplier' | 'customer';
        phone: string | null;
        gstin: string | null;
        address?: {
            village_or_area?: string;
            district?: string;
        };
    } | null;
}

interface PaginationLinkItem {
    url: string | null;
    label: string;
    active: boolean;
}

interface PaginatedPurchases {
    data: PurchaseItem[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: PaginationLinkItem[];
}

interface Props {
    purchases?: PaginatedPurchases;
    filters: {
        search?: string;
        status?: string;
        bill_type?: string;
        payment_status?: string;
        party_type?: string;
    };
    summary?: {
        total_count: number;
        total_spend: number;
        total_due: number;
        overdue_due: number;
        itc_claimable: number;
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
    const isCompleted = status === 'completed';
    const isPending = status === 'pending';
    const isDraft = status === 'draft';

    return (
        <Badge
            variant="outline"
            className={cn('gap-1 font-medium text-xs capitalize', {
                'text-emerald-700 border-emerald-400/40 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400': isCompleted,
                'text-amber-700 border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400': isPending,
                'text-muted-foreground border-border bg-muted/40': isDraft,
            })}
        >
            {isCompleted && <CheckCircle2 className="size-3" />}
            {isPending && <Clock className="size-3" />}
            {isDraft && <FileText className="size-3" />}
            {/* {status} */}
        </Badge>
    );
}

function TableSkeletonRow() {
    return (
        <TableRow>
            <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
            <TableCell><Skeleton className="h-4 w-28 mb-1" /><Skeleton className="h-3 w-20" /></TableCell>
            <TableCell><Skeleton className="h-4 w-32 mb-1" /><Skeleton className="h-3 w-24" /></TableCell>
            <TableCell><Skeleton className="h-10 w-40" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
            <TableCell className="text-center"><Skeleton className="h-7 w-7 mx-auto rounded-md" /></TableCell>
        </TableRow>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Index({ purchases: purchaseList, filters, summary }: Props) {
    const { can } = usePermissions();

    const [search, setSearch] = useState(filters.search || '');
    const [status, setStatus] = useState(filters.status || 'all');
    const [billType, setBillType] = useState(filters.bill_type || 'all');
    const [paymentStatus, setPaymentStatus] = useState(filters.payment_status || 'all');

    const updateFilters = useCallback((newSearch: string, newStatus: string, newBillType: string, newPaymentStatus: string) => {
        router.get(app.purchases.index.url(), {
            search: newSearch || undefined,
            status: newStatus !== 'all' ? newStatus : undefined,
            bill_type: newBillType !== 'all' ? newBillType : undefined,
            payment_status: newPaymentStatus !== 'all' ? newPaymentStatus : undefined,
        }, { preserveState: true, replace: true });
    }, []);

    const handleSearch = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        updateFilters(search, status, billType, paymentStatus);
    }, [search, status, billType, paymentStatus, updateFilters]);

    const handleStatusChange = useCallback((val: string) => {
        setStatus(val);
        updateFilters(search, val, billType, paymentStatus);
    }, [search, billType, paymentStatus, updateFilters]);

    const handleBillTypeChange = useCallback((val: string) => {
        setBillType(val);
        updateFilters(search, status, val, paymentStatus);
    }, [search, status, paymentStatus, updateFilters]);

    const handlePaymentStatusChange = useCallback((val: string) => {
        setPaymentStatus(val);
        updateFilters(search, status, billType, val);
    }, [search, status, billType, updateFilters]);

    const handleDelete = useCallback((uuid: string) => {
        if (confirm('Are you sure you want to delete this purchase order? This action cannot be undone.')) {
            router.delete(app.purchases.destroy ? app.purchases.destroy.url(uuid) : `/purchases/${uuid}`, {
                preserveState: true,
            });
        }
    }, []);

    const loadingStats = !summary;
    const loadingList = !purchaseList;

    return (
        <>
            <Head title="Purchases" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <ShoppingCart className="size-6 text-primary" />
                            Purchase Orders
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage stock receipts, accounts payable, and vendor tax invoices.
                        </p>
                    </div>
                    {can('purchases.create') && (
                        <Button asChild className="shadow-sm">
                            <Link href={app.purchases.create.url()}>
                                <Plus className="mr-2 size-4" /> New Purchase
                            </Link>
                        </Button>
                    )}
                </div>

                {/* Summary Stats Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <StatCard
                        title="Filtered Orders"
                        value={summary?.total_count ?? 0}
                        icon={Layers}
                        subtitle="Matching criteria"
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Total Spend"
                        value={<>₹<FormatAmount amount={summary?.total_spend ?? 0} /></>}
                        icon={Wallet}
                        subtitle="Gross inward value"
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Accounts Payable"
                        value={<>₹<FormatAmount amount={summary?.total_due ?? 0} /></>}
                        icon={TrendingUp}
                        subtitle="Unpaid balance to vendors"
                        variant={(summary?.total_due ?? 0) > 0 ? "warning" : "default"}
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Overdue Payables"
                        value={<>₹<FormatAmount amount={summary?.overdue_due ?? 0} /></>}
                        icon={AlertCircle}
                        subtitle="Past due payment date"
                        variant={(summary?.overdue_due ?? 0) > 0 ? "danger" : "default"}
                        loading={loadingStats}
                    />
                    <StatCard
                        title="Claimable GST (ITC)"
                        value={<>₹<FormatAmount amount={summary?.itc_claimable ?? 0} /></>}
                        icon={Receipt}
                        subtitle="Input Tax Credit in GSTR-3B"
                        variant="success"
                        loading={loadingStats}
                    />
                </div>

                {/* Table Section */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleSearch} className="flex items-center gap-2 flex-nowrap overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            {/* Search Input */}
                            <div className="relative flex-1 min-w-50">
                                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    placeholder="Search PO #, vendor bill no, supplier, or GSTIN…"
                                    className="pl-9 h-9 bg-muted/40 text-xs transition-colors focus:bg-background"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>

                            {/* Status Segmented Controls */}
                            <div className="flex h-9 items-center rounded-md border border-border bg-muted p-1 shrink-0">
                                {[
                                    { key: 'all', label: 'All Orders' },
                                    { key: 'completed', label: 'Completed' },
                                    { key: 'pending', label: 'Pending' },
                                    { key: 'draft', label: 'Drafts' },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handleStatusChange(item.key)}
                                        className={cn(
                                            "flex h-full items-center justify-center rounded px-2.5 text-xs font-medium transition-all",
                                            status === item.key
                                                ? "bg-background text-foreground shadow-sm font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            {/* Bill Type Segmented Controls */}
                            <div className="flex h-9 items-center rounded-md border border-border bg-muted p-1 shrink-0">
                                {[
                                    { key: 'all', label: 'All Types' },
                                    { key: 'po', label: 'PO (Tax B2B)' },
                                    { key: 'pv', label: 'PV (Voucher)' },
                                ].map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => handleBillTypeChange(item.key)}
                                        className={cn(
                                            "flex h-full items-center justify-center rounded px-2.5 text-xs font-medium transition-all",
                                            billType === item.key
                                                ? "bg-background text-foreground shadow-sm font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>

                            {/* Payment Status Segmented Controls */}
                            <div className="flex h-9 items-center rounded-md border border-border bg-muted p-1 shrink-0">
                                {[
                                    { key: 'all', label: 'All Payments' },
                                    { key: 'paid', label: 'Paid' },
                                    { key: 'partial', label: 'Partial' },
                                    { key: 'unpaid', label: 'Unpaid' },
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

                            <Button type="submit" variant="secondary" size="sm" className="h-9 px-4 shrink-0">
                                Search
                            </Button>
                        </form>
                    </CardHeader>

                    <CardContent className="p-0 overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                    <TableHead className="text-xs font-semibold">PO Number & Date</TableHead>
                                    <TableHead className="text-xs font-semibold">Vendor Entity</TableHead>
                                    <TableHead className="text-xs font-semibold">Cost Breakdown</TableHead>
                                    <TableHead className="text-xs font-semibold">Grand Total</TableHead>
                                    <TableHead className="text-xs font-semibold">Paid</TableHead>
                                    <TableHead className="text-xs font-semibold">Due</TableHead>
                                    <TableHead className="text-xs font-semibold">Status</TableHead>
                                    <TableHead className="text-center w-12 text-xs font-semibold">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loadingList ? (
                                    Array.from({ length: 5 }).map((_, i) => <TableSkeletonRow key={i} />)
                                ) : purchaseList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-20 text-muted-foreground">
                                            <ShoppingCart className="size-10 mx-auto mb-3 opacity-20" />
                                            <p className="font-medium text-foreground">No purchase records found</p>
                                            <p className="text-sm">Try adjusting your search or filters.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    purchaseList.data.map((item, index) => {
                                        const serialNumber = ((purchaseList?.from ?? 1)) + index;
                                        const isOverdue = item.due_date && item.due_amount > 0 && new Date(item.due_date) < new Date();

                                        return (
                                            <TableRow
                                                key={item.id}
                                                className={cn(
                                                    'group transition-colors',
                                                    isOverdue && 'bg-destructive/5 hover:bg-destructive/10',
                                                    !isOverdue && 'hover:bg-muted/20'
                                                )}
                                            >
                                                {/* Serial */}
                                                <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                    {serialNumber}
                                                </TableCell>

                                                {/* PO Number & Date */}
                                                <TableCell>
                                                    <Link
                                                        href={app.purchases.show.url(item.uuid)}
                                                        className="font-bold text-primary hover:underline underline-offset-4 decoration-primary/50 text-sm tracking-tight flex items-center gap-1"
                                                    >
                                                        {item.po_number}
                                                        <ArrowUpRight className="size-3 text-muted-foreground/50" />
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                        <Clock className="size-3 opacity-60" />{fmtDate(item.order_date)}
                                                        {item.vendor_invoice_no && (
                                                            <span className="text-muted-foreground/80 pl-1 border-l border-border/60">
                                                                Ref: {item.vendor_invoice_no}
                                                            </span>
                                                        )}
                                                    </p>
                                                </TableCell>

                                                {/* Vendor Entity with HoverCard */}
                                                <TableCell>
                                                    {item.vendor ? (
                                                        <HoverCard openDelay={200} closeDelay={100}>
                                                            <HoverCardTrigger asChild>
                                                                <div className="flex flex-col cursor-help w-max">
                                                                    <div className="flex items-center gap-1.5 group-hover/trigger:text-primary transition-colors">
                                                                        {item.vendor.type === 'supplier' ? (
                                                                            <Building2 className="size-3.5 text-muted-foreground shrink-0" />
                                                                        ) : (
                                                                            <UserRound className="size-3.5 text-muted-foreground shrink-0" />
                                                                        )}
                                                                        <span className="font-semibold text-sm underline decoration-muted-foreground/30 underline-offset-4">
                                                                            {item.vendor.name}
                                                                        </span>
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground mt-0.5 pl-5">
                                                                        {item.vendor.gstin ? `GSTIN: ${item.vendor.gstin}` : 'Unregistered Vendor'}
                                                                    </p>
                                                                </div>
                                                            </HoverCardTrigger>
                                                            <HoverCardContent className="w-80 p-4 shadow-lg border-primary/20" align="start">
                                                                <div className="space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        {item.vendor.type === 'supplier' ? (
                                                                            <Building2 className="size-5 text-primary" />
                                                                        ) : (
                                                                            <UserRound className="size-5 text-primary" />
                                                                        )}
                                                                        <div>
                                                                            <h4 className="text-sm font-bold text-foreground leading-none">{item.vendor.name}</h4>
                                                                            <p className="text-xs text-muted-foreground capitalize mt-1">Type: {item.vendor.type}</p>
                                                                        </div>
                                                                    </div>
                                                                    {item.vendor.phone && (
                                                                        <div className="flex items-center text-xs text-muted-foreground pt-1 border-t border-border/40">
                                                                            <Phone className="mr-1.5 size-3" />
                                                                            {item.vendor.phone}
                                                                        </div>
                                                                    )}
                                                                    {item.vendor.gstin && (
                                                                        <div className="flex items-center text-xs text-muted-foreground">
                                                                            <BadgeCheck className="mr-1.5 size-3 text-primary" />
                                                                            {item.vendor.gstin}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </HoverCardContent>
                                                        </HoverCard>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground italic">Direct Purchase</span>
                                                    )}
                                                </TableCell>

                                                {/* Clear Stacked Cost Breakdown */}
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <span className="text-xs text-foreground">₹<FormatAmount amount={item.subtotal} /></span>
                                                        {item.is_gst_billed && item.tax_amount > 0 && (
                                                            <span className="text-xs text-primary">+ ₹<FormatAmount amount={item.tax_amount} /></span>
                                                        )}
                                                        {item.discount_amount > 0 && (
                                                            <span className="text-xs text-destructive">- ₹<FormatAmount amount={item.discount_amount} /></span>
                                                        )}
                                                        {item.shipping_charge > 0 && (
                                                            <span className="text-xs text-amber-600 dark:text-amber-400">+ ₹<FormatAmount amount={item.shipping_charge} /></span>
                                                        )}
                                                    </div>
                                                </TableCell>

                                                {/* Grand Total */}
                                                <TableCell className="font-semibold text-sm text-primary">
                                                    ₹<FormatAmount amount={item.grand_total} />
                                                </TableCell>

                                                {/* Paid Amount */}
                                                <TableCell className="text-xs text-muted-foreground">
                                                    ₹<FormatAmount amount={item.paid_amount} />
                                                </TableCell>

                                                {/* Due Amount with Overdue Date */}
                                                <TableCell>
                                                    {item.due_amount > 0 ? (
                                                        <div>
                                                            <span className={cn("text-xs font-bold", isOverdue ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                                                                ₹<FormatAmount amount={item.due_amount} />
                                                            </span>
                                                            {item.due_date && (
                                                                <span className={cn("block text-[11px] mt-0.5", isOverdue ? "text-destructive font-semibold" : "text-muted-foreground")}>
                                                                    <CalendarClock className="inline size-3 mr-0.5 opacity-70" />
                                                                    {fmtDate(item.due_date)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground/60">0.00</span>
                                                    )}
                                                </TableCell>

                                                {/* Order Status */}
                                                <TableCell>
                                                    <StatusBadge status={item.status} />
                                                </TableCell>

                                                {/* Actions: 3-Dots Menu with Spatie Permissions */}
                                                <TableCell className="text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon" // or size="sm" if you want padding/text later
                                                        className="h-8 w-8 text-foreground hover:text-primary transition-colors cursor-pointer"
                                                        onClick={() => window.open(app.purchases.print.url(item.uuid), "_blank", "noopener,noreferrer")}
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
                                                        <DropdownMenuContent align="end" className="w-40">
                                                            {can('purchases.view') && (
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={app.purchases.show.url(item.uuid)} className="cursor-pointer text-xs">
                                                                        <Eye className="mr-2 size-4 text-muted-foreground" /> View Details
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            )}

                                                            {(can('purchases.update') || can('purchases.delete')) && <DropdownMenuSeparator />}

                                                            {can('purchases.update') && (
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={app.purchases.edit ? app.purchases.edit.url(item.uuid) : `/purchases/${item.uuid}/edit`} className="cursor-pointer text-xs">
                                                                        <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Purchase
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            )}

                                                            {can('purchases.delete') && (
                                                                <DropdownMenuItem
                                                                    className="cursor-pointer text-xs text-destructive focus:text-destructive"
                                                                    onClick={() => handleDelete(item.uuid)}
                                                                >
                                                                    <Trash2 className="mr-2 size-4" /> Delete
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
                    {(() => {
                        if (!purchaseList || purchaseList.last_page <= 1) return null;

                        const prevLink = purchaseList.links.find((l) => l.label.includes('Previous'));
                        const nextLink = purchaseList.links.find((l) => l.label.includes('Next'));
                        const pageLinks = purchaseList.links
                            .filter((l) => !l.label.includes('Previous') && !l.label.includes('Next'))
                            .map((l) => ({
                                ...l,
                                cleanLabel: l.label.replace(/&laquo;|&raquo;/g, '').trim(),
                            }));

                        return (
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
                                <p className="text-xs text-muted-foreground">
                                    Showing <span className="font-medium text-foreground">{purchaseList.from ?? 0}</span> to{' '}
                                    <span className="font-medium text-foreground">{purchaseList.to ?? 0}</span> of{' '}
                                    <span className="font-medium text-foreground">{purchaseList.total ?? 0}</span> purchases
                                </p>

                                <Pagination className="w-auto mx-0">
                                    <PaginationContent className="gap-1">
                                        <PaginationItem>
                                            <PaginationPrevious
                                                href={prevLink?.url ?? '#'}
                                                className={cn(
                                                    "h-8 text-xs px-2.5",
                                                    !prevLink?.url && "pointer-events-none opacity-40"
                                                )}
                                                onClick={(e) => {
                                                    if (!prevLink?.url) return;
                                                    e.preventDefault();
                                                    router.get(prevLink.url, {}, { preserveState: true });
                                                }}
                                            />
                                        </PaginationItem>

                                        {pageLinks.map((link, idx) => (
                                            <PaginationItem key={idx}>
                                                <PaginationLink
                                                    href={link.url ?? '#'}
                                                    isActive={link.active}
                                                    className="h-8 w-8 text-xs"
                                                    onClick={(e) => {
                                                        if (!link.url || link.active) return;
                                                        e.preventDefault();
                                                        router.get(link.url, {}, { preserveState: true });
                                                    }}
                                                >
                                                    {link.label}
                                                </PaginationLink>
                                            </PaginationItem>
                                        ))}

                                        <PaginationItem>
                                            <PaginationNext
                                                href={nextLink?.url ?? '#'}
                                                className={cn(
                                                    "h-8 text-xs px-2.5",
                                                    !nextLink?.url && "pointer-events-none opacity-40"
                                                )}
                                                onClick={(e) => {
                                                    if (!nextLink?.url) return;
                                                    e.preventDefault();
                                                    router.get(nextLink.url, {}, { preserveState: true });
                                                }}
                                            />
                                        </PaginationItem>
                                    </PaginationContent>
                                </Pagination>
                            </div>
                        );
                    })()}
                </Card>
            </div>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Purchases', href: app.purchases.index.url() },
    ],
};

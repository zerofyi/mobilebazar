import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    ShoppingCart,
    Plus,
    Search,
    MoreVertical,
    Eye,
    FileText,
    BadgeCheck,
    Building2,
    UserRound,
    X,
    IndianRupee,
    AlertCircle,
    CalendarDays,
    CreditCard,
    TrendingUp,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

import { dashboard } from '@/routes';
import app from '@/routes/app';

import { Button }                   from '@/components/ui/button';
import { Input }                    from '@/components/ui/input';
import { Badge }                    from '@/components/ui/badge';
import { Card, CardContent }        from '@/components/ui/card';
import { StatCard }                 from '@/components/special/stat-card';
import { FormatAmount }             from '@/components/special/format-amount';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface PurchaseRow {
    id: number;
    uuid: string;
    po_number: string;
    vendor_invoice_no: string | null;
    bill_type: 'po' | 'pv';
    is_gst_billed: boolean;
    order_date: string;
    status: string;
    payment_status: string;
    payment_mode: string | null;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    item_count: number;
    vendor: {
        name: string;
        type: 'supplier' | 'customer';
        gstin: string | null;
        phone: string | null;
    } | null;
}

interface Stats {
    total_purchases: number;
    this_month: number;
    gst_purchases: number;
    unpaid_count: number;
    total_value: number;
    total_due: number;
}

interface Filters {
    search?: string;
    status?: string;
    bill_type?: string;
    payment_status?: string;
    date_from?: string;
    date_to?: string;
    party_type?: string;
}

interface IndexProps {
    purchases: {
        data: PurchaseRow[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: Stats;
    filters: Filters;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const paymentStatusVariant = (status: string): string => {
    if (status === 'paid')    return 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10';
    if (status === 'partial') return 'border-amber-500/30  text-amber-600  bg-amber-500/10';
    if (status === 'unpaid')  return 'border-rose-500/30   text-rose-600   bg-rose-500/10';
    return 'text-muted-foreground';
};

const billTypeBadge = (billType: string, isGst: boolean) =>
    isGst
        ? 'border-blue-500/30 text-blue-700 bg-blue-50'
        : 'text-muted-foreground';

/* ── Component ──────────────────────────────────────────────────────────── */

export default function Index({ purchases, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions ?? [];
    const canCreate = permissions.includes('purchases.create');

    const [searchValue, setSearchValue] = useState(filters.search ?? '');
    const hasActiveFilters = Object.values(filters).some(Boolean);

    const applyFilter = (key: string, value: string | null) => {
        router.get(app.purchases.index.url(), { ...filters, [key]: value ?? undefined }, {
            preserveState: true, replace: true,
        });
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            applyFilter('search', (e.target as HTMLInputElement).value || null);
        }
    };

    const resetFilters = () => {
        setSearchValue('');
        router.get(app.purchases.index.url(), {}, { preserveState: true, replace: true });
    };

    return (
        <>
            <Head title="Purchases" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <ShoppingCart className="size-6 text-primary" />
                            Purchases
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            All purchase vouchers and orders for this store.
                        </p>
                    </div>
                    {canCreate && (
                        <Link href={app.purchases.create.url()}>
                            <Button size="sm" className="w-full sm:w-auto">
                                <Plus className="mr-2 size-4" /> New Purchase
                            </Button>
                        </Link>
                    )}
                </div>

                {/* ── Stats ────────────────────────────────────────────────── */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    <StatCard title="Total Purchases"  value={stats.total_purchases} icon={ShoppingCart} />
                    <StatCard title="This Month"       value={stats.this_month}      icon={CalendarDays} />
                    <StatCard title="GST Billed"       value={stats.gst_purchases}   icon={BadgeCheck} />
                    <StatCard title="Unpaid"           value={stats.unpaid_count}    icon={AlertCircle} />
                    <StatCard
                        title="Total Value"
                        value={`₹${stats.total_value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                        icon={TrendingUp}
                    />
                    <StatCard
                        title="Total Due"
                        value={`₹${stats.total_due.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                        icon={CreditCard}
                    />
                </div>

                {/* ── Filters ──────────────────────────────────────────────── */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-1">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="PO number, vendor invoice..."
                            value={searchValue}
                            onChange={(e) => setSearchValue(e.target.value)}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Select value={filters.payment_status ?? 'all'}
                            onValueChange={(v) => applyFilter('payment_status', v === 'all' ? null : v)}>
                            <SelectTrigger className="w-[130px] h-9 text-xs">
                                <SelectValue placeholder="Payment" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Payments</SelectItem>
                                <SelectItem value="paid">Paid</SelectItem>
                                <SelectItem value="partial">Partial</SelectItem>
                                <SelectItem value="unpaid">Unpaid</SelectItem>
                                <SelectItem value="draft">Draft</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filters.bill_type ?? 'all'}
                            onValueChange={(v) => applyFilter('bill_type', v === 'all' ? null : v)}>
                            <SelectTrigger className="w-[110px] h-9 text-xs">
                                <SelectValue placeholder="Bill Type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Types</SelectItem>
                                <SelectItem value="po">PO (GST B2B)</SelectItem>
                                <SelectItem value="pv">PV (Voucher)</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select value={filters.party_type ?? 'all'}
                            onValueChange={(v) => applyFilter('party_type', v === 'all' ? null : v)}>
                            <SelectTrigger className="w-[120px] h-9 text-xs">
                                <SelectValue placeholder="Party" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Parties</SelectItem>
                                <SelectItem value="supplier">Supplier</SelectItem>
                                <SelectItem value="customer">Customer</SelectItem>
                            </SelectContent>
                        </Select>

                        <div className="flex items-center gap-1.5">
                            <Input type="date" value={filters.date_from ?? ''} onChange={(e) => applyFilter('date_from', e.target.value || null)} className="h-9 text-xs w-[130px]" />
                            <span className="text-xs text-muted-foreground">–</span>
                            <Input type="date" value={filters.date_to ?? ''} onChange={(e) => applyFilter('date_to', e.target.value || null)} className="h-9 text-xs w-[130px]" />
                        </div>

                        {hasActiveFilters && (
                            <Button variant="ghost" size="sm" onClick={resetFilters} className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground">
                                <X className="size-3.5 mr-1" /> Clear
                            </Button>
                        )}
                    </div>
                </div>

                {/* ── Table ────────────────────────────────────────────────── */}
                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/40 hover:bg-muted/40">
                                    <TableHead className="text-xs font-semibold w-[160px]">Purchase No.</TableHead>
                                    <TableHead className="text-xs font-semibold">Vendor</TableHead>
                                    <TableHead className="text-xs font-semibold w-[100px]">Date</TableHead>
                                    <TableHead className="text-xs font-semibold w-[80px]">Type</TableHead>
                                    <TableHead className="text-xs font-semibold w-[90px]">Items</TableHead>
                                    <TableHead className="text-xs font-semibold text-right w-[120px]">Grand Total</TableHead>
                                    <TableHead className="text-xs font-semibold text-right w-[120px]">Due</TableHead>
                                    <TableHead className="text-xs font-semibold w-[100px]">Payment</TableHead>
                                    <TableHead className="w-10" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchases.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="h-40 text-center text-xs text-muted-foreground">
                                            <div className="flex flex-col items-center gap-2">
                                                <ShoppingCart className="size-8 text-muted-foreground/30" />
                                                <p>No purchases found.</p>
                                                {canCreate && (
                                                    <Link href={app.purchases.create.url()}>
                                                        <Button size="sm" variant="outline" className="text-xs">
                                                            <Plus className="size-3 mr-1" /> Create first purchase
                                                        </Button>
                                                    </Link>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    purchases.data.map((po) => (
                                        <TableRow key={po.id} className="transition-colors hover:bg-muted/40">

                                            {/* Purchase No */}
                                            <TableCell className="align-middle">
                                                <div className="space-y-0.5">
                                                    <Link href={app.purchases.show.url(po.uuid)} className="font-mono text-xs font-semibold text-primary hover:underline">
                                                        {po.po_number}
                                                    </Link>
                                                    {po.vendor_invoice_no && (
                                                        <p className="text-[10px] text-muted-foreground font-mono">
                                                            Vendor: {po.vendor_invoice_no}
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Vendor */}
                                            <TableCell className="align-middle">
                                                {po.vendor ? (
                                                    <div className="flex items-start gap-1.5">
                                                        {po.vendor.type === 'supplier'
                                                            ? <Building2 className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                                            : <UserRound  className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                                        }
                                                        <div className="space-y-0.5">
                                                            <p className="text-xs font-semibold text-foreground truncate max-w-[200px]">
                                                                {po.vendor.name}
                                                            </p>
                                                            {po.vendor.gstin && (
                                                                <p className="text-[10px] font-mono text-muted-foreground">
                                                                    {po.vendor.gstin}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">—</span>
                                                )}
                                            </TableCell>

                                            {/* Date */}
                                            <TableCell className="align-middle text-xs text-muted-foreground whitespace-nowrap">
                                                {po.order_date
                                                    ? new Date(po.order_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                                                    : '—'}
                                            </TableCell>

                                            {/* Bill type */}
                                            <TableCell className="align-middle">
                                                <div className="flex flex-col gap-1">
                                                    <Badge variant="outline" className={`text-[9px] font-mono uppercase px-1.5 ${billTypeBadge(po.bill_type, po.is_gst_billed)}`}>
                                                        {po.bill_type.toUpperCase()}
                                                    </Badge>
                                                    {po.is_gst_billed && (
                                                        <span className="text-[9px] text-emerald-600 font-medium flex items-center gap-0.5">
                                                            <BadgeCheck className="size-2.5" /> GST
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            {/* Items */}
                                            <TableCell className="align-middle text-xs text-muted-foreground">
                                                {po.item_count} line{po.item_count !== 1 ? 's' : ''}
                                            </TableCell>

                                            {/* Grand Total */}
                                            <TableCell className="align-middle text-right font-mono text-xs font-semibold text-foreground">
                                                ₹<FormatAmount amount={po.grand_total} />
                                            </TableCell>

                                            {/* Due */}
                                            <TableCell className="align-middle text-right font-mono text-xs">
                                                {po.due_amount > 0 ? (
                                                    <span className="text-rose-600 font-semibold">
                                                        ₹<FormatAmount amount={po.due_amount} />
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">—</span>
                                                )}
                                            </TableCell>

                                            {/* Payment status */}
                                            <TableCell className="align-middle">
                                                <Badge variant="outline" className={`text-[10px] capitalize ${paymentStatusVariant(po.payment_status)}`}>
                                                    {po.payment_status}
                                                </Badge>
                                            </TableCell>

                                            {/* Actions */}
                                            <TableCell className="align-middle text-right border-l border-border/60">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-8">
                                                            <MoreVertical className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-40">
                                                        <Link href={app.purchases.show.url(po.uuid)}>
                                                            <DropdownMenuItem className="cursor-pointer text-xs">
                                                                <Eye className="mr-2 size-4 text-muted-foreground" /> View Details
                                                            </DropdownMenuItem>
                                                        </Link>
                                                        <DropdownMenuItem className="cursor-pointer text-xs" onClick={() => window.print()}>
                                                            <FileText className="mr-2 size-4 text-muted-foreground" /> Print Voucher
                                                        </DropdownMenuItem>
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* ── Pagination ───────────────────────────────────────────── */}
                {purchases.last_page > 1 && (
                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                        <span>
                            Page {purchases.current_page} of {purchases.last_page} &nbsp;·&nbsp; {purchases.total} total
                        </span>
                        <div className="flex items-center gap-1">
                            {purchases.links.map((link, i) => {
                                if (link.label === '&laquo; Previous') {
                                    return (
                                        <Button key={i} variant="outline" size="icon" className="size-7" disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}>
                                            <ChevronLeft className="size-3.5" />
                                        </Button>
                                    );
                                }
                                if (link.label === 'Next &raquo;') {
                                    return (
                                        <Button key={i} variant="outline" size="icon" className="size-7" disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}>
                                            <ChevronRight className="size-3.5" />
                                        </Button>
                                    );
                                }
                                return (
                                    <Button key={i} variant={link.active ? 'default' : 'outline'} size="sm"
                                        className="size-7 text-xs"
                                        disabled={!link.url}
                                        onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}>
                                        {link.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Purchases',  href: app.purchases.index.url() },
    ],
};

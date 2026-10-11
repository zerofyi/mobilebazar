import React, { useCallback, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';

import {
    BookOpenText, Download, ShoppingCart,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';

import {
    ReportPagination,
    RemoteSearchPicker,
    fmtDate,
    type ReportLinkItem,
    type SearchHit,
} from './partials/report-shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RegisterRow {
    id: number;
    uuid: string;
    order_date: string;
    po_number: string;
    vendor_invoice_no: string | null;
    bill_type: 'po' | 'pv';
    subtotal: number;
    tax_amount: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    status: string;
    vendor: {
        id: number | null;
        name: string;
        type: 'supplier' | 'customer' | null;
        phone: string | null;
        gstin: string | null;
    } | null;
}

interface Paginated {
    data: RegisterRow[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: ReportLinkItem[];
}

interface Props {
    orders?: Paginated;
    summary?: {
        total_count: number;
        subtotal: number;
        tax_amount: number;
        grand_total: number;
        paid_amount: number;
        due_amount: number;
    };
    filters: {
        from: string;
        to: string;
        supplier_id?: number | null;
        bill_type?: string | null;
    };
    supplier?: { id: number; name: string } | null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Register({ orders, summary, filters, supplier }: Props) {
    const [from, setFrom] = useState(filters.from);
    const [to, setTo] = useState(filters.to);
    const [billType, setBillType] = useState(filters.bill_type || 'all');
    const [pickedSupplier, setPickedSupplier] = useState<SearchHit | null>(
        supplier ? { id: supplier.id, title: supplier.name } : null
    );

    const applyFilters = useCallback(
        (newFrom: string, newTo: string, newBillType: string, newSupplierId: number | null) => {
            router.get(
                app.reports.purchases.register.url(),
                {
                    from: newFrom || undefined,
                    to: newTo || undefined,
                    bill_type: newBillType !== 'all' ? newBillType : undefined,
                    supplier_id: newSupplierId ?? undefined,
                },
                { preserveState: true, replace: true }
            );
        },
        []
    );

    const handleApply = useCallback(
        (e: React.FormEvent) => {
            e.preventDefault();
            applyFilters(from, to, billType, pickedSupplier?.id ?? null);
        },
        [from, to, billType, pickedSupplier, applyFilters]
    );

    const handleSupplierPick = useCallback(
        (hit: SearchHit) => {
            setPickedSupplier(hit);
            applyFilters(from, to, billType, hit.id);
        },
        [from, to, billType, applyFilters]
    );

    const handleSupplierClear = useCallback(() => {
        setPickedSupplier(null);
        applyFilters(from, to, billType, null);
    }, [from, to, billType, applyFilters]);

    const csvUrl = app.reports.purchases.register.url({
        query: {
            export: 'csv',
            from: filters.from,
            to: filters.to,
            ...(filters.bill_type ? { bill_type: filters.bill_type } : {}),
            ...(filters.supplier_id ? { supplier_id: filters.supplier_id } : {}),
        },
    });

    const loading = !orders || !summary;

    return (
        <>
            <Head title="Purchase Register" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <BookOpenText className="size-6 text-primary" />
                            Purchase Register
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Date-wise purchase book with vendor, tax and payment breakdown.
                        </p>
                    </div>
                    <Button asChild variant="outline" className="shadow-sm">
                        <a href={csvUrl} download>
                            <Download className="mr-2 size-4" /> Export CSV
                        </a>
                    </Button>
                </div>

                {/* Summary Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    <StatCard title="Filtered Orders" value={summary?.total_count ?? 0} icon={ShoppingCart} subtitle="Matching criteria" loading={loading} />
                    <StatCard
                        title="Total Purchase"
                        value={<>₹<FormatAmount amount={summary?.grand_total ?? 0} /></>}
                        icon={BookOpenText}
                        subtitle="Grand total (incl. tax)"
                        loading={loading}
                    />
                    <StatCard
                        title="Tax (ITC base)"
                        value={<>₹<FormatAmount amount={summary?.tax_amount ?? 0} /></>}
                        icon={BookOpenText}
                        subtitle="GST charged on bills"
                        loading={loading}
                    />
                    <StatCard
                        title="Paid"
                        value={<>₹<FormatAmount amount={summary?.paid_amount ?? 0} /></>}
                        icon={BookOpenText}
                        subtitle="Paid to vendors"
                        variant="success"
                        loading={loading}
                    />
                    <StatCard
                        title="Due"
                        value={<>₹<FormatAmount amount={summary?.due_amount ?? 0} /></>}
                        icon={BookOpenText}
                        subtitle="Outstanding payable"
                        variant={(summary?.due_amount ?? 0) > 0 ? 'warning' : 'default'}
                        loading={loading}
                    />
                </div>

                {/* Table Section */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                    <CardHeader className="pb-4 border-b border-border/50">
                        <form onSubmit={handleApply} className="flex items-end gap-2 flex-nowrap overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                            <div className="shrink-0">
                                <Label className="text-[11px] text-muted-foreground">From</Label>
                                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 text-xs mt-1 w-40" />
                            </div>
                            <div className="shrink-0">
                                <Label className="text-[11px] text-muted-foreground">To</Label>
                                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 text-xs mt-1 w-40" />
                            </div>
                            <div className="shrink-0 w-52">
                                <Label className="text-[11px] text-muted-foreground">Supplier</Label>
                                <div className="mt-1">
                                    <RemoteSearchPicker
                                        url={app.suppliers.search.url()}
                                        placeholder="Search supplier…"
                                        value={pickedSupplier}
                                        onPick={handleSupplierPick}
                                        onClear={handleSupplierClear}
                                        mapHit={(raw: any) => ({
                                            id: raw.id,
                                            title: raw.company_name || raw.name,
                                            subtitle: raw.gstin ? `GSTIN ${raw.gstin}` : raw.phone,
                                        })}
                                    />
                                </div>
                            </div>
                            <div className="shrink-0">
                                <Label className="text-[11px] text-muted-foreground">Bill Type</Label>
                                <Select value={billType} onValueChange={setBillType}>
                                    <SelectTrigger className="h-9 text-xs mt-1 w-36">
                                        <SelectValue placeholder="All types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All types</SelectItem>
                                        <SelectItem value="po">PO (Tax B2B)</SelectItem>
                                        <SelectItem value="pv">PV (Voucher)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" variant="secondary" size="sm" className="h-9 px-4 shrink-0">
                                Apply
                            </Button>
                        </form>
                    </CardHeader>

                    <CardContent className="p-0 overflow-auto">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                    <TableHead className="text-xs font-semibold">Date</TableHead>
                                    <TableHead className="text-xs font-semibold">PO Number</TableHead>
                                    <TableHead className="text-xs font-semibold">Vendor Bill No</TableHead>
                                    <TableHead className="text-xs font-semibold">Supplier</TableHead>
                                    <TableHead className="text-xs font-semibold">Bill Type</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Subtotal</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Tax</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Grand Total</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Paid</TableHead>
                                    <TableHead className="text-xs font-semibold text-right">Due</TableHead>
                                    <TableHead className="text-xs font-semibold">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array.from({ length: 6 }).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                            <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                                            <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : orders.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={12} className="text-center py-20 text-muted-foreground">
                                            <ShoppingCart className="size-10 mx-auto mb-3 opacity-20" />
                                            <p className="font-medium text-foreground">No purchases in this range</p>
                                            <p className="text-sm">Try widening the date range or clearing filters.</p>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    orders.data.map((row, index) => (
                                        <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                                            <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                {(orders.from ?? 1) + index}
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">{fmtDate(row.order_date)}</TableCell>
                                            <TableCell>
                                                <Link
                                                    href={app.purchases.show.url(row.uuid)}
                                                    className="font-bold text-primary hover:underline underline-offset-4 text-sm"
                                                >
                                                    {row.po_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{row.vendor_invoice_no ?? '—'}</TableCell>
                                            <TableCell className="text-xs font-medium max-w-44 truncate" title={row.vendor?.name}>
                                                {row.vendor?.name ?? '—'}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={cn('text-xs font-medium', row.bill_type === 'po' ? 'text-blue-700 border-blue-400/40 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400' : 'text-muted-foreground')}>
                                                    {row.bill_type === 'po' ? 'PO' : 'PV'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">₹<FormatAmount amount={row.subtotal} /></TableCell>
                                            <TableCell className="text-right text-xs text-primary">₹<FormatAmount amount={row.tax_amount} /></TableCell>
                                            <TableCell className="text-right text-sm font-semibold text-primary">₹<FormatAmount amount={row.grand_total} /></TableCell>
                                            <TableCell className="text-right text-xs text-muted-foreground">₹<FormatAmount amount={row.paid_amount} /></TableCell>
                                            <TableCell className={cn('text-right text-xs font-bold', row.due_amount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground/60')}>
                                                ₹<FormatAmount amount={row.due_amount} />
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs font-medium capitalize">{row.status}</Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>

                    {orders && (
                        <ReportPagination
                            links={orders.links}
                            from={orders.from}
                            to={orders.to}
                            total={orders.total}
                            label="purchases"
                        />
                    )}
                </Card>
            </div>
        </>
    );
}

Register.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Reports', href: app.reports.purchases.register.url() },
        { title: 'Purchase Register', href: app.reports.purchases.register.url() },
    ],
};

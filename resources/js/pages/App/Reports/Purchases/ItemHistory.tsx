import React, { useCallback, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import { dashboard } from '@/routes';
import app from '@/routes/app';

import {
    History, Download, PackageSearch, Tag, Users, ShoppingCart, TrendingDown, TrendingUp, BadgeIndianRupee,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
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

interface HistoryRow {
    id: number;
    order_date: string;
    po_number: string;
    qty: number;
    unit_cost: number;
    landed_cost: number;
    vendor: {
        id: number | null;
        name: string;
        type: 'supplier' | 'customer' | null;
        phone: string | null;
        gstin: string | null;
    } | null;
}

interface Paginated {
    data: HistoryRow[];
    current_page: number;
    from: number | null;
    to: number | null;
    total: number;
    last_page: number;
    per_page: number;
    links: ReportLinkItem[];
}

interface Props {
    rows?: Paginated;
    summary?: {
        last_cost: number | null;
        lowest_cost: number | null;
        highest_cost: number | null;
        supplier_count: number;
        purchase_count: number;
    };
    variant?: {
        id: number;
        variant_name: string;
        sku: string | null;
        product_name: string | null;
    } | null;
    filters: {
        product_variant_id?: number | null;
    };
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ItemHistory({ rows, summary, variant, filters }: Props) {
    const [pickedVariant, setPickedVariant] = useState<SearchHit | null>(
        variant ? { id: variant.id, title: variant.product_name ? `${variant.product_name} · ${variant.variant_name}` : variant.variant_name, subtitle: variant.sku ? `SKU ${variant.sku}` : null } : null
    );

    const handlePick = useCallback((hit: SearchHit) => {
        setPickedVariant(hit);
        router.get(app.reports.purchases.itemHistory.url(), { product_variant_id: hit.id }, { preserveState: true, replace: true });
    }, []);

    const handleClear = useCallback(() => {
        setPickedVariant(null);
        router.get(app.reports.purchases.itemHistory.url(), {}, { preserveState: true, replace: true });
    }, []);

    const csvUrl = filters.product_variant_id
        ? app.reports.purchases.itemHistory.url({
            query: { export: 'csv', product_variant_id: filters.product_variant_id },
        })
        : '#';

    const hasVariant = !!variant;
    const loading = !rows || !summary;

    return (
        <>
            <Head title="Item Purchase History" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-start justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <History className="size-6 text-primary" />
                            Item Purchase History
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Every purchase of a product variant with cost trends and supplier spread.
                        </p>
                    </div>
                    <Button asChild variant="outline" className={cn('shadow-sm', !hasVariant && 'pointer-events-none opacity-40')}>
                        <a href={csvUrl} download>
                            <Download className="mr-2 size-4" /> Export CSV
                        </a>
                    </Button>
                </div>

                {/* Variant picker */}
                <div className="max-w-xl">
                    <RemoteSearchPicker
                        url={app.products.variants.search.url()}
                        placeholder="Search item by name, SKU or barcode…"
                        value={pickedVariant}
                        onPick={handlePick}
                        onClear={handleClear}
                        mapHit={(raw: any) => ({
                            id: raw.id,
                            title: raw.product_name ? `${raw.product_name} · ${raw.variant_name}` : raw.variant_name,
                            subtitle: raw.sku ? `SKU ${raw.sku}` : null,
                        })}
                        className="w-full"
                    />
                </div>

                {!hasVariant && !loading ? (
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardContent className="py-20 text-center text-muted-foreground">
                            <PackageSearch className="size-10 mx-auto mb-3 opacity-20" />
                            <p className="font-medium text-foreground">Pick an item to see its purchase history</p>
                            <p className="text-sm">Search by name, SKU or barcode above.</p>
                        </CardContent>
                    </Card>
                ) : (
                    <>
                        {/* Summary Stats */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            <StatCard
                                title="Last Purchase Cost"
                                value={summary?.last_cost != null ? <>₹<FormatAmount amount={summary.last_cost} /></> : '—'}
                                icon={BadgeIndianRupee}
                                subtitle="Most recent unit cost"
                                loading={loading}
                            />
                            <StatCard
                                title="Lowest Cost"
                                value={summary?.lowest_cost != null ? <>₹<FormatAmount amount={summary.lowest_cost} /></> : '—'}
                                icon={TrendingDown}
                                subtitle="Best unit cost seen"
                                variant="success"
                                loading={loading}
                            />
                            <StatCard
                                title="Highest Cost"
                                value={summary?.highest_cost != null ? <>₹<FormatAmount amount={summary.highest_cost} /></> : '—'}
                                icon={TrendingUp}
                                subtitle="Peak unit cost seen"
                                variant={(summary?.highest_cost ?? 0) > (summary?.lowest_cost ?? 0) ? 'warning' : 'default'}
                                loading={loading}
                            />
                            <StatCard
                                title="Suppliers"
                                value={summary?.supplier_count ?? 0}
                                icon={Users}
                                subtitle="Distinct vendors"
                                loading={loading}
                            />
                            <StatCard
                                title="Purchases"
                                value={summary?.purchase_count ?? 0}
                                icon={ShoppingCart}
                                subtitle="Times purchased"
                                loading={loading}
                            />
                        </div>

                        {/* Table Section */}
                        <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm flex flex-col min-h-0">
                            <CardHeader className="pb-4 border-b border-border/50">
                                <div className="flex items-center gap-2 text-sm">
                                    <Tag className="size-4 text-primary" />
                                    <span className="font-semibold text-foreground">
                                        {variant?.product_name ? `${variant.product_name} · ` : ''}{variant?.variant_name}
                                    </span>
                                    {variant?.sku && <span className="text-muted-foreground text-xs">SKU {variant.sku}</span>}
                                </div>
                            </CardHeader>

                            <CardContent className="p-0 overflow-auto">
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow className="hover:bg-transparent">
                                            <TableHead className="w-12 text-center text-xs font-semibold">#</TableHead>
                                            <TableHead className="text-xs font-semibold">Date</TableHead>
                                            <TableHead className="text-xs font-semibold">Supplier</TableHead>
                                            <TableHead className="text-xs font-semibold">PO Number</TableHead>
                                            <TableHead className="text-xs font-semibold text-right">Qty</TableHead>
                                            <TableHead className="text-xs font-semibold text-right">Unit Cost</TableHead>
                                            <TableHead className="text-xs font-semibold text-right">Landed Cost</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            Array.from({ length: 6 }).map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell><Skeleton className="h-4 w-6 mx-auto" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                                    <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                                                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                                    <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : rows.data.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-20 text-muted-foreground">
                                                    <ShoppingCart className="size-10 mx-auto mb-3 opacity-20" />
                                                    <p className="font-medium text-foreground">No purchases found for this item</p>
                                                    <p className="text-sm">It may never have been purchased in this store.</p>
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            rows.data.map((row, index) => (
                                                <TableRow key={row.id} className="hover:bg-muted/20 transition-colors">
                                                    <TableCell className="text-center text-xs font-medium text-muted-foreground/70">
                                                        {(rows.from ?? 1) + index}
                                                    </TableCell>
                                                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(row.order_date)}</TableCell>
                                                    <TableCell className="text-xs font-medium max-w-44 truncate" title={row.vendor?.name}>
                                                        {row.vendor?.name ?? '—'}
                                                    </TableCell>
                                                    <TableCell className="text-xs font-semibold text-primary">{row.po_number}</TableCell>
                                                    <TableCell className="text-right text-xs">{row.qty}</TableCell>
                                                    <TableCell className="text-right text-xs font-semibold">₹<FormatAmount amount={row.unit_cost} /></TableCell>
                                                    <TableCell className="text-right text-xs text-muted-foreground">₹<FormatAmount amount={row.landed_cost} /></TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>

                            {rows && rows.links && rows.links.length > 0 && (
                                <ReportPagination
                                    links={rows.links}
                                    from={rows.from}
                                    to={rows.to}
                                    total={rows.total}
                                    label="purchase lines"
                                />
                            )}
                        </Card>
                    </>
                )}
            </div>
        </>
    );
}

ItemHistory.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Reports', href: app.reports.purchases.register.url() },
        { title: 'Item Purchase History', href: app.reports.purchases.itemHistory.url() },
    ],
};

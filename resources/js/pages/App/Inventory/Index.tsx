import React, { useEffect, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import { usePermissions } from "@/hooks/user-permissions";
import {
    Boxes, Cpu, Search, IndianRupee, PackageCheck, Layers, ScanSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { StatCard } from "@/components/special/stat-card";
import { FormatAmount } from "@/components/special/format-amount";
import { Badge } from "@/components/ui/badge";
import { useFlashToast } from "@/hooks/use-flash-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import VerifyStockModal from "@/components/VerifyStockModal";

// Plain URL helpers (wayfinder-free): stable under the /app prefix.
const inv = {
    index: { url: () => '/app/inventory' },
};

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InventoryUnit {
    id: number;
    uuid: string;
    manual_item_name: string | null;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    device_condition: string;
    overall_health: string | null;
    status: string;
    is_saleable: boolean;
    landed_cost: number;
    selling_price: number | null;
    remaining_warranty: string | null;
    product_variant: {
        id: number;
        variant_name: string;
        sku: string;
        product: { id: number; name: string } | null;
    } | null;
}

export interface InventoryBatch {
    id: number;
    uuid: string;
    manual_item_name: string | null;
    batch_number: string;
    product_condition: string;
    received_qty: number;
    remaining_qty: number;
    landed_cost: number;
    selling_price: number | null;
    is_saleable: boolean;
    remaining_warranty: string | null;
    product_variant: {
        id: number;
        variant_name: string;
        sku: string;
        product: { id: number; name: string } | null;
    } | null;
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

export interface InventorySummary {
    units_available: number;
    units_reserved: number;
    units_value: number;
    batches_count: number;
    batches_remaining: number;
    batches_value: number;
}

interface Props {
    tab: 'serialized' | 'batches';
    filters: { search?: string; status?: string; condition?: string };
    summary: InventorySummary;
    units: Paginator<InventoryUnit> | null;
    batches: Paginator<InventoryBatch> | null;
}

function productName(item: InventoryUnit | InventoryBatch): string {
    if (item.manual_item_name) return item.manual_item_name;
    const v = item.product_variant;
    if (!v) return "—";
    return v.product ? `${v.product.name} · ${v.variant_name}` : v.variant_name;
}

function statusBadge(status: string) {
    const map: Record<string, string> = {
        available: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
        reserved: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
        sold: "bg-muted text-muted-foreground border-border",
    };
    return (
        <Badge variant="outline" className={cn("text-[10px] capitalize", map[status] ?? "border-border")}>
            {status}
        </Badge>
    );
}

export default function InventoryIndex({ tab, filters, summary, units, batches }: Props) {
    useFlashToast();
    const { can } = usePermissions();
    const [verifyOpen, setVerifyOpen] = useState(false);

    // Sidebar "Verify Stock" deep-link auto-opens the modal.
    useEffect(() => {
        if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("verify") === "1") {
            setVerifyOpen(true);
        }
    }, []);
    const [search, setSearch] = useState(filters.search ?? "");
    const [status, setStatus] = useState(filters.status ?? "all");
    const [condition, setCondition] = useState(filters.condition ?? "all");

    const applyFilters = (nextTab: string = tab) => {
        router.get(
            inv.index.url(),
            {
                tab: nextTab,
                search: search || undefined,
                status: nextTab === 'serialized' && status !== 'all' ? status : undefined,
                condition: condition !== 'all' ? condition : undefined,
            },
            { preserveState: true, replace: true },
        );
    };

    const switchTab = (nextTab: 'serialized' | 'batches') => {
        setStatus("all");
        setCondition("all");
        router.get(
            inv.index.url(),
            { tab: nextTab, search: search || undefined },
            { preserveState: true, replace: true },
        );
    };

    const pageUrl = (paginator: Paginator<unknown>, page: number) => {
        const params = new URLSearchParams();
        params.set("tab", tab);
        params.set("page", String(page));
        if (search) params.set("search", search);
        if (tab === 'serialized' && status !== 'all') params.set("status", status);
        if (condition !== 'all') params.set("condition", condition);
        void paginator;
        return `${inv.index.url()}?${params.toString()}`;
    };

    const renderPagination = (paginator: Paginator<unknown> | null) => {
        if (!paginator || paginator.last_page <= 1) return null;
        const pages: number[] = [];
        const cur = paginator.current_page, last = paginator.last_page;
        for (let p = Math.max(1, cur - 2); p <= Math.min(last, cur + 2); p++) pages.push(p);
        return (
            <Pagination className="mt-3">
                <PaginationContent>
                    {cur > 1 && (
                        <PaginationItem>
                            <PaginationPrevious href={pageUrl(paginator, cur - 1)} />
                        </PaginationItem>
                    )}
                    {pages.map((p) => (
                        <PaginationItem key={p}>
                            <PaginationLink href={pageUrl(paginator, p)} isActive={p === cur}>
                                {p}
                            </PaginationLink>
                        </PaginationItem>
                    ))}
                    {cur < last && (
                        <PaginationItem>
                            <PaginationNext href={pageUrl(paginator, cur + 1)} />
                        </PaginationItem>
                    )}
                </PaginationContent>
            </Pagination>
        );
    };

    if (!can('inventory.view')) {
        return (
            <>
                <Head title="Stock Inventory" />
                <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                    <p className="text-sm text-muted-foreground">You don't have permission to view inventory.</p>
                </div>
            </>
        );
    }

    return (
        <>
            <Head title="Stock Inventory" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Stock Inventory</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Live stock across the store — every serialized unit and every bulk batch.
                        </p>
                    </div>
                    <Button onClick={() => setVerifyOpen(true)} className="shrink-0">
                        <ScanSearch className="mr-1.5 size-4" /> Verify Stock
                    </Button>
                </div>

                {/* Summary Stats Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <StatCard
                        title="Available Units"
                        value={summary.units_available.toLocaleString("en-IN")}
                        icon={Cpu}
                        subtitle={summary.units_reserved > 0 ? `${summary.units_reserved.toLocaleString("en-IN")} reserved` : "Serialized in stock"}
                    />
                    <StatCard
                        title="Units Stock Value"
                        value={<>₹<FormatAmount amount={summary.units_value} /></>}
                        icon={IndianRupee}
                        subtitle="Landed cost of units"
                        variant="info"
                    />
                    <StatCard
                        title="Bulk Qty In Stock"
                        value={summary.batches_remaining.toLocaleString("en-IN")}
                        icon={Layers}
                        subtitle={`Across ${summary.batches_count.toLocaleString("en-IN")} batches`}
                    />
                    <StatCard
                        title="Bulk Stock Value"
                        value={<>₹<FormatAmount amount={summary.batches_value} /></>}
                        icon={Boxes}
                        subtitle="Landed cost of batches"
                        variant="info"
                    />
                </div>

                {/* Tabs */}
                <div className="inline-flex w-fit items-center rounded-lg bg-muted p-1 text-sm">
                    {([
                        { key: 'serialized', label: 'Serialized', icon: Cpu },
                        { key: 'batches', label: 'Non-serialized', icon: PackageCheck },
                    ] as const).map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => tab !== t.key && switchTab(t.key)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors",
                                tab === t.key
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground",
                            )}
                        >
                            <t.icon className="size-4" />
                            {t.label}
                        </button>
                    ))}
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
                                    placeholder={tab === 'serialized'
                                        ? "Search name, IMEI, serial, SKU, barcode…"
                                        : "Search name, batch no, SKU, barcode…"}
                                    className="pl-9"
                                />
                            </div>
                            {tab === 'serialized' && (
                                <select
                                    value={status}
                                    onChange={(e) => setStatus(e.target.value)}
                                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                    aria-label="Status"
                                >
                                    <option value="all">All statuses</option>
                                    <option value="available">Available</option>
                                    <option value="reserved">Reserved</option>
                                    <option value="sold">Sold</option>
                                </select>
                            )}
                            <select
                                value={condition}
                                onChange={(e) => setCondition(e.target.value)}
                                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                                aria-label="Condition"
                            >
                                <option value="all">All conditions</option>
                                <option value="new">New</option>
                                <option value="used">Used</option>
                                <option value="refurbished">Refurbished</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => applyFilters()}
                                className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                            >
                                Apply
                            </button>
                        </div>
                    </CardContent>
                </Card>

                {/* Serialized table */}
                {tab === 'serialized' && (
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>IMEI 1</TableHead>
                                        <TableHead>IMEI 2 / Serial</TableHead>
                                        <TableHead>Condition</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Landed Cost</TableHead>
                                        <TableHead className="text-right">Selling Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(units?.data ?? []).map((u) => (
                                        <TableRow key={u.id}>
                                            <TableCell>
                                                <div className="font-medium text-xs max-w-64 truncate" title={productName(u)}>
                                                    {productName(u)}
                                                </div>
                                                {u.product_variant && (
                                                    <div className="text-[10px] text-muted-foreground">{u.product_variant.sku}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{u.imei1 ?? "—"}</TableCell>
                                            <TableCell className="text-xs font-mono">{u.imei2 ?? u.serial_number ?? "—"}</TableCell>
                                            <TableCell className="text-xs capitalize">
                                                {u.device_condition}
                                                {u.overall_health && u.device_condition !== 'new' && (
                                                    <span className="text-muted-foreground"> · {u.overall_health}</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    {statusBadge(u.status)}
                                                    {!u.is_saleable && (
                                                        <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">QC hold</Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">₹<FormatAmount amount={u.landed_cost} /></TableCell>
                                            <TableCell className="text-right text-xs">
                                                {u.selling_price != null ? <>₹<FormatAmount amount={u.selling_price} /></> : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(units?.data ?? []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                                                No serialized units found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Batch table */}
                {tab === 'batches' && (
                    <Card>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product</TableHead>
                                        <TableHead>Batch No</TableHead>
                                        <TableHead>Condition</TableHead>
                                        <TableHead className="text-right">Received</TableHead>
                                        <TableHead className="text-right">Remaining</TableHead>
                                        <TableHead className="text-right">Landed Cost</TableHead>
                                        <TableHead className="text-right">Selling Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {(batches?.data ?? []).map((b) => (
                                        <TableRow key={b.id}>
                                            <TableCell>
                                                <div className="font-medium text-xs max-w-64 truncate" title={productName(b)}>
                                                    {productName(b)}
                                                </div>
                                                {b.product_variant && (
                                                    <div className="text-[10px] text-muted-foreground">{b.product_variant.sku}</div>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-xs font-mono">{b.batch_number}</TableCell>
                                            <TableCell className="text-xs capitalize">
                                                {b.product_condition}
                                                {!b.is_saleable && (
                                                    <Badge variant="outline" className="ml-1.5 text-[10px] border-amber-500/30 text-amber-600">QC hold</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right text-xs">{b.received_qty.toLocaleString("en-IN")}</TableCell>
                                            <TableCell className="text-right text-xs font-semibold">
                                                {b.remaining_qty.toLocaleString("en-IN")}
                                            </TableCell>
                                            <TableCell className="text-right text-xs">₹<FormatAmount amount={b.landed_cost} /></TableCell>
                                            <TableCell className="text-right text-xs">
                                                {b.selling_price != null ? <>₹<FormatAmount amount={b.selling_price} /></> : "—"}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {(batches?.data ?? []).length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                                                No batches found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {renderPagination(tab === 'serialized' ? units : batches)}
            </div>

            <VerifyStockModal open={verifyOpen} onOpenChange={setVerifyOpen} />
        </>
    );
}

InventoryIndex.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Inventory', href: inv.index.url() },
    ],
};

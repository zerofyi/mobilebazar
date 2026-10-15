import React from "react";
import { Head, Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import {
    ArrowLeft, Cpu, Layers, Package, ShoppingCart, ReceiptText,
    History, BadgeCheck, BadgeX, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";
import { cn } from "@/lib/utils";

// ─── Types (mirror InventoryController verify detail) ────────────────────────

interface DetailSale {
    invoice_number: string;
    invoice_uuid: string;
    date: string;
    customer: string;
    qty?: number;
    price: number;
}

interface DetailEvent {
    type: string;
    note?: string | null;
    delta?: number;
    balance?: number;
    at: string;
}

interface StockRef { kind: "unit" | "batch"; id: number; label: string; status: string; meta: string }

interface VerifyDetail {
    title: string;
    subtitle?: string | null;
    status: string;
    identifiers: Record<string, string | null>;
    condition?: string | null;
    health?: string | null;
    warranty?: string | null;
    qty?: { received: number; remaining: number };
    cost?: { landed: number; base: number };
    price?: { selling: number | null; wholesale: number | null };
    margin?: boolean;
    saleable?: boolean;
    purchase: { po_number: string; uuid: string; date: string; vendor: string } | null;
    sales?: DetailSale[];
    events?: DetailEvent[];
    units?: StockRef[];
    batches?: StockRef[];
}

const KIND_ICON = { unit: Cpu, batch: Layers, variant: Package } as const;
const KIND_TITLE = { unit: "Serialized Unit", batch: "Stock Batch", variant: "Product" } as const;

function statusTone(status: string): string {
    switch (status) {
        case "available":
        case "in_stock":
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
        case "reserved":
            return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
        default:
            return "bg-muted text-muted-foreground border-border";
    }
}

function eventLabel(type: string): string {
    return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function Verify({ kind, detail }: { kind: "unit" | "batch" | "variant"; detail: VerifyDetail }) {
    useFlashToast();
    const Icon = KIND_ICON[kind];

    return (
        <>
            <Head title={`Verify — ${detail.title}`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Icon className="size-3.5" />
                            <span>{KIND_TITLE[kind]} verification</span>
                        </div>
                        <h1 className="mt-1 text-xl font-semibold tracking-tight">{detail.title}</h1>
                        {detail.subtitle && <p className="font-mono text-xs text-muted-foreground">{detail.subtitle}</p>}
                        <div className="mt-2 flex items-center gap-2">
                            {detail.status !== "—" && (
                                <Badge variant="outline" className={cn("capitalize", statusTone(detail.status))}>
                                    {detail.status.replace("_", " ")}
                                </Badge>
                            )}
                            {detail.saleable === true && (
                                <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-700 dark:text-emerald-400">
                                    <BadgeCheck className="size-3" /> Saleable
                                </Badge>
                            )}
                            {detail.saleable === false && (
                                <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-700 dark:text-amber-400">
                                    <BadgeX className="size-3" /> QC hold
                                </Badge>
                            )}
                            {detail.margin && (
                                <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">
                                    Margin scheme
                                </Badge>
                            )}
                        </div>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/app/inventory"><ArrowLeft className="mr-1.5 size-4" /> Inventory</Link>
                    </Button>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                    {/* Identity & condition */}
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Identity</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5 text-xs">
                            {Object.entries(detail.identifiers ?? {}).map(([k, v]) => v && (
                                <div key={k} className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">{k}</span>
                                    <span className="font-mono font-medium">{v}</span>
                                </div>
                            ))}
                            {detail.condition && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Condition</span>
                                    <span className="font-medium capitalize">{detail.condition}</span>
                                </div>
                            )}
                            {detail.health && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Health</span>
                                    <span className="font-medium capitalize">{detail.health}</span>
                                </div>
                            )}
                            {detail.warranty && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Warranty</span>
                                    <span className="font-medium">{detail.warranty}</span>
                                </div>
                            )}
                            {detail.qty && (
                                <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Quantity</span>
                                    <span className="font-medium">{detail.qty.remaining} / {detail.qty.received} remaining</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Money */}
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Valuation</CardTitle></CardHeader>
                        <CardContent className="space-y-1.5 text-xs">
                            {detail.cost && (
                                <>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Landed cost</span>
                                        <span className="font-medium">₹<FormatAmount amount={detail.cost.landed} /></span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Base cost</span>
                                        <span className="font-medium">₹<FormatAmount amount={detail.cost.base} /></span>
                                    </div>
                                </>
                            )}
                            {detail.price && (
                                <>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Selling price</span>
                                        <span className="font-medium">
                                            {detail.price.selling != null ? <>₹<FormatAmount amount={detail.price.selling} /></> : "—"}
                                        </span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                        <span className="text-muted-foreground">Wholesale price</span>
                                        <span className="font-medium">
                                            {detail.price.wholesale != null ? <>₹<FormatAmount amount={detail.price.wholesale} /></> : "—"}
                                        </span>
                                    </div>
                                </>
                            )}
                            {!detail.cost && !detail.price && (
                                <p className="text-muted-foreground">Aggregate view — open a unit or batch for valuation.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Purchase */}
                {detail.purchase && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <ShoppingCart className="size-4 text-muted-foreground" /> Purchased via
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
                            <Link href={`/app/purchases/${detail.purchase.uuid}`} className="font-mono font-semibold text-primary hover:underline">
                                {detail.purchase.po_number}
                            </Link>
                            <span className="text-muted-foreground">{detail.purchase.date}</span>
                            <span>{detail.purchase.vendor}</span>
                        </CardContent>
                    </Card>
                )}

                {/* Variant aggregate: units + batches */}
                {kind === "variant" && (
                    <div className="grid gap-4 lg:grid-cols-2">
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Serialized units ({detail.units?.length ?? 0})</CardTitle></CardHeader>
                            <CardContent className="space-y-1">
                                {(detail.units ?? []).map((u) => (
                                    <Link key={u.id} href={`/app/inventory/verify/unit/${u.id}`}
                                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                                        <span className="font-mono">{u.label}</span>
                                        <Badge variant="outline" className={cn("text-[10px] capitalize", statusTone(u.status))}>{u.status}</Badge>
                                    </Link>
                                ))}
                                {(detail.units ?? []).length === 0 && <p className="text-xs text-muted-foreground">No serialized units.</p>}
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="pb-2"><CardTitle className="text-sm">Batches ({detail.batches?.length ?? 0})</CardTitle></CardHeader>
                            <CardContent className="space-y-1">
                                {(detail.batches ?? []).map((b) => (
                                    <Link key={b.id} href={`/app/inventory/verify/batch/${b.id}`}
                                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-muted">
                                        <span className="font-mono">{b.label}</span>
                                        <span className="text-muted-foreground">{b.meta}</span>
                                    </Link>
                                ))}
                                {(detail.batches ?? []).length === 0 && <p className="text-xs text-muted-foreground">No batches.</p>}
                            </CardContent>
                        </Card>
                    </div>
                )}

                {/* Sales history */}
                {(detail.sales ?? []).length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <ReceiptText className="size-4 text-muted-foreground" />
                                Sales history ({detail.sales!.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Invoice</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Customer</TableHead>
                                        {kind === "batch" && <TableHead className="text-right">Qty</TableHead>}
                                        <TableHead className="text-right">Price</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {detail.sales!.map((s, i) => (
                                        <TableRow key={i}>
                                            <TableCell>
                                                <Link href={`/app/sales/${s.invoice_uuid}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                                                    {s.invoice_number}
                                                </Link>
                                            </TableCell>
                                            <TableCell className="text-xs">{s.date}</TableCell>
                                            <TableCell className="text-xs">{s.customer}</TableCell>
                                            {kind === "batch" && <TableCell className="text-right text-xs">{s.qty}</TableCell>}
                                            <TableCell className="text-right text-xs">₹<FormatAmount amount={s.price} /></TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                )}

                {/* Movement timeline */}
                {(detail.events ?? []).length > 0 && (
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-sm">
                                <History className="size-4 text-muted-foreground" />
                                Movement timeline ({detail.events!.length})
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ol className="relative space-y-3 border-l border-border pl-4">
                                {detail.events!.map((e, i) => (
                                    <li key={i} className="relative">
                                        <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-primary" />
                                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                                            <span className="text-xs font-medium">
                                                {eventLabel(e.type)}
                                                {e.delta != null && (
                                                    <span className={cn("ml-2 font-mono", e.delta >= 0 ? "text-emerald-600" : "text-destructive")}>
                                                        {e.delta >= 0 ? "+" : ""}{e.delta}
                                                        {e.balance != null && <span className="text-muted-foreground"> → bal {e.balance}</span>}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="font-mono text-[10px] text-muted-foreground">{e.at}</span>
                                        </div>
                                        {e.note && <p className="text-[11px] text-muted-foreground">{e.note}</p>}
                                    </li>
                                ))}
                            </ol>
                        </CardContent>
                    </Card>
                )}

                {kind !== "variant" && (detail.sales ?? []).length === 0 && (
                    <Card>
                        <CardContent className="py-6 text-center text-xs text-muted-foreground">
                            <Tag className="mx-auto mb-2 size-5 opacity-50" />
                            Never sold — this {kind} is still in stock.
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}

Verify.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Inventory", href: "/app/inventory" },
        { title: "Verify", href: "#" },
    ],
};

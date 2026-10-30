import React, { useState } from "react";
import { Head, Link } from "@inertiajs/react";
import { dashboard } from "@/routes";
import {
    ArrowLeft, Cpu, Layers, Package, ShoppingCart, ReceiptText, History,
    BadgeCheck, BadgeX, Store as StoreIcon, Copy, Check, ShieldCheck,
    Wallet, Tag, Building2, CalendarClock, ArrowUpRight,
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
    profit?: number;
    payment_status?: string | null;
    store?: string | null;
}

interface DetailEvent {
    type: string;
    note?: string | null;
    delta?: number;
    balance?: number;
    at: string;
    by?: string | null;
}

interface StockRef { kind: "unit" | "batch"; id: number; label: string; status: string; meta: string; store?: string | null }

interface VerifyDetail {
    title: string;
    subtitle?: string | null;
    status: string;
    store?: { id: number; name: string; code: string } | null;
    own_store?: boolean;
    product?: {
        name: string | null; variant: string | null; brand: string | null;
        category: string | null; hsn: string | null; sku: string | null;
        barcode: string | null; mrp: number | null;
        attributes: { name: string; value: string }[];
    } | null;
    identifiers: Record<string, string | null>;
    condition?: string | null;
    health?: string | null;
    warranty?: string | null;
    warranty_detail?: { activation_date: string | null; expiry_date: string | null };
    stocked_on?: string | null;
    days_in_stock?: number | null;
    qty?: { received: number; remaining: number };
    cost?: { landed: number; base: number };
    price?: { selling: number | null; wholesale: number | null };
    margin?: boolean;
    saleable?: boolean;
    purchase: { po_number: string; uuid: string; date: string; vendor: string; bill_type?: string } | null;
    sales?: DetailSale[];
    events?: DetailEvent[];
    units?: StockRef[];
    batches?: StockRef[];
}

const KIND_ICON = { unit: Cpu, batch: Layers, variant: Package } as const;
const KIND_TITLE = { unit: "Serialized Unit", batch: "Stock Batch", variant: "Product" } as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(iso?: string | null): string {
    if (!iso) return "—";
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    if (!y || !m || !d) return iso;
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

function statusTone(status: string): string {
    switch (status) {
        case "available":
        case "in_stock":
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
        case "reserved":
            return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
        case "sold":
            return "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20";
        default:
            return "bg-muted text-muted-foreground border-border";
    }
}

function paymentTone(status?: string | null): string {
    switch (status) {
        case "paid":
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
        case "partial":
            return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
        default:
            return "bg-muted text-muted-foreground border-border";
    }
}

function eventDot(type: string): string {
    if (type.includes("sold") || type.includes("sale")) return "bg-sky-500";
    if (type.includes("purchase") || type.includes("received") || type.includes("created")) return "bg-emerald-500";
    if (type.includes("transfer")) return "bg-violet-500";
    if (type.includes("return") || type.includes("reversed")) return "bg-amber-500";
    if (type.includes("reserved")) return "bg-orange-500";
    return "bg-primary";
}

function eventLabel(type: string): string {
    return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Row({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
    return (
        <div className="flex items-center justify-between gap-4 py-1.5">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className={cn("text-right font-medium", mono && "font-mono text-[13px]")}>{children}</span>
        </div>
    );
}

function CopyValue({ label, value }: { label: string; value: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <div className="flex items-center justify-between gap-4 py-1.5">
            <span className="shrink-0 text-muted-foreground">{label}</span>
            <span className="flex items-center gap-1.5">
                <span className="font-mono text-[13px] font-medium">{value}</span>
                <button
                    type="button"
                    aria-label={`Copy ${label}`}
                    className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    onClick={() => {
                        navigator.clipboard?.writeText(value).catch(() => {});
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1200);
                    }}
                >
                    {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                </button>
            </span>
        </div>
    );
}

function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
    return (
        <Card className="shadow-sm">
            <CardContent className="py-3.5">
                <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
                <p className="mt-1 text-lg leading-tight font-bold tabular-nums">{value}</p>
                {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
            </CardContent>
        </Card>
    );
}

function Money({ amount }: { amount: number }) {
    return <>₹<FormatAmount amount={amount} /></>;
}

export default function Verify({ kind, detail }: { kind: "unit" | "batch" | "variant"; detail: VerifyDetail }) {
    useFlashToast();
    const Icon = KIND_ICON[kind];
    const product = detail.product;
    const soldProfit = (detail.sales ?? []).reduce((n, s) => n + (s.profit ?? 0), 0);
    const estMargin = detail.cost && detail.price?.selling != null ? detail.price.selling - detail.cost.landed : null;
    const estMarginPct = estMargin != null && detail.cost && detail.cost.landed > 0
        ? (estMargin / detail.cost.landed) * 100
        : null;
    const storesInvolved = new Set([
        ...(detail.units ?? []).map((u) => u.store).filter(Boolean),
        ...(detail.batches ?? []).map((b) => b.store).filter(Boolean),
    ]).size;

    return (
        <>
            <Head title={`Verify — ${detail.title}`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto p-4">
                {/* Top bar */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Icon className="size-4" />
                        <span className="font-medium tracking-wide uppercase">{KIND_TITLE[kind]} verification</span>
                        <span aria-hidden>·</span>
                        <span>Global — all stores</span>
                    </div>
                    <Button variant="outline" size="sm" asChild>
                        <Link href="/app/inventory"><ArrowLeft className="mr-1.5 size-4" /> Inventory</Link>
                    </Button>
                </div>

                {/* Hero */}
                <Card className="shadow-sm">
                    <CardContent className="flex flex-col gap-5 py-5 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-start gap-3.5">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                    <Icon className="size-6" />
                                </span>
                                <div className="min-w-0">
                                    <h1 className="text-xl leading-tight font-semibold tracking-tight">{detail.title}</h1>
                                    <p className="mt-0.5 text-sm text-muted-foreground">
                                        {[product?.brand, product?.category].filter(Boolean).join(" · ") || " "}
                                    </p>
                                </div>
                            </div>
                            {(product?.attributes?.length ?? 0) > 0 && (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {product!.attributes.map((a) => (
                                        <Badge key={a.name} variant="secondary" className="font-normal">
                                            <span className="text-muted-foreground">{a.name}:</span>
                                            <span className="ml-1 font-medium">{a.value}</span>
                                        </Badge>
                                    ))}
                                </div>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-2">
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
                                {detail.condition && (
                                    <Badge variant="outline" className="capitalize">{detail.condition}</Badge>
                                )}
                            </div>
                        </div>

                        {/* Where is it? — the global-verify answer, up front */}
                        {detail.store ? (
                            <div className="shrink-0 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 lg:min-w-64">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-primary uppercase">
                                    <StoreIcon className="size-3.5" /> Currently at
                                </p>
                                <p className="mt-1 leading-tight font-semibold">{detail.store.name}</p>
                                <p className="font-mono text-xs text-muted-foreground">Store code {detail.store.code}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {detail.own_store === false && (
                                        <Badge className="bg-primary text-primary-foreground">Other store</Badge>
                                    )}
                                    {detail.days_in_stock != null && (
                                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                            <CalendarClock className="size-3.5" />
                                            {detail.days_in_stock === 0 ? "Stocked today" : `In stock ${detail.days_in_stock} day${detail.days_in_stock === 1 ? "" : "s"}`}
                                            {detail.stocked_on ? ` · since ${fmtDate(detail.stocked_on)}` : ""}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ) : kind === "variant" ? (
                            <div className="shrink-0 rounded-xl border bg-muted/30 px-4 py-3 lg:min-w-64">
                                <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                                    <Building2 className="size-3.5" /> Spread across
                                </p>
                                <p className="mt-1 font-semibold">{storesInvolved} store{storesInvolved === 1 ? "" : "s"}</p>
                                <p className="text-xs text-muted-foreground">
                                    {(detail.units ?? []).length} units · {(detail.batches ?? []).length} batches (latest 100 each)
                                </p>
                            </div>
                        ) : null}
                    </CardContent>
                </Card>

                {/* Stat strip */}
                {kind !== "variant" && detail.cost && (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        {detail.qty ? (
                            <StatTile
                                label="Quantity remaining"
                                value={`${detail.qty.remaining} / ${detail.qty.received}`}
                                sub={detail.qty.remaining > 0 ? "still in stock" : "fully sold out"}
                            />
                        ) : (
                            <StatTile label="Landed cost" value={<Money amount={detail.cost.landed} />} sub={`Base ₹${detail.cost.base.toLocaleString("en-IN")}`} />
                        )}
                        <StatTile
                            label="Selling price"
                            value={detail.price?.selling != null ? <Money amount={detail.price.selling} /> : "—"}
                            sub={detail.qty ? `Landed ₹${detail.cost.landed.toLocaleString("en-IN")} / pc` : undefined}
                        />
                        <StatTile
                            label="Wholesale price"
                            value={detail.price?.wholesale != null ? <Money amount={detail.price.wholesale} /> : "—"}
                        />
                        <StatTile
                            label="MRP"
                            value={product?.mrp != null && product.mrp > 0 ? <Money amount={product.mrp} /> : "—"}
                            sub={estMargin != null ? `Est. margin ${estMargin >= 0 ? "+" : "−"}₹${Math.abs(estMargin).toLocaleString("en-IN")}${estMarginPct != null ? ` (${estMarginPct.toFixed(1)}%)` : ""}` : undefined}
                        />
                    </div>
                )}
                {kind === "variant" && (
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <StatTile label="Serialized units" value={(detail.units ?? []).length} />
                        <StatTile label="Available now" value={(detail.units ?? []).filter((u) => u.status === "available").length} />
                        <StatTile label="Sold" value={(detail.units ?? []).filter((u) => u.status === "sold").length} />
                        <StatTile label="Batches" value={(detail.batches ?? []).length} sub={`across ${storesInvolved} store${storesInvolved === 1 ? "" : "s"}`} />
                    </div>
                )}

                <div className="grid items-start gap-4 lg:grid-cols-3">
                    {/* Left column (2/3): identity, purchase, sales */}
                    <div className="flex flex-col gap-4 lg:col-span-2">
                        <Card className="shadow-sm">
                            <CardHeader className="pb-1">
                                <CardTitle className="text-sm font-semibold">Identity & product</CardTitle>
                            </CardHeader>
                            <CardContent className="grid gap-x-8 text-sm sm:grid-cols-2">
                                <div className="divide-y divide-border/60">
                                    {Object.entries(detail.identifiers ?? {}).map(([k, v]) => v && (
                                        <CopyValue key={k} label={k} value={v} />
                                    ))}
                                    {product?.sku && <CopyValue label="SKU" value={product.sku} />}
                                    {product?.barcode && <CopyValue label="Barcode" value={product.barcode} />}
                                </div>
                                <div className="divide-y divide-border/60">
                                    {product?.name && <Row label="Product">{product.name}</Row>}
                                    {product?.variant && <Row label="Variant">{product.variant}</Row>}
                                    {product?.brand && <Row label="Brand">{product.brand}</Row>}
                                    {product?.category && <Row label="Category">{product.category}</Row>}
                                    {product?.hsn && <Row label="HSN" mono>{product.hsn}</Row>}
                                    {detail.health && <Row label="Health"><span className="capitalize">{detail.health}</span></Row>}
                                </div>
                            </CardContent>
                        </Card>

                        {detail.purchase && (
                            <Card className="shadow-sm">
                                <CardHeader className="flex-row items-center justify-between pb-1">
                                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                        <ShoppingCart className="size-4 text-muted-foreground" /> Purchased via
                                    </CardTitle>
                                    <Button variant="outline" size="sm" asChild>
                                        <Link href={`/app/purchases/${detail.purchase.uuid}`}>
                                            View purchase <ArrowUpRight className="ml-1 size-3.5" />
                                        </Link>
                                    </Button>
                                </CardHeader>
                                <CardContent className="grid gap-x-8 text-sm sm:grid-cols-2">
                                    <div className="divide-y divide-border/60">
                                        <Row label="PO number">
                                            <Link href={`/app/purchases/${detail.purchase.uuid}`} className="font-mono text-[13px] font-semibold text-primary hover:underline">
                                                {detail.purchase.po_number}
                                            </Link>
                                        </Row>
                                        <Row label="Purchase date">{fmtDate(detail.purchase.date)}</Row>
                                    </div>
                                    <div className="divide-y divide-border/60">
                                        <Row label="Vendor">{detail.purchase.vendor}</Row>
                                        {detail.purchase.bill_type && (
                                            <Row label="Bill type">
                                                <Badge variant="secondary" className="font-mono text-[11px]">{detail.purchase.bill_type}</Badge>
                                            </Row>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        )}

                        {(detail.sales ?? []).length > 0 ? (
                            <Card className="shadow-sm">
                                <CardHeader className="flex-row items-center justify-between pb-1">
                                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                        <ReceiptText className="size-4 text-muted-foreground" />
                                        Sales history ({detail.sales!.length})
                                    </CardTitle>
                                    {kind === "unit" && (
                                        <span className={cn("text-xs font-medium", soldProfit >= 0 ? "text-emerald-600" : "text-destructive")}>
                                            Profit {soldProfit >= 0 ? "+" : "−"}₹{Math.abs(soldProfit).toLocaleString("en-IN")}
                                        </span>
                                    )}
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Invoice</TableHead>
                                                <TableHead>Date</TableHead>
                                                <TableHead>Customer</TableHead>
                                                <TableHead>Store</TableHead>
                                                <TableHead>Payment</TableHead>
                                                {kind === "batch" && <TableHead className="text-right">Qty</TableHead>}
                                                <TableHead className="text-right">Price</TableHead>
                                                <TableHead className="text-right">Profit</TableHead>
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
                                                    <TableCell className="text-xs whitespace-nowrap">{fmtDate(s.date)}</TableCell>
                                                    <TableCell className="text-xs">{s.customer}</TableCell>
                                                    <TableCell className="text-xs text-muted-foreground">{s.store ?? "—"}</TableCell>
                                                    <TableCell>
                                                        {s.payment_status ? (
                                                            <Badge variant="outline" className={cn("text-[10px] capitalize", paymentTone(s.payment_status))}>
                                                                {s.payment_status}
                                                            </Badge>
                                                        ) : "—"}
                                                    </TableCell>
                                                    {kind === "batch" && <TableCell className="text-right text-xs">{s.qty}</TableCell>}
                                                    <TableCell className="text-right text-xs font-medium">₹<FormatAmount amount={s.price} /></TableCell>
                                                    <TableCell className={cn("text-right text-xs", (s.profit ?? 0) >= 0 ? "text-emerald-600" : "text-destructive")}>
                                                        {s.profit != null ? <>₹<FormatAmount amount={s.profit} /></> : "—"}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        ) : kind !== "variant" ? (
                            <Card className="shadow-sm">
                                <CardContent className="py-8 text-center">
                                    <Tag className="mx-auto mb-2 size-6 text-muted-foreground opacity-60" />
                                    <p className="text-sm font-medium">Never sold</p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        This {kind} has no sales yet — it is still in stock{detail.store ? ` at ${detail.store.name}` : ""}.
                                    </p>
                                </CardContent>
                            </Card>
                        ) : null}

                        {kind === "variant" && (
                            <div className="grid gap-4 xl:grid-cols-2">
                                <Card className="shadow-sm">
                                    <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Serialized units ({detail.units?.length ?? 0})</CardTitle></CardHeader>
                                    <CardContent className="space-y-0.5">
                                        {(detail.units ?? []).map((u) => (
                                            <Link key={u.id} href={`/app/inventory/verify/unit/${u.id}`}
                                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted">
                                                <span className="min-w-0">
                                                    <span className="block truncate font-mono">{u.label}</span>
                                                    {u.store && <span className="block truncate text-[10px] text-muted-foreground">{u.store}</span>}
                                                </span>
                                                <Badge variant="outline" className={cn("shrink-0 text-[10px] capitalize", statusTone(u.status))}>{u.status}</Badge>
                                            </Link>
                                        ))}
                                        {(detail.units ?? []).length === 0 && <p className="text-xs text-muted-foreground">No serialized units anywhere.</p>}
                                    </CardContent>
                                </Card>
                                <Card className="shadow-sm">
                                    <CardHeader className="pb-1"><CardTitle className="text-sm font-semibold">Batches ({detail.batches?.length ?? 0})</CardTitle></CardHeader>
                                    <CardContent className="space-y-0.5">
                                        {(detail.batches ?? []).map((b) => (
                                            <Link key={b.id} href={`/app/inventory/verify/batch/${b.id}`}
                                                className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-muted">
                                                <span className="min-w-0">
                                                    <span className="block truncate font-mono">{b.label}</span>
                                                    {b.store && <span className="block truncate text-[10px] text-muted-foreground">{b.store}</span>}
                                                </span>
                                                <span className="shrink-0 text-muted-foreground">{b.meta}</span>
                                            </Link>
                                        ))}
                                        {(detail.batches ?? []).length === 0 && <p className="text-xs text-muted-foreground">No batches anywhere.</p>}
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </div>

                    {/* Right column (1/3): valuation, warranty, timeline */}
                    <div className="flex flex-col gap-4">
                        {detail.cost && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-1">
                                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                        <Wallet className="size-4 text-muted-foreground" /> Valuation
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="divide-y divide-border/60 text-sm">
                                    <Row label="Base cost"><Money amount={detail.cost.base} /></Row>
                                    <Row label="Landed cost"><Money amount={detail.cost.landed} /></Row>
                                    {detail.price?.selling != null && <Row label="Selling price"><Money amount={detail.price.selling} /></Row>}
                                    {detail.price?.wholesale != null && <Row label="Wholesale price"><Money amount={detail.price.wholesale} /></Row>}
                                    {product?.mrp != null && product.mrp > 0 && <Row label="MRP"><Money amount={product.mrp} /></Row>}
                                    {estMargin != null && (
                                        <Row label="Est. margin">
                                            <span className={estMargin >= 0 ? "text-emerald-600" : "text-destructive"}>
                                                <Money amount={estMargin} />{estMarginPct != null && <span className="text-xs"> ({estMarginPct.toFixed(1)}%)</span>}
                                            </span>
                                        </Row>
                                    )}
                                    {detail.qty && (
                                        <Row label="Stock value">
                                            <Money amount={detail.cost.landed * detail.qty.remaining} />
                                            <span className="text-xs text-muted-foreground"> ({detail.qty.remaining} left)</span>
                                        </Row>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {kind !== "variant" && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-1">
                                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                        <ShieldCheck className="size-4 text-muted-foreground" /> Warranty
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="divide-y divide-border/60 text-sm">
                                    <Row label="Remaining">{detail.warranty ?? "—"}</Row>
                                    <Row label="Activated">{fmtDate(detail.warranty_detail?.activation_date)}</Row>
                                    <Row label="Expires">{fmtDate(detail.warranty_detail?.expiry_date)}</Row>
                                </CardContent>
                            </Card>
                        )}

                        {(detail.events ?? []).length > 0 && (
                            <Card className="shadow-sm">
                                <CardHeader className="pb-1">
                                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                                        <History className="size-4 text-muted-foreground" />
                                        Movement timeline ({detail.events!.length})
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ol className="relative space-y-4 border-l border-border pl-4">
                                        {[...(detail.events ?? [])].reverse().map((e, i) => (
                                            <li key={i} className="relative">
                                                <span className={cn("absolute top-1 -left-[21px] size-2 rounded-full ring-4 ring-background", eventDot(e.type))} />
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
                                                {e.note && <p className="mt-0.5 text-[11px] text-muted-foreground">{e.note}</p>}
                                                {e.by && <p className="text-[11px] text-muted-foreground">by {e.by}</p>}
                                            </li>
                                        ))}
                                    </ol>
                                </CardContent>
                            </Card>
                        )}
                    </div>
                </div>
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

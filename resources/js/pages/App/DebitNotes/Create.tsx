import React, { useEffect, useMemo, useRef, useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import app from "@/routes/app";
import {
    Search, Building2, CalendarDays, FileText, Loader2, ArrowLeft,
    CheckCircle2, AlertTriangle, Package, Smartphone,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";
import { cn } from "@/lib/utils";

// Wayfinder route group for debit notes (generated from the `debit-notes`
// route group; regenerates on `npm run build`).
const dn = (app as any)["debit-notes"];

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "";
}

async function jsonGet<T>(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": getCsrfToken() },
        signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.message || `Request failed (${res.status}).`);
    return json as T;
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface PurchaseOption {
    id: number;
    uuid: string;
    po_number: string;
    order_date: string | null;
    grand_total: number;
    vendor_invoice_no: string | null;
    supplier_name: string | null;
}

interface ReturnUnit {
    id: number;
    name: string;
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    device_condition: string | null;
    base_cost: number;
    landed_cost: number;
    tax_pct: number;
}

interface ReturnBatch {
    id: number;
    name: string;
    batch_number: string;
    remaining_qty: number;
    received_qty: number;
    base_cost: number;
    landed_cost: number;
    tax_pct: number;
}

interface PurchaseStock {
    purchase: {
        id: number;
        uuid: string;
        po_number: string;
        order_date: string | null;
        grand_total: number;
        vendor_invoice_no: string | null;
        supplier_name: string | null;
        is_supplier: boolean;
    };
    units: ReturnUnit[];
    batches: ReturnBatch[];
}

interface Props {
    preselectedPurchase: PurchaseStock | null;
    defaultDate: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DebitNoteCreate({ preselectedPurchase, defaultDate }: Props) {
    useFlashToast();

    const [purchaseQuery, setPurchaseQuery] = useState("");
    const [purchaseOptions, setPurchaseOptions] = useState<PurchaseOption[]>([]);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);

    const [stock, setStock] = useState<PurchaseStock | null>(preselectedPurchase);
    const [loadingStock, setLoadingStock] = useState(false);
    const [stockError, setStockError] = useState<string | null>(null);

    const [selectedUnits, setSelectedUnits] = useState<Set<number>>(new Set());
    const [batchQty, setBatchQty] = useState<Record<number, number>>({});

    const [debitNoteDate, setDebitNoteDate] = useState(defaultDate);
    const [reason, setReason] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Purchase search (debounced) ──────────────────────────────────────────
    useEffect(() => {
        if (searchTimer.current) clearTimeout(searchTimer.current);
        const q = purchaseQuery.trim();
        if (q.length < 2) {
            setPurchaseOptions([]);
            setSearched(false);
            return;
        }
        const controller = new AbortController();
        searchTimer.current = setTimeout(async () => {
            setSearching(true);
            try {
                const json = await jsonGet<{ purchases: PurchaseOption[] }>(
                    dn["purchases.search"].url(), { q }, controller.signal,
                );
                setPurchaseOptions(json.purchases ?? []);
                setSearched(true);
            } catch (e) {
                if ((e as Error).name !== "AbortError") setPurchaseOptions([]);
            } finally {
                setSearching(false);
            }
        }, 250);
        return () => controller.abort();
    }, [purchaseQuery]);

    const loadStock = async (purchaseUuid: string) => {
        setLoadingStock(true);
        setStockError(null);
        try {
            const json = await jsonGet<PurchaseStock>(dn["purchase-stock"].url(purchaseUuid), {});
            setStock(json);
            setSelectedUnits(new Set());
            setBatchQty({});
        } catch (e) {
            setStockError((e as Error).message);
        } finally {
            setLoadingStock(false);
        }
    };

    // ── Selection helpers ────────────────────────────────────────────────────
    const toggleUnit = (id: number) => {
        setSelectedUnits((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const setQty = (batchId: number, raw: string, max: number) => {
        const n = Math.max(0, Math.min(max, Math.floor(Number(raw) || 0)));
        setBatchQty((prev) => ({ ...prev, [batchId]: n }));
    };

    const selectAllUnits = () => {
        setSelectedUnits(new Set((stock?.units ?? []).map((u) => u.id)));
    };

    // ── Totals (mirrors the server: base × qty + tax_pct) ────────────────────
    const totals = useMemo(() => {
        let subtotal = 0;
        let tax = 0;
        let unitCount = 0;
        let batchUnits = 0;

        (stock?.units ?? []).forEach((u) => {
            if (!selectedUnits.has(u.id)) return;
            unitCount += 1;
            subtotal += u.base_cost;
            tax += (u.base_cost * u.tax_pct) / 100;
        });

        (stock?.batches ?? []).forEach((b) => {
            const q = batchQty[b.id] ?? 0;
            if (q <= 0) return;
            batchUnits += q;
            const base = b.base_cost * q;
            subtotal += base;
            tax += (base * b.tax_pct) / 100;
        });

        const r2 = (n: number) => Math.round((n + 1e-10) * 100) / 100;
        return {
            subtotal: r2(subtotal),
            tax: r2(tax),
            grand: r2(subtotal + tax),
            unitCount,
            batchUnits,
            hasItems: unitCount > 0 || batchUnits > 0,
        };
    }, [stock, selectedUnits, batchQty]);

    const submit = () => {
        setFormError(null);

        if (!stock) {
            setFormError("Select a purchase first.");
            return;
        }
        if (!stock.purchase.is_supplier) {
            setFormError("Purchase returns are supported only for Supplier vendors. This purchase was billed by an unregistered vendor (Customer).");
            return;
        }
        if (!totals.hasItems) {
            setFormError("Select at least one unit or enter a batch quantity to return.");
            return;
        }
        if (!reason.trim()) {
            setFormError("A reason is required for the debit note.");
            return;
        }

        setSubmitting(true);
        router.post(
            dn.store.url(),
            {
                purchase_order_id: stock.purchase.id,
                debit_note_date: debitNoteDate,
                reason: reason.trim(),
                notes: notes.trim() || null,
                units: Array.from(selectedUnits).map((id) => ({ stock_unit_id: id })),
                batches: Object.entries(batchQty)
                    .filter(([, q]) => q > 0)
                    .map(([id, q]) => ({ stock_batch_id: Number(id), quantity: q })),
            },
            {
                onError: (errors) => {
                    setSubmitting(false);
                    const first = Object.values(errors)[0];
                    setFormError(Array.isArray(first) ? first[0] : String(first ?? "Validation failed."));
                },
                onFinish: () => setSubmitting(false),
            },
        );
    };

    const identifier = (u: ReturnUnit) =>
        [u.imei1, u.imei2, u.serial_number].filter(Boolean).join(" / ") || "—";

    return (
        <>
            <Head title="New Debit Note" />
            <div className="space-y-4 max-w-6xl">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href={dn.index.url()}><ArrowLeft className="size-4" /></Link>
                    </Button>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">New Purchase Return</h1>
                        <p className="text-sm text-muted-foreground mt-0.5">
                            Pick a supplier purchase, choose the stock to return, and issue the debit note.
                        </p>
                    </div>
                </div>

                {formError && (
                    <Alert variant="destructive">
                        <AlertTriangle className="size-4" />
                        <AlertDescription>{formError}</AlertDescription>
                    </Alert>
                )}

                {/* Step 1 — purchase */}
                <Card>
                    <CardHeader className="py-3">
                        <CardTitle className="text-sm font-medium">1. Purchase</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {stock ? (
                            <div className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-muted/40">
                                <div className="flex items-center gap-3">
                                    <Building2 className="size-5 text-muted-foreground" />
                                    <div>
                                        <p className="font-medium">{stock.purchase.po_number}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {stock.purchase.supplier_name ?? "—"}
                                            {stock.purchase.vendor_invoice_no ? ` · Vendor inv: ${stock.purchase.vendor_invoice_no}` : ""}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {!stock.purchase.is_supplier && (
                                        <Badge variant="destructive">Unregistered vendor — returns not supported</Badge>
                                    )}
                                    <Button variant="outline" size="sm" onClick={() => { setStock(null); setSelectedUnits(new Set()); setBatchQty({}); }}>
                                        Change
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                                    <Input
                                        value={purchaseQuery}
                                        onChange={(e) => setPurchaseQuery(e.target.value)}
                                        placeholder="Search by PO number, vendor invoice, or supplier name…"
                                        className="pl-9"
                                    />
                                    {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
                                </div>
                                {searched && (
                                    <div className="rounded-lg border divide-y max-h-64 overflow-y-auto">
                                        {purchaseOptions.length === 0 && (
                                            <p className="p-4 text-sm text-muted-foreground text-center">
                                                No supplier purchases found. Only completed purchases from registered suppliers can be returned.
                                            </p>
                                        )}
                                        {purchaseOptions.map((p) => (
                                            <button
                                                key={p.uuid}
                                                type="button"
                                                onClick={() => loadStock(p.uuid)}
                                                className="w-full text-left px-4 py-2.5 hover:bg-muted/60 flex items-center justify-between gap-3"
                                            >
                                                <div>
                                                    <p className="font-medium text-sm">{p.po_number}</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        {p.supplier_name ?? "—"}
                                                        {p.vendor_invoice_no ? ` · ${p.vendor_invoice_no}` : ""}
                                                    </p>
                                                </div>
                                                <span className="text-sm font-medium whitespace-nowrap">₹<FormatAmount amount={p.grand_total} /></span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                        {loadingStock && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="size-4 animate-spin" /> Loading returnable stock…
                            </p>
                        )}
                        {stockError && (
                            <Alert variant="destructive">
                                <AlertTriangle className="size-4" />
                                <AlertDescription>{stockError}</AlertDescription>
                            </Alert>
                        )}
                    </CardContent>
                </Card>

                {/* Step 2 — stock selection */}
                {stock && stock.purchase.is_supplier && (
                    <Card>
                        <CardHeader className="py-3 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm font-medium">2. Stock to return</CardTitle>
                            {(stock.units.length > 0) && (
                                <Button variant="ghost" size="sm" onClick={selectAllUnits}>Select all units</Button>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-5">
                            {/* Serialized units */}
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                                    <Smartphone className="size-3.5" /> Serialized units ({stock.units.length} available)
                                </p>
                                {stock.units.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No available units left on this purchase.</p>
                                ) : (
                                    <div className="rounded-lg border overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="w-10"></TableHead>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>IMEI / Serial</TableHead>
                                                    <TableHead>Condition</TableHead>
                                                    <TableHead className="text-right">Base cost</TableHead>
                                                    <TableHead className="text-right">Tax %</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stock.units.map((u) => (
                                                    <TableRow
                                                        key={u.id}
                                                        className={cn("cursor-pointer", selectedUnits.has(u.id) && "bg-primary/5")}
                                                        onClick={() => toggleUnit(u.id)}
                                                    >
                                                        <TableCell onClick={(e) => e.stopPropagation()}>
                                                            <Checkbox checked={selectedUnits.has(u.id)} onCheckedChange={() => toggleUnit(u.id)} />
                                                        </TableCell>
                                                        <TableCell className="font-medium">{u.name}</TableCell>
                                                        <TableCell className="text-xs font-mono">{identifier(u)}</TableCell>
                                                        <TableCell><Badge variant="outline" className="text-xs">{u.device_condition ?? "—"}</Badge></TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={u.base_cost} /></TableCell>
                                                        <TableCell className="text-right">{u.tax_pct}%</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>

                            {/* Bulk batches */}
                            <div>
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                                    <Package className="size-3.5" /> Bulk batches ({stock.batches.length} with stock)
                                </p>
                                {stock.batches.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">No bulk stock left on this purchase.</p>
                                ) : (
                                    <div className="rounded-lg border overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Item</TableHead>
                                                    <TableHead>Batch</TableHead>
                                                    <TableHead className="text-right">In stock</TableHead>
                                                    <TableHead className="text-right">Base cost / unit</TableHead>
                                                    <TableHead className="text-right">Tax %</TableHead>
                                                    <TableHead className="text-right w-36">Return qty</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {stock.batches.map((b) => (
                                                    <TableRow key={b.id}>
                                                        <TableCell className="font-medium">{b.name}</TableCell>
                                                        <TableCell className="text-xs font-mono">{b.batch_number}</TableCell>
                                                        <TableCell className="text-right">{b.remaining_qty}</TableCell>
                                                        <TableCell className="text-right whitespace-nowrap">₹<FormatAmount amount={b.base_cost} /></TableCell>
                                                        <TableCell className="text-right">{b.tax_pct}%</TableCell>
                                                        <TableCell className="text-right">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={b.remaining_qty}
                                                                value={batchQty[b.id] ?? ""}
                                                                onChange={(e) => setQty(b.id, e.target.value, b.remaining_qty)}
                                                                placeholder="0"
                                                                className="w-28 ml-auto text-right"
                                                            />
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Step 3 — details + totals */}
                {stock && stock.purchase.is_supplier && totals.hasItems && (
                    <Card>
                        <CardHeader className="py-3">
                            <CardTitle className="text-sm font-medium">3. Debit note details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="dn-date" className="flex items-center gap-1.5">
                                        <CalendarDays className="size-3.5" /> Debit note date
                                    </Label>
                                    <Input
                                        id="dn-date"
                                        type="date"
                                        value={debitNoteDate}
                                        onChange={(e) => setDebitNoteDate(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="dn-reason" className="flex items-center gap-1.5">
                                        <FileText className="size-3.5" /> Reason <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="dn-reason"
                                        value={reason}
                                        onChange={(e) => setReason(e.target.value)}
                                        placeholder="e.g. Defective piece, wrong model shipped…"
                                        maxLength={255}
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="dn-notes">Notes (optional)</Label>
                                <Textarea
                                    id="dn-notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Any extra context for the books…"
                                    rows={2}
                                />
                            </div>

                            {/* Totals */}
                            <div className="rounded-lg border bg-muted/40 p-4">
                                <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                    <span className="text-muted-foreground">
                                        {totals.unitCount} unit{totals.unitCount === 1 ? "" : "s"}
                                        {totals.batchUnits > 0 && ` + ${totals.batchUnits} bulk pcs`}
                                    </span>
                                    <span>Subtotal <strong>₹<FormatAmount amount={totals.subtotal} /></strong></span>
                                    <span>ITC reversal <strong>₹<FormatAmount amount={totals.tax} /></strong></span>
                                    <span className="text-base">Grand total <strong>₹<FormatAmount amount={totals.grand} /></strong></span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                    Posts as: Dr 2010 Accounts Payable / Cr 1040 Inventory / Cr 1050 ITC.
                                </p>
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button variant="outline" asChild>
                                    <Link href={dn.index.url()}>Cancel</Link>
                                </Button>
                                <Button onClick={submit} disabled={submitting}>
                                    {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                                    <CheckCircle2 className="mr-2 size-4" />
                                    Issue Debit Note
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    );
}

DebitNoteCreate.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Debit Notes", href: dn.index.url() },
        { title: "New", href: dn.create.url() },
    ],
};

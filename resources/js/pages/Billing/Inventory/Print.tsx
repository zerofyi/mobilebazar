import { Head } from "@inertiajs/react";
import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface PrintUnit {
    id: number;
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    imei: string | null;
    condition: string | null;
    status: string;
    cost: number;
    wholesale_price: number | null;
    retail_price: number | null;
}

interface PrintBatch {
    id: number;
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    batch_number: string | null;
    qty: number;
    cost: number;
    wholesale_price: number | null;
    retail_price: number | null;
}

interface Props {
    store: { name: string; code: string };
    printed_at: string;
    units: PrintUnit[];
    batches: PrintBatch[];
}

/** Plain-text money (en-IN grouping, 2 decimals trimmed to whole rupees when exact).
 *  Deliberately NOT the themed FormatAmount component: the print sheet is always
 *  white paper, and theme tokens (muted grays) wash out on it in dark mode. */
function inr(n: number): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return v.toLocaleString("en-IN", {
        minimumFractionDigits: v % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

const fullName = (name: string, variant: string | null) =>
    variant ? `${name} — ${variant}` : name;

export default function InventoryPrint({ store, printed_at, units, batches }: Props) {
    const [showSerialized, setShowSerialized] = useState(true);
    const [showBatches, setShowBatches] = useState(true);
    const [showCost, setShowCost] = useState(true);
    const [showWholesale, setShowWholesale] = useState(false);
    const [showRetail, setShowRetail] = useState(true);

    const priceCols = [
        { key: "cost", label: "Cost", show: showCost },
        { key: "wholesale", label: "Wholesale", show: showWholesale },
        { key: "retail", label: "Retail", show: showRetail },
    ].filter((c) => c.show);

    const totals = useMemo(() => {
        const sum = (price: (u: PrintUnit) => number, bPrice: (b: PrintBatch) => number) =>
            units.reduce((s, u) => s + price(u), 0) + batches.reduce((s, b) => s + bPrice(b) * b.qty, 0);
        return {
            cost: sum((u) => u.cost, (b) => b.cost),
            wholesale: sum((u) => u.wholesale_price ?? 0, (b) => b.wholesale_price ?? 0),
            retail: sum((u) => u.retail_price ?? 0, (b) => b.retail_price ?? 0),
            batchQty: batches.reduce((s, b) => s + b.qty, 0),
        };
    }, [units, batches]);

    const priceCell = (key: string, cost: number, wholesale: number | null, retail: number | null, qty = 1) => {
        const unit = key === "cost" ? cost : key === "wholesale" ? wholesale : retail;
        if (unit === null || unit === undefined) return "—";
        return inr(unit * qty);
    };

    return (
        <>
            <Head title="Print Inventory" />
            <style>{`@page { size: A4; margin: 10mm; }`}</style>

            <div className="min-h-screen bg-muted/50 p-4 print:min-h-0 print:bg-white print:p-0">
                {/* ── Print options (screen only, themed) ─────────────────── */}
                <div className="mx-auto mb-4 max-w-[210mm] rounded-xl border border-border bg-card p-4 text-card-foreground shadow-sm print:hidden">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-3">
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock</p>
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <Checkbox id="opt-ser" checked={showSerialized} onCheckedChange={(c) => setShowSerialized(!!c)} />
                                        <Label htmlFor="opt-ser" className="cursor-pointer text-sm">Serialized</Label>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Checkbox id="opt-batch" checked={showBatches} onCheckedChange={(c) => setShowBatches(!!c)} />
                                        <Label htmlFor="opt-batch" className="cursor-pointer text-sm">Non-serialized</Label>
                                    </span>
                                </div>
                            </div>
                            <div>
                                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Price columns</p>
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-1.5">
                                        <Checkbox id="opt-cost" checked={showCost} onCheckedChange={(c) => setShowCost(!!c)} />
                                        <Label htmlFor="opt-cost" className="cursor-pointer text-sm">Cost</Label>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Checkbox id="opt-wholesale" checked={showWholesale} onCheckedChange={(c) => setShowWholesale(!!c)} />
                                        <Label htmlFor="opt-wholesale" className="cursor-pointer text-sm">Wholesale</Label>
                                    </span>
                                    <span className="flex items-center gap-1.5">
                                        <Checkbox id="opt-retail" checked={showRetail} onCheckedChange={(c) => setShowRetail(!!c)} />
                                        <Label htmlFor="opt-retail" className="cursor-pointer text-sm">Retail</Label>
                                    </span>
                                </div>
                            </div>
                        </div>
                        <Button onClick={() => window.print()} disabled={!showSerialized && !showBatches}>
                            <Printer className="mr-2 size-4" /> Print
                        </Button>
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">
                        Only in-stock items are listed — {units.length} serialized units and {totals.batchQty} non-serialized pieces ({batches.length} batches).
                    </p>
                </div>

                {/* ── A4 sheet (always paper colors — prints identically in any theme) ── */}
                <div
                    className="mx-auto max-w-[210mm] bg-white p-6 text-black shadow-sm [color-scheme:light] print:shadow-none print:p-0"
                >
                    <header className="border-b-2 border-black pb-2 text-center">
                        <h1 className="text-xl font-bold">{store.name} ({store.code})</h1>
                        <p className="text-sm font-semibold uppercase tracking-wide">Stock Report — In-Stock Items Only</p>
                        <p className="text-xs text-neutral-600">Printed: {printed_at}</p>
                    </header>

                    {showSerialized && (
                        <section className="mt-4">
                            <h2 className="mb-1 text-sm font-bold uppercase">Serialized Stock ({units.length})</h2>
                            <table className="w-full border-collapse text-[12px]">
                                <thead>
                                    <tr className="border-y border-black">
                                        <th className="py-1 pr-2 text-left font-semibold">#</th>
                                        <th className="py-1 pr-2 text-left font-semibold">Product</th>
                                        <th className="py-1 pr-2 text-left font-semibold">IMEI / Serial</th>
                                        <th className="py-1 pr-2 text-left font-semibold">Condition</th>
                                        {priceCols.map((c) => (
                                            <th key={c.key} className="py-1 pl-2 text-right font-semibold">{c.label} (₹)</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {units.map((u, i) => (
                                        <tr key={u.id} className="border-b border-neutral-300">
                                            <td className="py-1 pr-2">{i + 1}</td>
                                            <td className="py-1 pr-2">
                                                {fullName(u.product_name, u.variant_name)}
                                                {u.status === "reserved" && <span className="ml-1 text-[10px] font-semibold uppercase">(Reserved)</span>}
                                            </td>
                                            <td className="py-1 pr-2 font-mono text-[11px]">{u.imei ?? "—"}</td>
                                            <td className="py-1 pr-2 capitalize">{u.condition ?? "—"}</td>
                                            {priceCols.map((c) => (
                                                <td key={c.key} className="py-1 pl-2 text-right tabular-nums">
                                                    {priceCell(c.key, u.cost, u.wholesale_price, u.retail_price)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {units.length === 0 && (
                                        <tr><td colSpan={4 + priceCols.length} className="py-2 text-center text-neutral-500">No serialized stock in hand.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {showBatches && (
                        <section className="mt-5">
                            <h2 className="mb-1 text-sm font-bold uppercase">Non-Serialized Stock ({totals.batchQty} pcs)</h2>
                            <table className="w-full border-collapse text-[12px]">
                                <thead>
                                    <tr className="border-y border-black">
                                        <th className="py-1 pr-2 text-left font-semibold">#</th>
                                        <th className="py-1 pr-2 text-left font-semibold">Product</th>
                                        <th className="py-1 pr-2 text-left font-semibold">Batch</th>
                                        <th className="py-1 pl-2 text-right font-semibold">Qty</th>
                                        {priceCols.map((c) => (
                                            <th key={c.key} className="py-1 pl-2 text-right font-semibold">{c.label} (₹)</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {batches.map((b, i) => (
                                        <tr key={b.id} className="border-b border-neutral-300">
                                            <td className="py-1 pr-2">{i + 1}</td>
                                            <td className="py-1 pr-2">{fullName(b.product_name, b.variant_name)}</td>
                                            <td className="py-1 pr-2 font-mono text-[11px]">{b.batch_number ?? "—"}</td>
                                            <td className="py-1 pl-2 text-right tabular-nums">{b.qty}</td>
                                            {priceCols.map((c) => (
                                                <td key={c.key} className="py-1 pl-2 text-right tabular-nums">
                                                    {priceCell(c.key, b.cost, b.wholesale_price, b.retail_price, b.qty)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                    {batches.length === 0 && (
                                        <tr><td colSpan={4 + priceCols.length} className="py-2 text-center text-neutral-500">No non-serialized stock in hand.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </section>
                    )}

                    {priceCols.length > 0 && (
                        <footer className="mt-5 border-t-2 border-black pt-2 text-[12px]">
                            <div className="flex flex-wrap justify-end gap-x-8 gap-y-1 font-semibold">
                                {showCost && <span>Total Cost Value: ₹{inr(totals.cost)}</span>}
                                {showWholesale && <span>Total Wholesale Value: ₹{inr(totals.wholesale)}</span>}
                                {showRetail && <span>Total Retail Value: ₹{inr(totals.retail)}</span>}
                            </div>
                        </footer>
                    )}
                </div>
            </div>
        </>
    );
}

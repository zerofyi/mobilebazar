import React from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSale, inr, type ComputedLine } from "../sale-context";

function NumInput({ value, onChange, className, ariaLabel }: {
    value: number; onChange: (n: number) => void; className?: string; ariaLabel?: string;
}) {
    return (
        <Input
            type="number"
            min={0}
            value={Number.isFinite(value) ? value : 0}
            onChange={(e) => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
            onFocus={(e) => e.target.select()}
            aria-label={ariaLabel}
            className={cn("h-8 w-full border-transparent bg-transparent px-1.5 text-right text-sm shadow-none hover:border-border focus:border-primary focus:bg-card", className)}
        />
    );
}

function QtyStepper({ line }: { line: ComputedLine }) {
    const { dispatch } = useSale();
    if (line.is_serialized) {
        return (
            <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => dispatch({ type: "DEC_QTY", payload: line.key })} aria-label="Remove one unit">
                    <Minus className="size-3.5" />
                </Button>
                <span className="w-8 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
                <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => dispatch({ type: "INC_QTY", payload: line.key })} aria-label="Add one unit" disabled={line.units_pool.length === 0}>
                    <Plus className="size-3.5" />
                </Button>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => dispatch({ type: "DEC_QTY", payload: line.key })} aria-label="Decrease qty">
                <Minus className="size-3.5" />
            </Button>
            <Input
                type="number" min={1} max={line.available_qty}
                value={line.qty}
                onChange={(e) => dispatch({ type: "SET_QTY", payload: { key: line.key, qty: parseInt(e.target.value, 10) || 1 } })}
                onFocus={(e) => e.target.select()}
                className="h-7 w-12 border-transparent bg-transparent px-0 text-center text-sm font-semibold shadow-none hover:border-border focus:border-primary"
                aria-label="Quantity"
            />
            <Button type="button" variant="outline" size="icon" className="size-7" onClick={() => dispatch({ type: "INC_QTY", payload: line.key })} aria-label="Increase qty" disabled={line.qty >= line.available_qty}>
                <Plus className="size-3.5" />
            </Button>
        </div>
    );
}

function LineRow({ line, index }: { line: ComputedLine; index: number }) {
    const { state, dispatch } = useSale();
    // Below-minimum warning applies to retail mode only; wholesale prices
    // come from the wholesale price list itself.
    const belowMin = state.saleMode === "retail" && line.min_selling_price > 0 && line.unit_price < line.min_selling_price;

    // Serialized rows hold exactly one unit, so removing the unit removes the row.
    const removeUnit = () => {
        dispatch({ type: "REMOVE_LINE", payload: line.key });
    };

    return (
        <TableRow className={cn(line._margin && "bg-amber-500/[0.04]")}>
            <TableCell className="w-8 text-muted-foreground tabular-nums">{index + 1}</TableCell>
            <TableCell className="max-w-0">
                <p className="truncate text-[13px] font-medium leading-tight" title={line.product_name}>{line.product_name}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    {line.sku && <span className="font-mono">{line.sku}</span>}
                    {line.hsn_code && <span>HSN {line.hsn_code}</span>}
                    {line._margin && <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-400 text-[10px] px-1 py-0">Margin</Badge>}
                    {line.tax_pct > 0 && <span>{line.tax_pct}% {state.isGstBilled ? (state.taxMovement === "intra" ? "CGST+SGST" : "IGST") : "GST off"}</span>}
                </p>
                {line.is_serialized && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {line.unit_metas.map((u) => (
                            <span key={u.id} className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px]">
                                <span className="truncate">{u.imei1 || u.serial_number || `#${u.id}`}</span>
                                <span className="shrink-0 text-muted-foreground">{u.device_condition}</span>
                                <button
                                    type="button"
                                    aria-label="Remove unit"
                                    className="ml-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                                    onClick={() => removeUnit()}
                                >
                                    <X className="size-3" />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                {!line.is_serialized && line.batch_label && (
                    <p className="mt-1 truncate text-[11px] text-muted-foreground" title={line.batch_label}>
                        Batch <span className="font-mono font-medium text-foreground">{line.batch_label}</span>
                    </p>
                )}
            </TableCell>
            <TableCell className="w-[104px]"><QtyStepper line={line} /></TableCell>
            <TableCell className="w-24">
                <NumInput
                    value={line.unit_price}
                    ariaLabel="Unit price"
                    className={cn(belowMin && "text-destructive font-semibold")}
                    onChange={(n) => dispatch({ type: "UPDATE_LINE", payload: { key: line.key, patch: { unit_price: n } } })}
                />
                {belowMin && <p className="text-right text-[10px] text-destructive">below min ₹{inr(line.min_selling_price, 0)}</p>}
            </TableCell>
            <TableCell className="w-20">
                <NumInput
                    value={line.discount_amount}
                    ariaLabel="Line discount"
                    onChange={(n) => dispatch({ type: "UPDATE_LINE", payload: { key: line.key, patch: { discount_amount: n } } })}
                />
            </TableCell>
            <TableCell className="w-28">
                <Input
                    value={line.warranty ?? ""}
                    onChange={(e) => dispatch({ type: "UPDATE_LINE", payload: { key: line.key, patch: { warranty: e.target.value || null } } })}
                    onFocus={(e) => e.target.select()}
                    placeholder="e.g. 6 months"
                    aria-label="Line warranty"
                    title={line.warranty ?? "Warranty the customer gets — defaults from the unit/batch, editable here"}
                    className="h-8 w-full border-transparent bg-transparent px-1.5 text-xs shadow-none hover:border-border focus:border-primary focus:bg-card"
                />
            </TableCell>
            <TableCell className="w-28 text-right">
                <p className="text-[13px] tabular-nums">₹{inr(line._taxable)}</p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                    {state.isGstBilled && line.tax_pct > 0 ? `+ ₹${inr(line._tax)} (${line.tax_pct}%)` : `+ ₹${inr(line._tax)} tax`}
                </p>
            </TableCell>
            <TableCell className="w-24 text-right text-sm font-semibold tabular-nums">₹{inr(line._lineTotal)}</TableCell>
            <TableCell className="w-10">
                <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => dispatch({ type: "REMOVE_LINE", payload: line.key })} aria-label="Remove line">
                    <Trash2 className="size-3.5" />
                </Button>
            </TableCell>
        </TableRow>
    );
}

/*
 * TEMPORARILY DISABLED (2026-09-30): manual item entry is hidden from the POS
 * UI for now. The ADD_MANUAL_ITEM action + backend support stay intact —
 * uncomment this component and its usage in CartTable below to re-enable.
 *
function ManualItemAdder() {
    const { dispatch } = useSale();
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState("");
    const [price, setPrice] = useState("");

    if (!adding) {
        return (
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setAdding(true)}>
                <PlusCircle className="size-3.5 mr-1" /> Add manual item
            </Button>
        );
    }
    return (
        <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border p-1.5">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" className="h-7 text-xs flex-1" aria-label="Manual item name" />
            <Input
                type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)}
                placeholder="₹" className="h-7 w-20 text-xs text-right" aria-label="Manual item price"
            />
            <Button
                type="button" size="sm" className="h-7 text-xs"
                onClick={() => {
                    dispatch({ type: "ADD_MANUAL_ITEM", payload: { name, price: parseFloat(price) || 0 } });
                    setName(""); setPrice(""); setAdding(false);
                }}
            >
                Add
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => setAdding(false)} aria-label="Cancel">
                <X className="size-3.5" />
            </Button>
        </div>
    );
}
 */

/**
 * Cart lines as a table, one row per line with all info, directly under the
 * search bar.
 */
export default function CartTable() {
    const { state, computedLines, lineCount, totalQty } = useSale();

    return (
        <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Cart · {lineCount} line{lineCount !== 1 ? "s" : ""} · {totalQty} item{totalQty !== 1 ? "s" : ""}
                    {state.saleMode === "wholesale" && (
                        <Badge variant="outline" className="ml-2 border-amber-500/50 text-amber-700 dark:text-amber-400">Wholesale prices</Badge>
                    )}
                </p>
                {/* Manual item entry temporarily disabled — see ManualItemAdder above. */}
                {/* <ManualItemAdder /> */}
            </div>
            {computedLines.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                    Cart is empty.<br />Scan or search stock above to add items.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <Table className="w-full table-fixed">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8">#</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="w-[104px]">Qty</TableHead>
                                <TableHead className="w-24 text-right">Price ₹</TableHead>
                                <TableHead className="w-20 text-right">Disc ₹</TableHead>
                                <TableHead className="w-28">Warranty</TableHead>
                                <TableHead className="w-28 text-right">Taxable + Tax</TableHead>
                                <TableHead className="w-24 text-right">Total</TableHead>
                                <TableHead className="w-10" />
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {computedLines.map((l, i) => <LineRow key={l.key} line={l} index={i} />)}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

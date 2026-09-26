/**
 * LineItemTable — OG design, production-wired.
 * ──────────────────────────────────────────────────────────────────────────
 * Keeps the original dense grid language (PRODUCT & BH, TYPE, QUALITY,
 * WARRANTY cycle button, IMEI columns, per-row I/E tax toggle, QuickAdd),
 * but rows live in PurchaseContext, catalog comes from the real search
 * endpoint, conditions come from device_conditions, and every row evaluates
 * the flowchart GST engine (per-row margin scheme, I/E tax split).
 */
import React, { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import {
    Copy, Plus, Search, ShoppingCart, Trash2, Zap, Check, ChevronsUpDown,
    Barcode, Sparkles, Layers, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    CalculatedRow, CatalogVariant, DeviceConditionOption, LineRow,
    TaxMode, WarrantyMode, usePurchase,
} from "../purchase-context";
import { useVariantSearch } from "@/hooks/use-purchase-search";

// ─── Row factory ─────────────────────────────────────────────────────────────

export function blankRow(conditions: DeviceConditionOption[]): LineRow {
    const def = conditions.find((c) => c.code === "used") ?? conditions[0];
    return {
        id: crypto.randomUUID(),
        product_variant_id: null,
        manual_item_name: "",
        name: "",
        sku: "",
        hsn_code: "",
        is_serialized: true,
        imei1: "",
        imei2: "",
        serial: "",
        batteryHealth: "",
        condition: def?.code ?? "used",
        condition_id: def?.id ?? null,
        quality: "good",
        warrantyMode: "D",
        warrantyValue: "6 months",
        qty: 1,
        cost: 0,
        discPercent: 0,
        taxMode: "E",
        taxPercent: 0,
        wholesale: 0,
        selling: 0,
    };
}

function rowFromVariant(v: CatalogVariant, conditions: DeviceConditionOption[], overrides: Partial<LineRow> = {}): LineRow {
    return {
        ...blankRow(conditions),
        ...overrides,
        id: crypto.randomUUID(),
        product_variant_id: v.id,
        manual_item_name: "",
        name: `${v.product_name} (${v.variant_name})`,
        sku: v.sku,
        hsn_code: v.hsn_code ?? "",
        is_serialized: v.is_serialized,
        qty: v.is_serialized ? 1 : (overrides.qty ?? 1),
        cost: overrides.cost ?? v.cost_price,
        taxPercent: overrides.taxPercent ?? v.tax_pct,
        taxMode: overrides.taxMode ?? "E",
        wholesale: overrides.wholesale ?? v.cost_price,
        selling: overrides.selling ?? v.selling_price,
    };
}

const WARRANTY_DURATIONS = ["out of warranty", "1 month", "3 months", "6 months", "1 year"];
const QUALITIES = ["fair", "good", "super mint", "sealed pack"];

// ─── Per-row product cell: catalog popover + manual name + BH ─────────────────

const ProductCell = React.memo(function ProductCell({ row }: { row: CalculatedRow }) {
    const { dispatch } = usePurchase();
    const [open, setOpen] = useState(false);
    const { query, setQuery, results, loading, clearQuery } = useVariantSearch();

    const update = useCallback(
        (field: keyof LineRow, value: unknown) =>
            dispatch({ type: "UPDATE_ROW", payload: { id: row.id, field, value } }),
        [dispatch, row.id]
    );

    const pick = (v: CatalogVariant) => {
        dispatch({ type: "APPLY_VARIANT", payload: { id: row.id, variant: v } });
        setOpen(false);
        clearQuery();
    };

    return (
        <div className="flex items-center h-full w-full min-w-0">
            <div className="min-w-0 flex-1 h-full">
                <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) clearQuery(); }}>
                    <PopoverTrigger asChild>
                        <Button
                            variant="ghost"
                            role="combobox"
                            aria-expanded={open}
                            title={row.product_variant_id ? `${row.name} · ${row.sku}` : "Search catalog or type manual name"}
                            className="w-full h-full justify-between px-1.5 text-xs font-normal rounded-none hover:bg-transparent border-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            <span className="truncate">
                                {row.product_variant_id ? row.name : row.manual_item_name || "Search..."}
                            </span>
                            <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[280px] p-0" align="start">
                        <div className="p-2 border-b">
                            <Input
                                placeholder="Manual item name…"
                                aria-label="Manual item name"
                                value={row.manual_item_name}
                                onChange={(e) => {
                                    update("manual_item_name", e.target.value);
                                    if (!row.product_variant_id) update("name", e.target.value);
                                }}
                                className="h-8 text-xs"
                            />
                            {row.product_variant_id && (
                                <Button
                                    type="button" variant="ghost" size="sm"
                                    onClick={() => { dispatch({ type: "CLEAR_VARIANT", payload: row.id }); setOpen(false); }}
                                    className="mt-1 h-7 w-full text-xs text-muted-foreground"
                                >
                                    <X className="h-3 w-3 mr-1" /> Detach — make manual
                                </Button>
                            )}
                        </div>
                        <Command shouldFilter={false}>
                            <CommandInput placeholder="Search catalog..." value={query} onValueChange={setQuery} className="h-8 text-xs" />
                            <CommandList>
                                {loading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
                                {!loading && <CommandEmpty className="p-2 text-xs">No product found.</CommandEmpty>}
                                <CommandGroup>
                                    {results.map((v) => (
                                        <CommandItem
                                            key={v.id}
                                            value={`${v.product_name} ${v.variant_name} ${v.sku}`}
                                            onSelect={() => pick(v)}
                                            className="text-xs"
                                        >
                                            <Check className={cn("mr-2 h-3.5 w-3.5", row.product_variant_id === v.id ? "opacity-100" : "opacity-0")} />
                                            <span className="truncate">{v.product_name} ({v.variant_name})</span>
                                            <Badge variant="outline" className="ml-auto text-[9px] px-1 shrink-0">
                                                {v.is_serialized ? "SER" : "BULK"}
                                            </Badge>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
            </div>
            <div className="w-10 shrink-0 border-l border-r h-full flex items-center" title="Battery Health (%)">
                <Input
                    type="number" placeholder="BH" aria-label="Battery Health"
                    disabled={!row.is_serialized} min="0" max="100"
                    value={row.batteryHealth}
                    onChange={(e) => update("batteryHealth", e.target.value)}
                    className="h-full px-0.5 text-center border-none rounded-none text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/20"
                />
            </div>
        </div>
    );
});

// ─── One table row (OG cell styling) ─────────────────────────────────────────

interface RowViewProps {
    row: CalculatedRow;
    index: number;
    hasDupIdentifier: boolean;
}

const RowView = React.memo(function RowView({ row, index, hasDupIdentifier }: RowViewProps) {
    const { state, dispatch, deviceConditions } = usePurchase();
    const cv = state.columnVisibility;

    const update = useCallback(
        (field: keyof LineRow, value: unknown) =>
            dispatch({ type: "UPDATE_ROW", payload: { id: row.id, field, value } }),
        [dispatch, row.id]
    );

    const cycleWarranty = () => {
        const next: Record<WarrantyMode, WarrantyMode> = { A: "D", D: "E", E: "A" };
        update("warrantyMode", next[row.warrantyMode]);
    };
    const cycleTaxMode = () => update("taxMode", row.taxMode === "I" ? "E" : "I");

    const onConditionChange = (code: string) => {
        const opt = deviceConditions.find((c) => c.code === code);
        update("condition", code);
        update("condition_id", opt?.id ?? null);
    };

    const taxLocked = row._isMarginLine; // margin → 0% at purchase, toggle disabled
    const nameInvalid = !(row.product_variant_id ?? row.manual_item_name.trim() ?? row.name.trim());
    const costInvalid = !(row.cost > 0);

    return (
        <TableRow className="p-0 hover:bg-muted/20 border-b">
            <TableCell className="p-0 text-center font-semibold text-muted-foreground border-r bg-muted/10 h-9">
                <span className="inline-flex items-center gap-1">
                    {index + 1}
                    {row._isMarginLine && (
                        <Badge variant="outline" title="Margin scheme — no GST at purchase" className="h-4 px-1 text-[9px] border-amber-500/40 bg-amber-50 text-amber-700">M</Badge>
                    )}
                </span>
            </TableCell>

            {/* PRODUCT & BH */}
            <TableCell className={cn("p-0 border-r h-9", nameInvalid && "bg-destructive/5")}>
                <ProductCell row={row} />
            </TableCell>

            {/* TYPE / condition */}
            {cv.type && (
                <TableCell className="p-0 border-r h-9">
                    <Select value={row.condition} onValueChange={onConditionChange}>
                        <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring">
                            <SelectValue placeholder="Type" />
                        </SelectTrigger>
                        <SelectContent>
                            {deviceConditions.map((c) => (
                                <SelectItem key={c.id} value={c.code} className="text-xs">{c.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* QUALITY */}
            {cv.quality && (
                <TableCell className="p-0 border-r h-9">
                    <Select value={row.quality} onValueChange={(v) => update("quality", v)}>
                        <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring">
                            <SelectValue placeholder="Quality" />
                        </SelectTrigger>
                        <SelectContent>
                            {QUALITIES.map((q) => (
                                <SelectItem key={q} value={q} className="text-xs capitalize">{q}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </TableCell>
            )}

            {/* WARRANTY */}
            {cv.warranty && (
                <TableCell className="p-0 border-r h-9">
                    <div className="flex items-center h-full space-x-1 px-1 w-full min-w-0">
                        <Button
                            type="button" size="icon" onClick={cycleWarranty}
                            title={`Warranty Mode: ${row.warrantyMode === "A" ? "Activation Date" : row.warrantyMode === "D" ? "Duration" : "Expiry Date"}`}
                            aria-label="Toggle Warranty Mode"
                            className={cn(
                                "h-5 w-5 shrink-0 text-[10px] font-extrabold p-0 rounded-xs transition-colors",
                                row.warrantyMode === "A" && "bg-primary text-primary-foreground hover:bg-primary/90",
                                row.warrantyMode === "D" && "bg-muted text-muted-foreground hover:bg-muted/80 border",
                                row.warrantyMode === "E" && "bg-destructive text-white hover:bg-destructive/90 shadow-2xs"
                            )}
                        >
                            {row.warrantyMode}
                        </Button>
                        <div className="flex-1 min-w-0 h-full flex items-center">
                            {row.warrantyMode === "D" ? (
                                <Select value={row.warrantyValue} onValueChange={(v) => update("warrantyValue", v)}>
                                    <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring">
                                        <SelectValue placeholder="Duration" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {WARRANTY_DURATIONS.map((d) => (
                                            <SelectItem key={d} value={d} className="text-xs capitalize">{d}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    type="date" aria-label="Warranty Date"
                                    value={row.warrantyValue} onChange={(e) => update("warrantyValue", e.target.value)}
                                    className="w-full h-full border-none rounded-none shadow-none text-xs px-0.5 focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            )}
                        </div>
                    </div>
                </TableCell>
            )}

            {/* IMEIs & SERIAL */}
            {cv.imeis && (
                <>
                    <TableCell className="p-0 border-r h-9">
                        <Input
                            type="text" placeholder={row.is_serialized ? "IMEI 1" : "N/A"} aria-label="IMEI 1"
                            disabled={!row.is_serialized} value={row.imei1}
                            onChange={(e) => update("imei1", e.target.value)}
                            className={cn("h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground", hasDupIdentifier && row.imei1 && "bg-destructive/10 text-destructive")}
                        />
                    </TableCell>
                    <TableCell className="p-0 border-r h-9">
                        <Input
                            type="text" placeholder={row.is_serialized ? "IMEI 2" : "N/A"} aria-label="IMEI 2"
                            disabled={!row.is_serialized} value={row.imei2}
                            onChange={(e) => update("imei2", e.target.value)}
                            className={cn("h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground", hasDupIdentifier && row.imei2 && "bg-destructive/10 text-destructive")}
                        />
                    </TableCell>
                </>
            )}
            {cv.serial && (
                <TableCell className="p-0 border-r h-9">
                    <Input
                        type="text" placeholder={row.is_serialized ? "Serial No." : "N/A"} aria-label="Serial Number"
                        disabled={!row.is_serialized} value={row.serial}
                        onChange={(e) => update("serial", e.target.value)}
                        className={cn("h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground", hasDupIdentifier && row.serial && "bg-destructive/10 text-destructive")}
                    />
                </TableCell>
            )}

            {/* QTY */}
            <TableCell className="p-0 border-r h-9">
                <Input
                    type="number" min="1" aria-label="Quantity"
                    disabled={row.is_serialized} value={row.qty}
                    onChange={(e) => update("qty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                    title={row.is_serialized ? "Serialized item QTY locked to 1" : "Edit QTY"}
                    className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring font-semibold disabled:bg-muted/30 disabled:text-muted-foreground"
                />
            </TableCell>

            {/* COST */}
            {cv.cost && (
                <TableCell className={cn("p-0 border-r h-9", costInvalid && "bg-destructive/5")}>
                    <Input
                        type="number" step="0.01" placeholder="0.00" aria-label="Cost Price"
                        value={row.cost || ""} onChange={(e) => update("cost", parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </TableCell>
            )}

            {/* DISC% */}
            {cv.disc && (
                <TableCell className="p-0 border-r h-9">
                    <Input
                        type="number" step="0.01" min="0" max="100" aria-label="Discount Percentage"
                        value={row.discPercent} onChange={(e) => update("discPercent", parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </TableCell>
            )}

            {/* TAX: I/E toggle + % */}
            {cv.tax && (
                <TableCell className="p-0 border-r h-9">
                    <div className="flex items-center h-full space-x-0.5 px-0.5" title={taxLocked ? "Margin scheme — tax 0% at purchase" : `Tax ${row.taxMode === "I" ? "Inclusive" : "Exclusive"}`}>
                        <Button
                            type="button" size="icon" onClick={cycleTaxMode} disabled={taxLocked}
                            aria-label="Toggle Tax Mode"
                            className={cn(
                                "h-5 w-5 shrink-0 text-[10px] font-bold p-0 rounded-xs disabled:opacity-40",
                                row.taxMode === "I"
                                    ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            {row.taxMode}
                        </Button>
                        <Input
                            type="number" step="0.01" min="0" max="100" aria-label="Tax Percentage"
                            value={row.taxPercent} disabled={taxLocked}
                            onChange={(e) => update("taxPercent", parseFloat(e.target.value) || 0)}
                            className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/20"
                        />
                    </div>
                </TableCell>
            )}

            {/* WHOLESALE */}
            {cv.wholesale && (
                <TableCell className="p-0 border-r h-9">
                    <Input
                        type="number" step="0.01" placeholder="0.00" aria-label="Wholesale Price"
                        value={row.wholesale || ""} onChange={(e) => update("wholesale", parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </TableCell>
            )}

            {/* SELLING */}
            {cv.selling && (
                <TableCell className="p-0 border-r h-9">
                    <Input
                        type="number" step="0.01" placeholder="0.00" aria-label="Selling Price"
                        value={row.selling || ""} onChange={(e) => update("selling", parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring"
                    />
                </TableCell>
            )}

            {/* TOTAL */}
            <TableCell className="p-0 border-r h-9 text-right pr-1 font-medium bg-muted/5 align-middle text-xs">
                ₹{row._lineTotal.toFixed(2)}
            </TableCell>

            {/* ACTIONS */}
            <TableCell className="p-0 h-9 align-middle">
                <div className="flex items-center justify-center space-x-0.5 h-full">
                    <Button type="button" variant="ghost" size="icon" title="Duplicate row specs" aria-label="Duplicate Row"
                        onClick={() => dispatch({ type: "DUPLICATE_ROW", payload: row.id })}
                        className="h-6 w-6 text-muted-foreground hover:text-foreground p-0">
                        <Copy className="w-3 h-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" title="Delete row" aria-label="Delete Row"
                        onClick={() => dispatch({ type: "REMOVE_ROW", payload: row.id })}
                        className="h-6 w-6 text-destructive hover:bg-destructive/10 p-0">
                        <Trash2 className="w-3 h-3" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
});

// ─── Catalog search modal (append) ────────────────────────────────────────────

const CatalogSearchModal = React.memo(function CatalogSearchModal({
    open, onOpenChange, onSelect,
}: {
    open: boolean; onOpenChange: (o: boolean) => void; onSelect: (v: CatalogVariant) => void;
}) {
    const { query, setQuery, results, loading, clearQuery } = useVariantSearch();
    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) clearQuery(); }}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
                <DialogHeader className="p-4 pb-2 border-b bg-muted/30">
                    <DialogTitle className="text-base flex items-center">
                        <Search className="h-4 w-4 mr-2 text-primary" />Quick Product Search
                    </DialogTitle>
                    <DialogDescription className="text-xs">Search the catalog and click to append to line items.</DialogDescription>
                </DialogHeader>
                <div className="px-4 pb-6 space-y-3 pt-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="text" placeholder="Type 3+ chars: name, SKU, barcode…" aria-label="Search Products"
                            value={query} onChange={(e) => setQuery(e.target.value)}
                            className="pl-9 text-xs h-9" autoFocus
                        />
                    </div>
                    <div className="max-h-64 overflow-y-auto border rounded-lg divide-y bg-background shadow-2xs">
                        {loading && <div className="p-4 text-center text-xs text-muted-foreground">Searching…</div>}
                        {!loading && results.length === 0 && (
                            <div className="p-6 text-center text-xs text-muted-foreground">
                                {query.trim().length >= 3 ? "No matching products found." : "Type at least 3 characters."}
                            </div>
                        )}
                        {results.map((v) => (
                            <div
                                key={v.id}
                                onClick={() => { onSelect(v); onOpenChange(false); clearQuery(); }}
                                className="p-3 hover:bg-muted/60 cursor-pointer flex items-center justify-between text-xs transition-colors group"
                            >
                                <div className="space-y-0.5 min-w-0">
                                    <div className="font-medium group-hover:text-primary transition-colors truncate">
                                        {v.product_name} ({v.variant_name})
                                    </div>
                                    <div className="flex items-center space-x-1.5">
                                        <Badge variant={v.is_serialized ? "default" : "secondary"} className="text-[9px] px-1 py-0 h-4">
                                            {v.is_serialized ? "Serialized" : "Non-Serialized"}
                                        </Badge>
                                        <span className="font-mono text-[10px] text-muted-foreground">{v.sku}</span>
                                        {v.tax_pct > 0 && <span className="text-[10px] text-muted-foreground">GST {v.tax_pct}%</span>}
                                    </div>
                                </div>
                                <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                    <Plus className="h-3 w-3 mr-1" /> Add
                                </Button>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
});

// ─── QuickAdd modal (OG flow, production data) ───────────────────────────────

const QuickAddModal = React.memo(function QuickAddModal({
    open, onOpenChange, onAddRows,
}: {
    open: boolean; onOpenChange: (o: boolean) => void; onAddRows: (rows: LineRow[]) => void;
}) {
    const { deviceConditions } = usePurchase();
    const { query, setQuery, results, loading, clearQuery } = useVariantSearch();
    const [product, setProduct] = useState<CatalogVariant | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [condition, setCondition] = useState("used");
    const [quality, setQuality] = useState("super mint");
    const [warrantyVal, setWarrantyVal] = useState("6 months");
    const [batteryHealth, setBatteryHealth] = useState("95");
    const [cost, setCost] = useState(0);
    const [selling, setSelling] = useState(0);
    const [taxMode, setTaxMode] = useState<TaxMode>("E");
    const [taxPercent, setTaxPercent] = useState(0);
    const [qty, setQty] = useState(1);
    const [units, setUnits] = useState<{ imei1: string; imei2: string; serial: string }[]>([{ imei1: "", imei2: "", serial: "" }]);

    const pickProduct = (v: CatalogVariant) => {
        setProduct(v);
        setCost(v.cost_price);
        setSelling(v.selling_price);
        setTaxPercent(v.tax_pct);
        setPickerOpen(false);
        clearQuery();
        if (!v.is_serialized) setUnits([{ imei1: "", imei2: "", serial: "" }]);
    };

    const handleQtyChange = useCallback((newQty: number) => {
        const target = Math.max(1, Math.min(100, newQty));
        setQty(target);
        setUnits((prev) => {
            const next = [...prev];
            while (next.length < target) next.push({ imei1: "", imei2: "", serial: "" });
            next.splice(target);
            return next;
        });
    }, []);

    const handleUnitChange = useCallback((index: number, field: "imei1" | "imei2" | "serial", val: string) => {
        setUnits((prev) => {
            const copy = [...prev];
            copy[index] = { ...copy[index], [field]: val };
            return copy;
        });
    }, []);

    const reset = () => {
        setProduct(null); setQty(1);
        setUnits([{ imei1: "", imei2: "", serial: "" }]);
        setCost(0); setSelling(0); setTaxPercent(0); setTaxMode("E");
        clearQuery();
    };

    const handleConfirm = () => {
        if (!product) return;
        const condOpt = deviceConditions.find((c) => c.code === condition);
        const shared: Partial<LineRow> = {
            condition,
            condition_id: condOpt?.id ?? null,
            quality,
            warrantyMode: "D",
            warrantyValue: warrantyVal,
            batteryHealth: product.is_serialized ? batteryHealth : "",
            cost,
            selling,
            wholesale: cost,
            taxMode,
            taxPercent,
        };
        let rows: LineRow[];
        if (product.is_serialized) {
            rows = units.slice(0, qty).map((u) =>
                rowFromVariant(product, deviceConditions, {
                    ...shared, qty: 1, imei1: u.imei1.trim(), imei2: u.imei2.trim(), serial: u.serial.trim(),
                })
            );
        } else {
            rows = [rowFromVariant(product, deviceConditions, { ...shared, qty })];
        }
        onAddRows(rows);
        onOpenChange(false);
        reset();
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
            <DialogContent className="sm:max-w-xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
                <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
                    <DialogTitle className="text-base flex items-center">
                        <Zap className="h-4 w-4 mr-2 text-primary" />Quick Add Multi-Unit Batch
                    </DialogTitle>
                    <DialogDescription className="text-xs">Pick a product once, set shared specs, scan identifiers, insert.</DialogDescription>
                </DialogHeader>
                <div className="px-4 py-3 space-y-3 text-xs overflow-y-auto flex-1">
                    <div className="space-y-1.5">
                        <label className="font-semibold text-xs flex items-center">
                            <Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />Select Product
                        </label>
                        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full h-9 justify-between text-xs px-3 bg-background">
                                    <span className="font-medium truncate">
                                        {product ? `${product.product_name} (${product.variant_name})` : "Search catalog…"}
                                    </span>
                                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[480px] p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput placeholder="Type 3+ chars…" value={query} onValueChange={setQuery} className="h-9 text-xs" />
                                    <CommandList>
                                        {loading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
                                        <CommandEmpty className="p-3 text-xs">No products found.</CommandEmpty>
                                        <CommandGroup>
                                            {results.map((v) => (
                                                <CommandItem key={v.id} value={`${v.product_name} ${v.variant_name} ${v.sku}`} onSelect={() => pickProduct(v)} className="text-xs">
                                                    <Check className={cn("mr-2 h-3.5 w-3.5", product?.id === v.id ? "opacity-100" : "opacity-0")} />
                                                    <span className="truncate">{v.product_name} ({v.variant_name})</span>
                                                    <Badge variant="outline" className="ml-auto text-[9px] px-1">{v.is_serialized ? "Serialized" : "Bulk"}</Badge>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                        <div className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground flex items-center">
                            <Layers className="h-3 w-3 mr-1" />Shared Item Specification
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Condition</label>
                                <Select value={condition} onValueChange={setCondition}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {deviceConditions.map((c) => (
                                            <SelectItem key={c.id} value={c.code} className="text-xs">{c.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Quality</label>
                                <Select value={quality} onValueChange={setQuality}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {QUALITIES.map((q) => (
                                            <SelectItem key={q} value={q} className="text-xs capitalize">{q}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Warranty</label>
                                <Select value={warrantyVal} onValueChange={setWarrantyVal}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {WARRANTY_DURATIONS.map((d) => (
                                            <SelectItem key={d} value={d} className="text-xs capitalize">{d}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2.5">
                            <div><label className="font-medium text-[11px] mb-1 block">Cost (₹)</label>
                                <Input type="number" value={cost || ""} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-background" /></div>
                            <div><label className="font-medium text-[11px] mb-1 block">Selling (₹)</label>
                                <Input type="number" value={selling || ""} onChange={(e) => setSelling(parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-background" /></div>
                            <div><label className="font-medium text-[11px] mb-1 block">Tax %</label>
                                <Input type="number" value={taxPercent || ""} onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-background" /></div>
                            <div><label className="font-medium text-[11px] mb-1 block">Tax Mode</label>
                                <div className="flex h-8 items-center gap-1">
                                    {(["I", "E"] as TaxMode[]).map((m) => (
                                        <Button key={m} type="button" size="sm" variant={taxMode === m ? "default" : "outline"}
                                            onClick={() => setTaxMode(m)} className="h-8 flex-1 text-xs font-bold" title={m === "I" ? "Tax inclusive in cost" : "Tax exclusive over cost"}>{m}</Button>
                                    ))}
                                </div></div>
                        </div>
                        {product?.is_serialized && (
                            <div><label className="font-medium text-[11px] mb-1 block">Battery Health (%)</label>
                                <Input type="number" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} className="h-8 text-xs bg-background w-32" /></div>
                        )}
                    </div>

                    <div className="flex items-center justify-between border-t pt-3">
                        <div>
                            <div className="font-bold text-xs">Unit Quantity</div>
                            <div className="text-[11px] text-muted-foreground">
                                {product?.is_serialized ? "Generates 1 line item per unit with IMEI/SN" : "Generates 1 single bulk line item"}
                            </div>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Button type="button" variant="outline" size="icon" aria-label="Decrease Quantity" className="h-7 w-7" onClick={() => handleQtyChange(qty - 1)} disabled={!product?.is_serialized}>-</Button>
                            <Input type="number" min="1" max="100" aria-label="Batch Quantity" value={qty}
                                onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)}
                                disabled={!product?.is_serialized} className="h-7 w-16 text-center font-bold text-xs" />
                            <Button type="button" variant="outline" size="icon" aria-label="Increase Quantity" className="h-7 w-7" onClick={() => handleQtyChange(qty + 1)} disabled={!product?.is_serialized}>+</Button>
                        </div>
                    </div>

                    {product?.is_serialized ? (
                        <div className="space-y-2 border rounded-lg p-3 bg-card shadow-2xs">
                            <div className="text-[11px] font-semibold flex items-center justify-between">
                                <span className="flex items-center text-primary"><Barcode className="h-3.5 w-3.5 mr-1" />Unit Barcode / Identifier Scanning ({qty} Units)</span>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {units.slice(0, qty).map((unit, idx) => (
                                    <div key={idx} className="flex items-center space-x-2 text-[11px] bg-muted/20 p-1.5 rounded border">
                                        <Badge variant="outline" className="w-7 h-6 p-0 justify-center font-bold shrink-0 bg-background">#{idx + 1}</Badge>
                                        <Input type="text" placeholder="Scan IMEI 1" aria-label={`IMEI 1 unit ${idx + 1}`} value={unit.imei1} onChange={(e) => handleUnitChange(idx, "imei1", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />
                                        <Input type="text" placeholder="Scan IMEI 2" aria-label={`IMEI 2 unit ${idx + 1}`} value={unit.imei2} onChange={(e) => handleUnitChange(idx, "imei2", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />
                                        <Input type="text" placeholder="Serial No." aria-label={`Serial unit ${idx + 1}`} value={unit.serial} onChange={(e) => handleUnitChange(idx, "serial", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-muted/20 border rounded-lg text-center text-xs text-muted-foreground">
                            {product ? <>Non-serialized item will be added with <strong className="text-foreground">QTY = {qty}</strong>.</> : "Select a product first."}
                        </div>
                    )}
                </div>
                <DialogFooter className="p-3 bg-muted/30 border-t flex items-center justify-between">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" size="sm" onClick={handleConfirm} disabled={!product || cost <= 0}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add {product?.is_serialized ? qty : 1} to Invoice
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});

// ─── Main table ──────────────────────────────────────────────────────────────

export default function LineItemTable() {
    const { state, dispatch, flags, calculatedRows, marginLineCount, deviceConditions } = usePurchase();
    const cv = state.columnVisibility;
    const [searchOpen, setSearchOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);

    const totalQty = useMemo(() => calculatedRows.reduce((s, r) => s + r.qty, 0), [calculatedRows]);

    /** rows sharing an IMEI/serial with another row */
    const dupRowIds = useMemo(() => {
        const seen = new Map<string, string>();
        const dups = new Set<string>();
        for (const r of calculatedRows) {
            for (const key of [r.imei1.trim(), r.imei2.trim(), r.serial.trim()]) {
                if (!key) continue;
                const k = key.toLowerCase();
                if (seen.has(k)) { dups.add(r.id); dups.add(seen.get(k)!); }
                else seen.set(k, r.id);
            }
        }
        return dups;
    }, [calculatedRows]);

    const addRow = useCallback(() => dispatch({ type: "ADD_ROW", payload: blankRow(deviceConditions) }), [dispatch, deviceConditions]);
    const addVariantRow = useCallback((v: CatalogVariant) => {
        dispatch({ type: "ADD_ROW", payload: rowFromVariant(v, deviceConditions) });
    }, [dispatch, deviceConditions]);
    const addRows = useCallback((rows: LineRow[]) => dispatch({ type: "ADD_ROWS", payload: rows }), [dispatch]);

    return (
        <div>
            {/* Header bar (OG) */}
            <div className="flex items-center justify-between bg-muted border-b px-4 py-2 shadow-xs">
                <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-card border">
                        <ShoppingCart className="h-4 w-4 text-primary/80" />
                    </div>
                    <div className="flex items-center divide-x text-sm">
                        <span className="font-medium pr-2">Lines Items: <strong className="ml-1 font-bold">{calculatedRows.length}</strong></span>
                        <span className="font-medium px-2">Qty: <strong className="ml-1 font-bold">{totalQty}</strong></span>
                        {flags.isGstBilled && marginLineCount > 0 && (
                            <span className="pl-2">
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-50 text-amber-700">
                                    Margin: {marginLineCount}/{calculatedRows.length}
                                </Badge>
                            </span>
                        )}
                        {dupRowIds.size > 0 && (
                            <span className="pl-2">
                                <Badge variant="destructive" className="text-[10px]">Duplicate IMEI/Serial</Badge>
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSearchOpen(true)} className="h-7 px-2 text-xs">
                        <Search className="h-3.5 w-3.5 mr-1.5" />Search
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddOpen(true)} className="h-7 px-2 text-xs">
                        <Zap className="h-3.5 w-3.5 mr-1.5" />Quick Add
                    </Button>
                    <Button type="button" size="sm" onClick={addRow} className="h-7 px-2 text-xs">
                        <Plus className="h-3.5 w-3.5 mr-1.5" />Add Row
                    </Button>
                </div>
            </div>

            {/* Grid table (OG) */}
            <div className="w-full overflow-x-auto">
                <Table className="w-full border-collapse text-xs table-auto">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-8 text-center p-1 border-r border-b font-bold text-foreground">#</TableHead>
                            <TableHead className="min-w-[170px] px-2 py-1 border-r border-b font-bold text-foreground">PRODUCT & BH</TableHead>
                            {cv.type && <TableHead className="w-28 min-w-[110px] px-2 py-1 border-r border-b font-bold text-foreground">TYPE</TableHead>}
                            {cv.quality && <TableHead className="w-28 min-w-[110px] px-2 py-1 border-r border-b font-bold text-foreground">QUALITY</TableHead>}
                            {cv.warranty && <TableHead className="w-28 min-w-[120px] px-2 py-1 border-r border-b font-bold text-foreground">WARRANTY</TableHead>}
                            {cv.imeis && (<><TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 1</TableHead><TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 2</TableHead></>)}
                            {cv.serial && <TableHead className="min-w-[90px] px-2 py-1 border-r border-b font-bold text-foreground">SERIAL</TableHead>}
                            <TableHead className="w-10 p-1 border-r border-b font-bold text-foreground text-center">QTY</TableHead>
                            {cv.cost && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">COST</TableHead>}
                            {cv.disc && <TableHead className="w-11 p-1 border-r border-b font-bold text-foreground text-center">DISC%</TableHead>}
                            {cv.tax && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">TAX</TableHead>}
                            {cv.wholesale && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">WHOLESALE</TableHead>}
                            {cv.selling && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">SELLING</TableHead>}
                            <TableHead className="min-w-[80px] px-2 py-1 border-r border-b font-bold text-foreground text-right">TOTAL</TableHead>
                            <TableHead className="w-8 p-1 border-b font-bold text-foreground text-center">*</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {calculatedRows.map((row, i) => (
                            <RowView key={row.id} row={row} index={i} hasDupIdentifier={dupRowIds.has(row.id)} />
                        ))}
                        {calculatedRows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={20} className="text-center py-10 text-muted-foreground">
                                    <div className="flex flex-col items-center gap-2">
                                        <ShoppingCart className="h-8 w-8 opacity-30" />
                                        <p className="text-sm font-medium">No line items yet</p>
                                        <p className="text-xs">Search the catalog, Quick Add a batch, or add a manual row.</p>
                                        <div className="flex gap-2 mt-1">
                                            <Button type="button" variant="outline" size="sm" onClick={() => setSearchOpen(true)} className="h-7 text-xs"><Search className="h-3.5 w-3.5 mr-1" />Search</Button>
                                            <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddOpen(true)} className="h-7 text-xs"><Zap className="h-3.5 w-3.5 mr-1" />Quick Add</Button>
                                            <Button type="button" size="sm" onClick={addRow} className="h-7 text-xs"><Plus className="h-3.5 w-3.5 mr-1" />Add Row</Button>
                                        </div>
                                    </div>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>

                {calculatedRows.length > 4 && (
                    <div className="flex items-center justify-between bg-muted/50 border-b border-l border-r p-4 text-xs">
                        <div className="flex items-center space-x-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSearchOpen(true)} className="h-7 px-2 text-xs"><Search className="h-3.5 w-3.5 mr-1.5" />Search</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddOpen(true)} className="h-7 px-2 text-xs"><Zap className="h-3.5 w-3.5 mr-1.5" />Quick Add</Button>
                            <Button type="button" size="sm" onClick={addRow} className="h-7 px-2 text-xs"><Plus className="h-3.5 w-3.5 mr-1.5" />Add Row</Button>
                        </div>
                        <span className="text-muted-foreground">Showing {calculatedRows.length} line items</span>
                    </div>
                )}
            </div>

            <CatalogSearchModal open={searchOpen} onOpenChange={setSearchOpen} onSelect={addVariantRow} />
            <QuickAddModal open={quickAddOpen} onOpenChange={setQuickAddOpen} onAddRows={addRows} />
        </div>
    );
}

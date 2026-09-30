import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, Smartphone, Package, ScanLine, X, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStockSearch } from "../use-stock-search";
import {
    useSale, inr, unitPriceFor, batchPriceFor,
    type SearchMode, type StockUnitMeta, type SearchBatch, type BulkSearchResult,
} from "../sale-context";
import { toast } from "sonner";

const MODES: { id: SearchMode; label: string }[] = [
    { id: "serialized", label: "Serialized" },
    { id: "bulk", label: "Non-serialized" },
    { id: "all", label: "All" },
];

const PLACEHOLDERS: Record<SearchMode, string> = {
    serialized: "Scan IMEI / serial or type product name…  ( / )",
    bulk: "Type product name, SKU or barcode…  ( / )",
    all: "Scan IMEI / serial / barcode or type name, SKU…  ( / )",
};

function unitLabel(u: StockUnitMeta): string {
    return u.imei1 || u.imei2 || u.serial_number || `#${u.id}`;
}

type FlatItem =
    | { kind: "unit"; unit: StockUnitMeta; pool: StockUnitMeta[] }
    | { kind: "product"; product: BulkSearchResult };

export default function PosSearchBar() {
    const { state, dispatch } = useSale();
    const { query, setQuery, mode, setSearchMode, data, loading, searched, clear } = useStockSearch();
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [batchPick, setBatchPick] = useState<Record<number, number>>({});
    const [activeIdx, setActiveIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const units = data?.units?.units ?? [];
    const products = data?.products ?? [];

    const cartedUnitIds = useMemo(() => {
        const s = new Set<number>();
        for (const l of state.lines) for (const id of l.unit_ids) s.add(id);
        return s;
    }, [state.lines]);

    // Flattened keyboard navigation: units first, then products.
    const flat: FlatItem[] = useMemo(() => [
        ...units.map((u): FlatItem => ({ kind: "unit", unit: u, pool: units })),
        ...products.map((p): FlatItem => ({ kind: "product", product: p })),
    ], [units, products]);

    // Scanner fast-path: an exact IMEI/serial hit adds the unit straight to
    // the cart — no dropdown, no click.
    useEffect(() => {
        const u = data?.units;
        if (u?.exact && u.units.length === 1) {
            const unit = u.units[0];
            if (!cartedUnitIds.has(unit.id)) {
                dispatch({ type: "ADD_EXACT_UNIT", payload: { unit, pool: u.units } });
                toast.success(`${unit.name} · ${unitLabel(unit)} added`);
            } else {
                toast.info("That unit is already in the cart.");
            }
            clear();
            setOpen(false);
            inputRef.current?.focus();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data]);

    // "/" focuses the search from anywhere on the page.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
            if (e.key === "/" && !typing) {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // Close dropdown on outside click.
    useEffect(() => {
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, []);

    useEffect(() => { setActiveIdx(0); setExpandedId(null); setBatchPick({}); }, [data]);

    const addUnit = (unit: StockUnitMeta, pool: StockUnitMeta[]) => {
        if (cartedUnitIds.has(unit.id)) {
            toast.info("That unit is already in the cart.");
            return;
        }
        dispatch({ type: "ADD_EXACT_UNIT", payload: { unit, pool } });
        toast.success(`${unit.name} · ${unitLabel(unit)} added`);
        clear();
        setOpen(false);
        inputRef.current?.focus();
    };

    const addBulk = (product: BulkSearchResult, batch: SearchBatch) => {
        dispatch({ type: "ADD_BULK_PRODUCT", payload: { product, batch } });
        toast.success(`${product.product_name} · ${batch.batch_number} added`);
        clear();
        setOpen(false);
        inputRef.current?.focus();
    };

    const chosenBatch = (p: BulkSearchResult): SearchBatch | undefined =>
        p.batches.find((b) => b.id === batchPick[p.variant_id]) ?? p.batches[0];

    const activate = (item: FlatItem) => {
        if (item.kind === "unit") addUnit(item.unit, item.pool);
        else {
            const b = chosenBatch(item.product);
            if (!b) {
                toast.warning("No saleable batch for this product.");
                return;
            }
            addBulk(item.product, b);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            clear();
            setOpen(false);
            inputRef.current?.blur();
            return;
        }
        if (!open || flat.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, flat.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            activate(flat[activeIdx]);
        }
    };

    const price = (n: number) => `₹${inr(n, n % 1 === 0 ? 0 : 2)}`;
    const emptySearch = !loading && searched && units.length === 0 && products.length === 0;

    return (
        <div ref={wrapRef} className="relative">
            <div className="flex gap-2">
                <div
                    className="flex shrink-0 items-center gap-0.5 rounded-xl border border-border bg-card p-1 shadow-sm"
                    role="tablist"
                    aria-label="Search scope"
                >
                    {MODES.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            role="tab"
                            aria-selected={mode === m.id}
                            onClick={() => { setSearchMode(m.id); setOpen(true); inputRef.current?.focus(); }}
                            className={cn(
                                "rounded-lg px-2.5 py-2 text-xs font-medium whitespace-nowrap transition-colors",
                                mode === m.id
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
                    <Input
                        ref={inputRef}
                        autoFocus
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                        onFocus={() => setOpen(true)}
                        onKeyDown={onKeyDown}
                        placeholder={PLACEHOLDERS[mode]}
                        className="h-14 pl-12 pr-12 text-base rounded-xl shadow-sm"
                        aria-label="Search stock"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                        {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                        {query && (
                            <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => { clear(); inputRef.current?.focus(); }} aria-label="Clear search">
                                <X className="size-4" />
                            </Button>
                        )}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button type="button" variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" aria-label="How to sell fast">
                                    <Info className="size-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent side="bottom" align="end" className="w-80">
                                <p className="text-sm font-semibold">How to sell fast</p>
                                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-muted-foreground">
                                    <li>Scan an IMEI / serial — an exact hit adds that unit instantly.</li>
                                    <li>Type a name, then <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">Enter</kbd> to add the first match.</li>
                                    <li>Non-serialized products show their batches — FIFO is preselected, pick another batch to sell from it.</li>
                                    <li>Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">/</kbd> anywhere to jump back to search.</li>
                                    <li>Prices follow the Retail / Wholesale toggle in the header.</li>
                                </ul>
                            </PopoverContent>
                        </Popover>
                        <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">/</kbd>
                    </div>
                </div>
            </div>

            {open && (
                <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                    {query.trim().length >= 2 ? (
                        <div className="max-h-[440px] overflow-y-auto p-1.5">
                            {loading && units.length === 0 && products.length === 0 && (
                                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" /> Searching stock…
                                </div>
                            )}
                            {emptySearch && (
                                <p className="py-8 text-center text-sm text-muted-foreground">No stock found for “{query.trim()}”.</p>
                            )}

                            {units.length > 0 && (
                                <>
                                    {(mode === "all") && (
                                        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Units</p>
                                    )}
                                    {units.map((u) => {
                                        const taken = cartedUnitIds.has(u.id);
                                        const idx = flat.findIndex((f) => f.kind === "unit" && f.unit.id === u.id);
                                        return (
                                            <div
                                                key={`u-${u.id}`}
                                                className={cn(
                                                    "flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-muted",
                                                    idx === activeIdx && "bg-muted/70",
                                                    taken && "opacity-50"
                                                )}
                                                onClick={() => addUnit(u, units)}
                                                onMouseEnter={() => idx >= 0 && setActiveIdx(idx)}
                                            >
                                                <div className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                                                    <Smartphone className="size-4 text-muted-foreground" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-medium">{u.name}</p>
                                                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                                                        {unitLabel(u)}
                                                        {u.imei2 && u.imei1 !== u.imei2 ? ` · ${u.imei2}` : ""}
                                                    </p>
                                                </div>
                                                {u.warranty && (
                                                    <span className="hidden sm:inline shrink-0 text-[11px] text-muted-foreground">{u.warranty}</span>
                                                )}
                                                <Badge variant="outline" className="shrink-0 text-[10px]">{u.device_condition}</Badge>
                                                <span className="shrink-0 text-sm font-semibold">{price(unitPriceFor(u, state.saleMode))}</span>
                                                {taken && <Badge variant="secondary" className="shrink-0">in cart</Badge>}
                                            </div>
                                        );
                                    })}
                                </>
                            )}

                            {products.length > 0 && (
                                <>
                                    {(mode === "all") && (
                                        <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Products</p>
                                    )}
                                    {products.map((p) => {
                                        const expanded = expandedId === p.variant_id;
                                        const batch = chosenBatch(p);
                                        const idx = flat.findIndex((f) => f.kind === "product" && f.product.variant_id === p.variant_id);
                                        return (
                                            <div key={`p-${p.variant_id}`} className={cn("rounded-lg", idx === activeIdx && "bg-muted/70")}>
                                                <div
                                                    className="flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-muted"
                                                    onClick={() => setExpandedId(expanded ? null : p.variant_id)}
                                                    onMouseEnter={() => idx >= 0 && setActiveIdx(idx)}
                                                >
                                                    {p.img ? (
                                                        <img src={p.img} alt="" className="size-10 rounded object-cover shrink-0" />
                                                    ) : (
                                                        <div className="size-10 rounded bg-muted flex items-center justify-center shrink-0">
                                                            <Package className="size-4 text-muted-foreground" />
                                                        </div>
                                                    )}
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium">
                                                            {p.product_name}{p.variant_name ? ` (${p.variant_name})` : ""}
                                                        </p>
                                                        <p className="truncate text-[11px] text-muted-foreground font-mono">
                                                            {p.sku}{p.barcode ? ` · ${p.barcode}` : ""}
                                                            {batch ? ` · ${batch.batch_number}` : ""}
                                                        </p>
                                                    </div>
                                                    <Badge variant={p.available_qty > 0 ? "default" : "destructive"} className="shrink-0">
                                                        {p.available_qty} in stock
                                                    </Badge>
                                                    <span className="shrink-0 text-sm font-semibold">
                                                        {batch ? price(batchPriceFor(batch, p, state.saleMode)) : "—"}
                                                    </span>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        className="h-7 shrink-0 text-xs"
                                                        disabled={!batch || p.available_qty < 1}
                                                        onClick={(e) => { e.stopPropagation(); if (batch) addBulk(p, batch); }}
                                                    >
                                                        Add
                                                    </Button>
                                                </div>
                                                {expanded && (
                                                    <div className="px-2.5 pb-2.5 pt-0.5">
                                                        <p className="mb-1.5 text-[11px] text-muted-foreground">
                                                            Pick a batch — FIFO is preselected{p.batches.length > 1 ? ", or choose another" : ""}:
                                                        </p>
                                                        <div className="space-y-1">
                                                            {p.batches.map((b, bi) => {
                                                                const selected = (batchPick[p.variant_id] ?? p.batches[0]?.id) === b.id;
                                                                return (
                                                                    <button
                                                                        key={b.id}
                                                                        type="button"
                                                                        onClick={() => setBatchPick((m) => ({ ...m, [p.variant_id]: b.id }))}
                                                                        className={cn(
                                                                            "flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left text-xs",
                                                                            selected
                                                                                ? "border-primary bg-primary/5"
                                                                                : "border-border/60 hover:border-border"
                                                                        )}
                                                                    >
                                                                        <span className={cn(
                                                                            "flex size-4 shrink-0 items-center justify-center rounded-full border",
                                                                            selected ? "border-primary" : "border-muted-foreground/40"
                                                                        )}>
                                                                            {selected && <span className="size-2 rounded-full bg-primary" />}
                                                                        </span>
                                                                        <span className="font-mono font-medium">{b.batch_number}</span>
                                                                        {bi === 0 && (
                                                                            <Badge variant="secondary" className="text-[10px] px-1 py-0">FIFO</Badge>
                                                                        )}
                                                                        <Badge variant="outline" className="text-[10px] px-1 py-0">{b.product_condition}</Badge>
                                                                        {b.remaining_warranty && (
                                                                            <span className="text-muted-foreground">{b.remaining_warranty}</span>
                                                                        )}
                                                                        <span className="ml-auto shrink-0 text-muted-foreground">{b.remaining_qty} pcs</span>
                                                                        <span className="shrink-0 font-semibold">{price(batchPriceFor(b, p, state.saleMode))}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

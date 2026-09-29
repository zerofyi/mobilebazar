import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, Loader2, ChevronDown, Smartphone, Package, ScanLine, X, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useStockSearch } from "../use-stock-search";
import { useSale, inr, displaySearchPrice, type StockSearchResult, type StockUnitMeta } from "../sale-context";
import { toast } from "sonner";

interface Props {
    initialProducts: StockSearchResult[];
}

function unitLabel(u: StockUnitMeta): string {
    return u.imei1 || u.serial_number || `#${u.id}`;
}

export default function PosSearchBar({ initialProducts }: Props) {
    const { state, dispatch } = useSale();
    const { query, setQuery, results, loading, searched, clear } = useStockSearch();
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [activeIdx, setActiveIdx] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);

    const cartedUnitIds = useMemo(() => {
        const s = new Set<number>();
        for (const l of state.lines) for (const id of l.unit_ids) s.add(id);
        return s;
    }, [state.lines]);

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

    useEffect(() => { setActiveIdx(0); setExpandedId(null); }, [results]);

    const addExactUnit = (unit: StockUnitMeta, variant: StockSearchResult) => {
        if (cartedUnitIds.has(unit.id)) {
            toast.info("That unit is already in the cart.");
            return;
        }
        dispatch({ type: "ADD_EXACT_UNIT", payload: { unit, variant } });
        toast.success(`${variant.product_name} · ${unitLabel(unit)} added`);
        clear();
        setOpen(false);
        inputRef.current?.focus();
    };

    const addVariant = (variant: StockSearchResult) => {
        if (variant.is_serialized) {
            if (variant.exact_unit) {
                addExactUnit(variant.exact_unit, variant);
                return;
            }
            const next = (variant.units ?? []).find((u) => !cartedUnitIds.has(u.id));
            if (!next) {
                toast.warning("No available units left for this product.");
                return;
            }
            addExactUnit(next, variant);
            return;
        }
        const line = state.lines.find((l) => l.product_variant_id === variant.variant_id && !l.is_serialized);
        if (variant.available_qty < 1 || (line && line.qty >= line.available_qty)) {
            toast.warning(`Only ${variant.available_qty} in stock.`);
            return;
        }
        dispatch({ type: "ADD_VARIANT", payload: { variant } });
        toast.success(`${variant.product_name} added`);
        clear();
        setOpen(false);
        inputRef.current?.focus();
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            clear();
            setOpen(false);
            inputRef.current?.blur();
            return;
        }
        if (!open || results.length === 0) return;
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIdx((i) => Math.min(i + 1, results.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIdx((i) => Math.max(i - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            addVariant(results[activeIdx]);
        }
    };

    const showQuickPicks = query.trim().length < 2 && initialProducts.length > 0;

    return (
        <div ref={wrapRef} className="relative">
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-muted-foreground pointer-events-none" />
                <Input
                    ref={inputRef}
                    autoFocus
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    placeholder="Scan IMEI / serial / barcode or type product name, SKU…  ( / )"
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
                                <li>Scan an IMEI / serial / barcode — an exact hit adds that unit instantly.</li>
                                <li>Type a name or SKU, then <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">Enter</kbd> to add the first match.</li>
                                <li>For serialized products, tap the row to pick a specific unit from stock.</li>
                                <li>Press <kbd className="rounded border border-border bg-muted px-1 font-mono text-[11px]">/</kbd> anywhere to jump back to search.</li>
                                <li>Prices follow the Retail / Wholesale toggle in the header.</li>
                            </ul>
                        </PopoverContent>
                    </Popover>
                    <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">/</kbd>
                </div>
            </div>

            {open && (
                <div className="absolute z-40 mt-2 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
                    {showQuickPicks ? (
                        <div className="p-2">
                            <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Quick picks</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {initialProducts.slice(0, 8).map((v) => (
                                    <button
                                        key={v.variant_id}
                                        type="button"
                                        onClick={() => addVariant(v)}
                                        disabled={v.available_qty < 1}
                                        className="flex items-center gap-2.5 rounded-lg border border-border/60 p-2 text-left hover:bg-muted/60 disabled:opacity-40"
                                    >
                                        {v.img ? (
                                            <img src={v.img} alt="" className="size-9 rounded object-cover shrink-0" />
                                        ) : (
                                            <div className="size-9 rounded bg-muted flex items-center justify-center shrink-0">
                                                {v.is_serialized ? <Smartphone className="size-4 text-muted-foreground" /> : <Package className="size-4 text-muted-foreground" />}
                                            </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-xs font-medium">{v.product_name}{v.variant_name ? ` (${v.variant_name})` : ""}</p>
                                            <p className="text-[11px] text-muted-foreground">₹{inr(displaySearchPrice(v, state.saleMode), 0)} · {v.available_qty} in stock</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : query.trim().length >= 2 ? (
                        <div className="max-h-[420px] overflow-y-auto p-1.5">
                            {loading && results.length === 0 && (
                                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" /> Searching stock…
                                </div>
                            )}
                            {!loading && searched && results.length === 0 && (
                                <p className="py-8 text-center text-sm text-muted-foreground">No stock found for “{query.trim()}”.</p>
                            )}
                            {results.map((v, i) => {
                                const expanded = expandedId === v.variant_id;
                                const exactHit = v.exact_unit != null;
                                return (
                                    <div key={v.variant_id} className={cn("rounded-lg", i === activeIdx && "bg-muted/70")}>
                                        <div
                                            className="flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer hover:bg-muted"
                                            onClick={() => (v.is_serialized && !exactHit ? setExpandedId(expanded ? null : v.variant_id) : addVariant(v))}
                                            onMouseEnter={() => setActiveIdx(i)}
                                        >
                                            {v.img ? (
                                                <img src={v.img} alt="" className="size-10 rounded object-cover shrink-0" />
                                            ) : (
                                                <div className="size-10 rounded bg-muted flex items-center justify-center shrink-0">
                                                    {v.is_serialized ? <Smartphone className="size-4 text-muted-foreground" /> : <Package className="size-4 text-muted-foreground" />}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-sm font-medium">
                                                    {v.product_name}{v.variant_name ? ` (${v.variant_name})` : ""}
                                                </p>
                                                <p className="truncate text-[11px] text-muted-foreground font-mono">
                                                    {v.sku}{v.barcode ? ` · ${v.barcode}` : ""}
                                                </p>
                                            </div>
                                            {exactHit && (
                                                <Badge variant="secondary" className="shrink-0 gap-1">
                                                    <ScanLine className="size-3" /> {unitLabel(v.exact_unit!)}
                                                </Badge>
                                            )}
                                            <Badge variant={v.available_qty > 0 ? "default" : "destructive"} className="shrink-0">
                                                {v.available_qty} in stock
                                            </Badge>
                                            <span className="shrink-0 text-sm font-semibold">₹{inr(displaySearchPrice(v, state.saleMode), displaySearchPrice(v, state.saleMode) % 1 === 0 ? 0 : 2)}</span>
                                            {v.is_serialized && !exactHit && (
                                                <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                                            )}
                                        </div>
                                        {expanded && v.is_serialized && (
                                            <div className="px-2.5 pb-2.5 pt-0.5">
                                                <p className="mb-1.5 text-[11px] text-muted-foreground">Tap a unit to add it:</p>
                                                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                                                    {(v.units ?? []).map((u) => {
                                                        const taken = cartedUnitIds.has(u.id);
                                                        return (
                                                            <button
                                                                key={u.id}
                                                                type="button"
                                                                disabled={taken}
                                                                onClick={() => addExactUnit(u, v)}
                                                                className={cn(
                                                                    "rounded-md border px-2 py-1 font-mono text-[11px]",
                                                                    taken
                                                                        ? "border-border bg-muted text-muted-foreground line-through opacity-60"
                                                                        : "border-border bg-card hover:border-primary hover:bg-primary/5"
                                                                )}
                                                                title={`${u.device_condition}${u.overall_health ? ` · ${u.overall_health}` : ""}`}
                                                            >
                                                                {unitLabel(u)}
                                                                <span className="ml-1.5 text-muted-foreground">{u.device_condition}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    );
}

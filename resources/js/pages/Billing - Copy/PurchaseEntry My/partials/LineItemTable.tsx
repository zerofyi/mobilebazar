import React, { memo, useCallback, useMemo, useState } from 'react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Copy, Plus, Trash2, Zap, ChevronsUpDown, ClipboardPaste, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePurchase, type LineRow, type WarrantyMode, type CatalogVariant } from '../purchase-context';
import { useVariantSearch } from '@/hooks/use-purchase-search';

// ─── Blank row factory ────────────────────────────────────────────────────────

function blankRow(variant?: CatalogVariant): LineRow {
    return {
        id: crypto.randomUUID(),
        product_variant_id: variant?.id ?? null,
        manual_item_name: '',
        name: variant ? `${variant.product_name} (${variant.variant_name})` : '',
        sku: variant?.sku ?? '',
        hsn_code: variant?.hsn_code ?? '',
        is_serialized: variant?.is_serialized ?? true,
        imei1: '', imei2: '', serial: '',
        batteryHealth: '',
        condition: 'used', condition_id: null,
        quality: '',
        warrantyMode: 'D', warrantyValue: '',
        qty: 1, cost: variant?.cost_price ?? 0,
        discPercent: 0, taxPercent: variant?.tax_pct ?? 18,
        wholesale: variant?.min_selling_price ?? 0,
        selling: variant?.selling_price ?? 0,
    };
}

function cycleWarranty(mode: WarrantyMode): WarrantyMode {
    return mode === 'D' ? 'A' : mode === 'A' ? 'E' : 'D';
}

const WARRANTY_LABELS: Record<WarrantyMode, string> = { D: 'D', A: 'A', E: 'E' };
const WARRANTY_PLACEHOLDER: Record<WarrantyMode, string> = {
    D: 'e.g. 8 Months',
    A: 'Activation date',
    E: 'Expiry date',
};

// ─── Enter-key navigation across a row ──────────────────────────────────────

function navOnEnter(e: React.KeyboardEvent<HTMLElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const row = (e.target as HTMLElement).closest('tr');
    if (!row) return;
    const inputs = Array.from(row.querySelectorAll('input, button[role="combobox"]')) as HTMLElement[];
    const idx = inputs.indexOf(e.target as HTMLElement);
    inputs[idx + 1]?.focus();
}

// ─── Quick Add (bulk paste) modal ────────────────────────────────────────────

interface QuickAddModalProps {
    open: boolean;
    onOpenChange: (o: boolean) => void;
    onImport: (variant: CatalogVariant, lines: { imei1: string; imei2: string; serial: string }[]) => void;
}

function QuickAddModal({ open, onOpenChange, onImport }: QuickAddModalProps) {
    const { query, setQuery, results, loading } = useVariantSearch();
    const [selected, setSelected] = useState<CatalogVariant | null>(null);
    const [raw, setRaw] = useState('');

    const parsed = useMemo(() => {
        return raw.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
            const parts = line.split(/\t|,/).map((p) => p.trim());
            return { imei1: parts[0] ?? '', imei2: parts[1] ?? '', serial: parts[2] ?? '' };
        });
    }, [raw]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-sm flex items-center gap-2">
                        <ClipboardPaste className="size-4 text-primary" /> Paste Many Units
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Select a serialized variant, then paste IMEI/serial data — one unit per line.</p>
                        <div className="relative">
                            <Input
                                placeholder="Search catalog variant…"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                className="h-8 text-xs"
                            />
                            {(results.length > 0 || loading) && (
                                <div className="absolute top-full mt-0.5 left-0 right-0 z-20 bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
                                    {loading && <p className="px-2 py-1.5 text-xs text-muted-foreground">Searching…</p>}
                                    {results.filter((v) => v.is_serialized).map((v) => (
                                        <button
                                            key={v.id}
                                            className="w-full text-left px-2 py-1.5 text-xs hover:bg-muted/50 flex items-center gap-2"
                                            onClick={() => { setSelected(v); setQuery(v.product_name + ' ' + v.variant_name); }}
                                        >
                                            {selected?.id === v.id && <Check className="size-3 text-primary shrink-0" />}
                                            <span className="font-medium">{v.product_name} — {v.variant_name}</span>
                                            <span className="text-muted-foreground text-[10px] font-mono ml-auto">{v.sku}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[10px] text-muted-foreground">IMEI1, IMEI2, Serial — tab or comma separated</p>
                        <Textarea
                            value={raw}
                            onChange={(e) => setRaw(e.target.value)}
                            rows={7}
                            placeholder={'351234567891234\n351234567891235, 351234567891236\n351234567891237\t\tSN-00123'}
                            className="text-xs font-mono"
                        />
                        <p className="text-[10px] text-muted-foreground">{parsed.length} unit{parsed.length !== 1 ? 's' : ''} detected</p>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        size="sm"
                        disabled={!selected || parsed.length === 0}
                        onClick={() => { if (selected) { onImport(selected, parsed); onOpenChange(false); } }}
                    >
                        Add {parsed.length} Row{parsed.length !== 1 ? 's' : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─── Individual row ──────────────────────────────────────────────────────────

interface RowProps {
    item: LineRow & { _lineTotal: number };
    index: number;
    openComboId: string | null;
    setOpenComboId: React.Dispatch<React.SetStateAction<string | null>>;
}

const PurchaseRow = memo(({ item, index, openComboId, setOpenComboId }: RowProps) => {
    const { state, dispatch, deviceConditions, flags, vendorIsRegistered } = usePurchase();
    const { columnVisibility } = state;
    const { query, setQuery, results, loading, clearQuery } = useVariantSearch();

    const isSerialized = item.is_serialized;
    const warrantyClass = item.warrantyMode === 'A' ? 'bg-primary text-primary-foreground' : item.warrantyMode === 'E' ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground';
    const showImeis = columnVisibility.imeis && isSerialized;
    const showSerial = columnVisibility.serial && isSerialized;
    const showTax = columnVisibility.tax && flags.isGstBilled;

    const updateField = useCallback(
        <K extends keyof LineRow>(field: K, value: LineRow[K]) =>
            dispatch({ type: 'UPDATE_ROW', payload: { id: item.id, field, value } }),
        [dispatch, item.id],
    );

    const handleVariantSelect = useCallback((v: CatalogVariant) => {
        const updated: Partial<LineRow> = {
            product_variant_id: v.id,
            name: `${v.product_name} (${v.variant_name})`,
            sku: v.sku,
            hsn_code: v.hsn_code,
            is_serialized: v.is_serialized,
            cost: v.cost_price,
            taxPercent: v.tax_pct,
            wholesale: v.min_selling_price,
            selling: v.selling_price,
            qty: v.is_serialized ? 1 : item.qty,
        };
        Object.entries(updated).forEach(([k, val]) =>
            dispatch({ type: 'UPDATE_ROW', payload: { id: item.id, field: k as keyof LineRow, value: val } }),
        );
        setOpenComboId(null);
        clearQuery();
    }, [dispatch, item.id, item.qty, setOpenComboId, clearQuery]);

    return (
        <TableRow className="p-0 hover:bg-muted/20 border-b">
            {/* # */}
            <TableCell className="p-0 text-center font-semibold text-muted-foreground border-r bg-muted/10 h-9 w-6">{index + 1}</TableCell>

            {/* PRODUCT & BH */}
            {columnVisibility.productBh && (
                <TableCell className="p-0 border-r h-9 min-w-[160px]">
                    <div className="flex items-center h-full">
                        {/* Product combobox */}
                        <Popover open={openComboId === item.id} onOpenChange={(o) => setOpenComboId(o ? item.id : null)}>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="ghost"
                                    role="combobox"
                                    className="flex-1 h-full justify-between px-1.5 text-xs font-normal rounded-none hover:bg-transparent border-none focus-visible:ring-1"
                                >
                                    <span className="truncate">{item.name || 'Search product…'}</span>
                                    <ChevronsUpDown className="ml-0.5 size-3 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[260px] p-0" align="start">
                                <Command shouldFilter={false}>
                                    <CommandInput
                                        placeholder="Search catalog…"
                                        className="h-8 text-xs"
                                        value={query}
                                        onValueChange={setQuery}
                                    />
                                    <CommandList>
                                        {loading && <CommandEmpty>Searching…</CommandEmpty>}
                                        {!loading && results.length === 0 && query.length >= 2 && (
                                            <CommandEmpty>No results. Try a different search.</CommandEmpty>
                                        )}
                                        <CommandGroup>
                                            {results.map((v) => (
                                                <CommandItem key={v.id} value={v.sku} onSelect={() => handleVariantSelect(v)} className="text-xs">
                                                    <div className="min-w-0">
                                                        <p className="font-semibold truncate">{v.product_name} — {v.variant_name}</p>
                                                        <p className="text-[10px] font-mono text-muted-foreground">{v.sku}</p>
                                                    </div>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                        {/* Off-catalog fallback */}
                                        {query.length >= 2 && (
                                            <div className="p-1 border-t border-border">
                                                <button
                                                    className="w-full text-left px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/50 rounded-sm"
                                                    onMouseDown={() => {
                                                        updateField('name', query);
                                                        updateField('manual_item_name', query);
                                                        setOpenComboId(null);
                                                        clearQuery();
                                                    }}
                                                >
                                                    Add off-catalog: "<span className="font-medium">{query}</span>"
                                                </button>
                                            </div>
                                        )}
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>

                        {/* Battery health — serialized only */}
                        {isSerialized && (
                            <div className="w-12 shrink-0 border-l h-full flex items-center">
                                <Input
                                    placeholder="BH%"
                                    value={item.batteryHealth}
                                    onKeyDown={navOnEnter}
                                    onChange={(e) => updateField('batteryHealth', e.target.value)}
                                    className="h-full border-none rounded-none text-[10px] text-center p-0.5 focus-visible:ring-0 bg-transparent"
                                />
                            </div>
                        )}
                    </div>
                </TableCell>
            )}

            {/* TYPE / CONDITION */}
            {columnVisibility.type && (
                <TableCell className="p-0 border-r h-9 w-28">
                    {isSerialized ? (
                        <Select
                            value={item.condition_id ? String(item.condition_id) : ''}
                            onValueChange={(val) => {
                                const cond = deviceConditions.find((c) => String(c.id) === val);
                                if (cond) { updateField('condition_id', cond.id); updateField('condition', cond.code); }
                            }}
                        >
                            <SelectTrigger className="h-full w-full border-0 rounded-none text-[10px] focus:ring-0 bg-transparent px-1.5">
                                <SelectValue placeholder="Condition…" />
                            </SelectTrigger>
                            <SelectContent>
                                {deviceConditions.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)} className="text-xs">{c.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <span className="flex items-center h-full px-1.5 text-[10px] text-muted-foreground">Bulk</span>
                    )}
                </TableCell>
            )}

            {/* QUALITY */}
            {columnVisibility.quality && (
                <TableCell className="p-0 border-r h-9 w-28">
                    {isSerialized ? (
                        <Input
                            placeholder="Grade / Notes"
                            value={item.quality}
                            onKeyDown={navOnEnter}
                            onChange={(e) => updateField('quality', e.target.value)}
                            className="h-full border-none rounded-none text-[10px] px-1.5 focus-visible:ring-0 bg-transparent"
                        />
                    ) : (
                        <span className="flex items-center h-full px-1.5 text-[10px] text-muted-foreground">—</span>
                    )}
                </TableCell>
            )}

            {/* WARRANTY */}
            {columnVisibility.warranty && (
                <TableCell className="p-0 border-r h-9 w-32">
                    {isSerialized ? (
                        <div className="flex items-center gap-0.5 px-0.5 h-full">
                            <button
                                type="button"
                                title="Click to cycle: D=Duration, A=Activation date, E=Expiry date"
                                onClick={() => updateField('warrantyMode', cycleWarranty(item.warrantyMode))}
                                className={`size-5 shrink-0 rounded text-[9px] font-extrabold flex items-center justify-center transition-colors ${warrantyClass}`}
                            >
                                {WARRANTY_LABELS[item.warrantyMode]}
                            </button>
                            <Input
                                type={item.warrantyMode !== 'D' ? 'date' : 'text'}
                                placeholder={WARRANTY_PLACEHOLDER[item.warrantyMode]}
                                value={item.warrantyValue}
                                onKeyDown={navOnEnter}
                                onChange={(e) => updateField('warrantyValue', e.target.value)}
                                className="h-full border-none rounded-none text-[10px] px-0.5 focus-visible:ring-0 bg-transparent"
                            />
                        </div>
                    ) : (
                        <span className="flex items-center h-full px-1.5 text-[10px] text-muted-foreground">Std</span>
                    )}
                </TableCell>
            )}

            {/* IMEI 1 */}
            {showImeis && (
                <TableCell className="p-0 border-r h-9 min-w-[100px]">
                    <Input
                        placeholder="IMEI 1"
                        value={item.imei1}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('imei1', e.target.value)}
                        className="h-full border-none rounded-none text-[10px] font-mono px-1.5 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}
            {showImeis && (
                <TableCell className="p-0 border-r h-9 min-w-[100px]">
                    <Input
                        placeholder="IMEI 2"
                        value={item.imei2}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('imei2', e.target.value)}
                        className="h-full border-none rounded-none text-[10px] font-mono px-1.5 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* SERIAL */}
            {showSerial && (
                <TableCell className="p-0 border-r h-9 min-w-[90px]">
                    <Input
                        placeholder="Serial No."
                        value={item.serial}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('serial', e.target.value)}
                        className="h-full border-none rounded-none text-[10px] font-mono px-1.5 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* QTY */}
            <TableCell className="p-0 border-r h-9 w-10">
                <Input
                    type="number"
                    readOnly={isSerialized}
                    value={item.qty}
                    onKeyDown={navOnEnter}
                    onChange={(e) => updateField('qty', Math.max(1, parseInt(e.target.value) || 1))}
                    className={cn('h-full border-none rounded-none text-[10px] text-center px-0.5 focus-visible:ring-0', isSerialized && 'text-muted-foreground bg-muted/20')}
                />
            </TableCell>

            {/* COST */}
            {columnVisibility.cost && (
                <TableCell className="p-0 border-r h-9 min-w-[65px]">
                    <Input
                        type="number" step="0.01"
                        value={item.cost}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('cost', parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none text-[10px] text-right font-mono font-semibold px-1 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* DISC% */}
            {columnVisibility.disc && (
                <TableCell className="p-0 border-r h-9 w-11">
                    <Input
                        type="number" step="0.01"
                        value={item.discPercent}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('discPercent', parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none text-[10px] text-center px-0.5 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* TAX — editable when is_gst_billed and vendor is registered */}
            {showTax && (
                <TableCell className="p-0 border-r h-9 min-w-[65px]">
                    {flags.isGstBilled && vendorIsRegistered ? (
                        <Input
                            type="number" step="0.01"
                            value={item.taxPercent}
                            onKeyDown={navOnEnter}
                            onChange={(e) => updateField('taxPercent', parseFloat(e.target.value) || 0)}
                            className="h-full border-none rounded-none text-[10px] text-center px-0.5 focus-visible:ring-0 bg-transparent"
                        />
                    ) : (
                        <span className="flex items-center justify-center h-full text-[10px] text-muted-foreground">0%</span>
                    )}
                </TableCell>
            )}

            {/* WHOLESALE */}
            {columnVisibility.wholesale && (
                <TableCell className="p-0 border-r h-9 min-w-[70px]">
                    <Input
                        type="number" step="0.01"
                        value={item.wholesale}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('wholesale', parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none text-[10px] text-right font-mono px-1 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* SELLING */}
            {columnVisibility.selling && (
                <TableCell className="p-0 border-r h-9 min-w-[70px]">
                    <Input
                        type="number" step="0.01"
                        value={item.selling}
                        onKeyDown={navOnEnter}
                        onChange={(e) => updateField('selling', parseFloat(e.target.value) || 0)}
                        className="h-full border-none rounded-none text-[10px] text-right font-mono text-primary font-bold px-1 focus-visible:ring-0 bg-transparent"
                    />
                </TableCell>
            )}

            {/* TOTAL */}
            <TableCell className="p-0 border-r h-9 min-w-[70px] text-right pr-1.5 font-mono text-[10px] font-extrabold">
                ₹{item._lineTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </TableCell>

            {/* ACTIONS */}
            <TableCell className="p-0 h-9 w-8">
                <div className="flex items-center justify-center gap-0">
                    {isSerialized && (
                        <Button
                            type="button" variant="ghost" size="icon"
                            title="Duplicate (clears IMEI/serial)"
                            className="size-5 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => dispatch({ type: 'DUPLICATE_ROW', payload: item.id })}
                        >
                            <Copy className="size-3" />
                        </Button>
                    )}
                    <Button
                        type="button" variant="ghost" size="icon"
                        className="size-5 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => dispatch({ type: 'REMOVE_ROW', payload: item.id })}
                    >
                        <Trash2 className="size-3" />
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
});
PurchaseRow.displayName = 'PurchaseRow';

// ─── Main table ──────────────────────────────────────────────────────────────

export default function LineItemTable() {
    const { state, dispatch, calculatedRows, flags, permissions } = usePurchase();
    const { columnVisibility } = state;
    const [openComboId, setOpenComboId] = useState<string | null>(null);
    const [quickAddOpen, setQuickAddOpen] = useState(false);

    const showImeis = columnVisibility.imeis;
    const showSerial = columnVisibility.serial;
    const showTax = columnVisibility.tax && flags.isGstBilled;

    const addBlankRow = useCallback(() => dispatch({ type: 'ADD_ROW', payload: blankRow() }), [dispatch]);

    const handleBulkImport = useCallback((variant: CatalogVariant, lines: { imei1: string; imei2: string; serial: string }[]) => {
        const rows: LineRow[] = lines.map((l) => ({ ...blankRow(variant), ...l }));
        dispatch({ type: 'ADD_ROWS', payload: rows });
    }, [dispatch]);

    const actionBar = (
        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-l border-r">
            <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setQuickAddOpen(true)}>
                    <ClipboardPaste className="size-3 mr-1" /> Paste Many
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setQuickAddOpen(true)}>
                    <Zap className="size-3 mr-1" /> Quick Add
                </Button>
                <Button type="button" size="sm" className="h-7 px-2 text-xs" onClick={addBlankRow}>
                    <Plus className="size-3 mr-1" /> Add Row
                </Button>
            </div>
            {state.rows.length > 0 && (
                <span className="text-[10px] text-muted-foreground">{state.rows.length} item{state.rows.length !== 1 ? 's' : ''}</span>
            )}
        </div>
    );

    return (
        <div>
            {actionBar}
            <div className="w-full overflow-x-auto">
                <Table className="w-full border-collapse text-xs table-auto">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-6 text-center p-1 border-r border-b font-bold text-foreground">#</TableHead>
                            {columnVisibility.productBh && <TableHead className="min-w-[160px] px-2 py-1 border-r border-b font-bold text-foreground">PRODUCT & BH</TableHead>}
                            {columnVisibility.type && <TableHead className="w-28 px-2 py-1 border-r border-b font-bold text-foreground">TYPE</TableHead>}
                            {columnVisibility.quality && <TableHead className="w-28 px-2 py-1 border-r border-b font-bold text-foreground">QUALITY</TableHead>}
                            {columnVisibility.warranty && <TableHead className="w-32 px-2 py-1 border-r border-b font-bold text-foreground">WARRANTY</TableHead>}
                            {showImeis && <><TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 1</TableHead><TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 2</TableHead></>}
                            {showSerial && <TableHead className="min-w-[90px] px-2 py-1 border-r border-b font-bold text-foreground">SERIAL</TableHead>}
                            <TableHead className="w-10 p-1 border-r border-b font-bold text-foreground text-center">QTY</TableHead>
                            {columnVisibility.cost && <TableHead className="min-w-[65px] px-1.5 py-1 border-r border-b font-bold text-foreground text-right">COST</TableHead>}
                            {columnVisibility.disc && <TableHead className="w-11 p-1 border-r border-b font-bold text-foreground text-center">DISC%</TableHead>}
                            {showTax && <TableHead className="min-w-[65px] px-1.5 py-1 border-r border-b font-bold text-foreground text-center">TAX%</TableHead>}
                            {columnVisibility.wholesale && permissions.can_see_wholesale && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground text-right">WHOLESALE</TableHead>}
                            {columnVisibility.selling && <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground text-right">SELLING</TableHead>}
                            <TableHead className="min-w-[70px] px-2 py-1 border-r border-b font-bold text-foreground text-right">TOTAL</TableHead>
                            <TableHead className="w-8 p-1 border-b font-bold text-foreground text-center">*</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {calculatedRows.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={20} className="p-8 text-center text-muted-foreground">
                                    <p className="text-sm font-medium">No items added</p>
                                    <p className="text-xs mt-1">Click "Add Row" to start — search catalog or enter an off-catalog name.</p>
                                </TableCell>
                            </TableRow>
                        ) : (
                            calculatedRows.map((row, idx) => (
                                <PurchaseRow
                                    key={row.id}
                                    item={row}
                                    index={idx}
                                    openComboId={openComboId}
                                    setOpenComboId={setOpenComboId}
                                />
                            ))
                        )}
                    </TableBody>
                </Table>
            </div>
            {state.rows.length > 4 && actionBar}
            <QuickAddModal open={quickAddOpen} onOpenChange={setQuickAddOpen} onImport={handleBulkImport} />
        </div>
    );
}

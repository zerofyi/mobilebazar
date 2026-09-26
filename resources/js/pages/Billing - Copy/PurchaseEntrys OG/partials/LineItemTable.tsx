import React, { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Copy, Plus, Search, ShoppingCart, Trash2, Zap, Check, ChevronsUpDown, Barcode, Sparkles, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

export type WarrantyMode = "A" | "D" | "E";
export type TaxMode = "I" | "E";

export interface RowItem {
    id: string; productName: string; isSerialized: boolean; batteryHealth: string; condition: string;
    quality: string; warrantyMode: WarrantyMode; warrantyValue: string; imei1: string; imei2: string;
    serial: string; qty: number; cost: number; discPercent: number; taxMode: TaxMode; taxPercent: number;
    wholesale: number; selling: number;
}

export interface QuickAddUnit { imei1: string; imei2: string; serial: string; }
export interface ProductCatalogItem { value: string; label: string; isSerialized: boolean; }

const SAMPLE_PRODUCTS: ProductCatalogItem[] = [
    { value: "iphone-15-pro-256", label: "iPhone 15 Pro 256GB", isSerialized: true },
    { value: "samsung-s24-256", label: "Samsung Galaxy S24 256GB", isSerialized: true },
    { value: "data-cable-15m", label: "Premium Data Cable 1.5M", isSerialized: false },
    { value: "charger-20w", label: "20W USB-C Power Adapter", isSerialized: false },
];

interface TableRowItemProps {
    item: RowItem; index: number; showImeis: boolean; showSerial: boolean; openComboboxId: string | null;
    setOpenComboboxId: React.Dispatch<React.SetStateAction<string | null>>;
    updateItem: (id: string, field: keyof RowItem, value: any) => void;
    cycleWarrantyMode: (id: string, currentMode: WarrantyMode) => void;
    cycleTaxMode: (id: string, currentMode: TaxMode) => void;
    duplicateRow: (item: RowItem) => void; removeRow: (id: string) => void;
}

const TableRowItem = React.memo(({ item, index, showImeis, showSerial, openComboboxId, setOpenComboboxId, updateItem, cycleWarrantyMode, cycleTaxMode, duplicateRow, removeRow }: TableRowItemProps) => {
    const subtotal = item.qty * item.cost;
    const discount = subtotal * (item.discPercent / 100);
    const taxable = subtotal - discount;
    const totalAmount = item.taxMode === "I" ? taxable : taxable + taxable * (item.taxPercent / 100);

    return (
        <TableRow className="p-0 hover:bg-muted/20 border-b">
            <TableCell className="p-0 text-center font-semibold text-muted-foreground border-r bg-muted/10 h-9">{index + 1}</TableCell>

            {/* PRODUCT & BH */}
            <TableCell className="p-0 border-r h-9">
                <div className="flex items-center h-full w-full min-w-0">
                    <div className="min-w-0 flex-1 h-full">
                        <Popover open={openComboboxId === item.id} onOpenChange={(open) => setOpenComboboxId(open ? item.id : null)}>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" role="combobox" aria-expanded={openComboboxId === item.id} className="w-full h-full justify-between px-1.5 text-xs font-normal rounded-none hover:bg-transparent border-none focus-visible:ring-1 focus-visible:ring-ring">
                                    <span className="truncate">{item.productName || "Search..."}</span>
                                    <ChevronsUpDown className="ml-0.5 h-3 w-3 shrink-0 opacity-50" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[220px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search product..." className="h-8 text-xs" />
                                    <CommandList>
                                        <CommandEmpty className="p-2 text-xs">No product found.</CommandEmpty>
                                        <CommandGroup>
                                            {SAMPLE_PRODUCTS.map((prod) => (
                                                <CommandItem key={prod.value} value={prod.label} className="text-xs" onSelect={(currentValue) => {
                                                    updateItem(item.id, "productName", currentValue);
                                                    updateItem(item.id, "isSerialized", prod.isSerialized);
                                                    if (prod.isSerialized) updateItem(item.id, "qty", 1);
                                                    setOpenComboboxId(null);
                                                }}>
                                                    <Check className={cn("mr-2 h-3.5 w-3.5", item.productName === prod.label ? "opacity-100" : "opacity-0")} />
                                                    {prod.label}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <div className="w-10 shrink-0 border-l border-r h-full flex items-center">
                        <Input type="number" placeholder="BH" title="Battery Health (%)" aria-label="Battery Health" disabled={!item.isSerialized} min="0" max="100" value={item.batteryHealth} onChange={(e) => updateItem(item.id, "batteryHealth", e.target.value)} className="h-full px-0.5 text-center border-none rounded-none text-xs shadow-none focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/20" />
                    </div>
                </div>
            </TableCell>

            {/* TYPE */}
            <TableCell className="p-0 border-r h-9">
                <Select value={item.condition} onValueChange={(val) => updateItem(item.id, "condition", val)}>
                    <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring"><SelectValue placeholder="Type" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="new" className="text-xs">New</SelectItem>
                        <SelectItem value="used" className="text-xs">Used</SelectItem>
                        <SelectItem value="unused" className="text-xs">Unused</SelectItem>
                        <SelectItem value="refurbished" className="text-xs">Refurbished</SelectItem>
                        <SelectItem value="open box" className="text-xs">Open Box</SelectItem>
                    </SelectContent>
                </Select>
            </TableCell>

            {/* QUALITY */}
            <TableCell className="p-0 border-r h-9">
                <Select value={item.quality} onValueChange={(val) => updateItem(item.id, "quality", val)}>
                    <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring"><SelectValue placeholder="Quality" /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="fair" className="text-xs">Fair</SelectItem>
                        <SelectItem value="good" className="text-xs">Good</SelectItem>
                        <SelectItem value="super mint" className="text-xs">Super Mint</SelectItem>
                        <SelectItem value="sealed pack" className="text-xs">Sealed Pack</SelectItem>
                    </SelectContent>
                </Select>
            </TableCell>

            {/* WARRANTY */}
            <TableCell className="p-0 border-r h-9">
                <div className="flex items-center h-full space-x-1 px-1 w-full min-w-0">
                    <Button type="button" size="icon" onClick={() => cycleWarrantyMode(item.id, item.warrantyMode)} title={`Warranty Mode: ${item.warrantyMode === "A" ? "Activation Date" : item.warrantyMode === "D" ? "Duration" : "Expiry Date (DD/MM/YYYY)"}`} aria-label="Toggle Warranty Mode" className={cn("h-5 w-5 shrink-0 text-[10px] font-extrabold p-0 rounded-xs transition-colors", item.warrantyMode === "A" && "bg-primary text-primary-foreground hover:bg-primary/90", item.warrantyMode === "D" && "bg-muted text-muted-foreground hover:bg-muted/80 border", item.warrantyMode === "E" && "bg-destructive text-white hover:bg-destructive/90 shadow-2xs")}>
                        {item.warrantyMode}
                    </Button>
                    <div className="flex-1 min-w-0 h-full flex items-center">
                        {item.warrantyMode === "D" ? (
                            <Select value={item.warrantyValue} onValueChange={(val) => updateItem(item.id, "warrantyValue", val)}>
                                <SelectTrigger className="w-full h-full border-none rounded-none shadow-none text-xs px-1 hover:bg-muted/10 focus:ring-1 focus:ring-ring"><SelectValue placeholder="Duration" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="out of warranty" className="text-xs">No Warranty</SelectItem>
                                    <SelectItem value="1 month" className="text-xs">1 Month</SelectItem>
                                    <SelectItem value="3 months" className="text-xs">3 Months</SelectItem>
                                    <SelectItem value="6 months" className="text-xs">6 Months</SelectItem>
                                    <SelectItem value="1 year" className="text-xs">1 Year</SelectItem>
                                </SelectContent>
                            </Select>
                        ) : (
                            <Input type="date" placeholder={item.warrantyMode === "E" ? "DD/MM/YYYY" : "Activation Date"} aria-label="Warranty Date" value={item.warrantyValue} onChange={(e) => updateItem(item.id, "warrantyValue", e.target.value)} className="w-full h-full border-none rounded-none shadow-none text-xs px-0.5 focus-visible:ring-1 focus-visible:ring-ring" />
                        )}
                    </div>
                </div>
            </TableCell>

            {/* IMEIs & SERIAL */}
            {showImeis && (
                <>
                    <TableCell className="p-0 border-r h-9"><Input type="text" placeholder={item.isSerialized ? "IMEI 1" : "N/A"} aria-label="IMEI 1" disabled={!item.isSerialized} value={item.imei1} onChange={(e) => updateItem(item.id, "imei1", e.target.value)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground" /></TableCell>
                    <TableCell className="p-0 border-r h-9"><Input type="text" placeholder={item.isSerialized ? "IMEI 2" : "N/A"} aria-label="IMEI 2" disabled={!item.isSerialized} value={item.imei2} onChange={(e) => updateItem(item.id, "imei2", e.target.value)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground" /></TableCell>
                </>
            )}
            {showSerial && (
                <TableCell className="p-0 border-r h-9"><Input type="text" placeholder={item.isSerialized ? "Serial No." : "N/A"} aria-label="Serial Number" disabled={!item.isSerialized} value={item.serial} onChange={(e) => updateItem(item.id, "serial", e.target.value)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring disabled:bg-muted/30 disabled:text-muted-foreground" /></TableCell>
            )}

            {/* NUMERIC FIELDS */}
            <TableCell className="p-0 border-r h-9"><Input type="number" min="1" aria-label="Quantity" disabled={item.isSerialized} value={item.qty} onChange={(e) => updateItem(item.id, "qty", Math.max(1, parseInt(e.target.value, 10) || 1))} title={item.isSerialized ? "Serialized item QTY locked to 1" : "Edit QTY"} className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring font-semibold disabled:bg-muted/30 disabled:text-muted-foreground" /></TableCell>
            <TableCell className="p-0 border-r h-9"><Input type="number" step="0.01" placeholder="0.00" aria-label="Cost Price" value={item.cost || ""} onChange={(e) => updateItem(item.id, "cost", parseFloat(e.target.value) || 0)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring" /></TableCell>
            <TableCell className="p-0 border-r h-9"><Input type="number" step="0.01" min="0" max="100" aria-label="Discount Percentage" value={item.discPercent} onChange={(e) => updateItem(item.id, "discPercent", parseFloat(e.target.value) || 0)} className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring" /></TableCell>
            <TableCell className="p-0 border-r h-9">
                <div className="flex items-center h-full space-x-0.5 px-0.5">
                    <Button type="button" size="icon" onClick={() => cycleTaxMode(item.id, item.taxMode)} title={`Tax Mode: ${item.taxMode === "I" ? "Inclusive" : "Exclusive"}`} aria-label="Toggle Tax Mode" className={cn("h-5 w-5 shrink-0 text-[10px] font-bold p-0 rounded-xs", item.taxMode === "I" ? "bg-secondary text-secondary-foreground hover:bg-secondary/80 border" : "bg-primary text-primary-foreground hover:bg-primary/90")}>{item.taxMode}</Button>
                    <Input type="number" step="0.01" min="0" max="100" aria-label="Tax Percentage" value={item.taxPercent} onChange={(e) => updateItem(item.id, "taxPercent", parseFloat(e.target.value) || 0)} className="h-full border-none rounded-none shadow-none text-xs text-center px-0.5 focus-visible:ring-1 focus-visible:ring-ring" />
                </div>
            </TableCell>
            <TableCell className="p-0 border-r h-9"><Input type="number" step="0.01" placeholder="0.00" aria-label="Wholesale Price" value={item.wholesale || ""} onChange={(e) => updateItem(item.id, "wholesale", parseFloat(e.target.value) || 0)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring" /></TableCell>
            <TableCell className="p-0 border-r h-9"><Input type="number" step="0.01" placeholder="0.00" aria-label="Selling Price" value={item.selling || ""} onChange={(e) => updateItem(item.id, "selling", parseFloat(e.target.value) || 0)} className="h-full border-none rounded-none shadow-none text-xs px-1 focus-visible:ring-1 focus-visible:ring-ring" /></TableCell>
            <TableCell className="p-0 border-r h-9 text-right pr-1 font-medium bg-muted/5 align-middle">₹{totalAmount.toFixed(2)}</TableCell>

            {/* ACTIONS */}
            <TableCell className="p-0 h-9 align-middle">
                <div className="flex items-center justify-center space-x-0.5 h-full">
                    <Button type="button" variant="ghost" size="icon" title="Duplicate row specs" aria-label="Duplicate Row" onClick={() => duplicateRow(item)} className="h-6 w-6 text-muted-foreground hover:text-foreground p-0"><Copy className="w-3 h-3" /></Button>
                    <Button type="button" variant="ghost" size="icon" title="Delete row" aria-label="Delete Row" onClick={() => removeRow(item.id)} className="h-6 w-6 text-destructive hover:bg-destructive/10 p-0"><Trash2 className="w-3 h-3" /></Button>
                </div>
            </TableCell>
        </TableRow>
    );
});
TableRowItem.displayName = "TableRowItem";

const ProductSearchModal = React.memo(({ open, onOpenChange, onSelectProduct }: { open: boolean; onOpenChange: (open: boolean) => void; onSelectProduct: (product: ProductCatalogItem) => void; }) => {
    const [searchQuery, setSearchQuery] = useState("");
    const filtered = useMemo(() => SAMPLE_PRODUCTS.filter((p) => p.label.toLowerCase().includes(searchQuery.toLowerCase())), [searchQuery]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] p-0 overflow-hidden">
                <DialogHeader className="p-4 pb-2 border-b bg-muted/30">
                    <DialogTitle className="text-base flex items-center"><Search className="h-4 w-4 mr-2 text-primary" />Quick Product Search</DialogTitle>
                    <DialogDescription className="text-xs">Search inventory catalog and click to append to line items.</DialogDescription>
                </DialogHeader>
                <div className="px-4 pb-6 space-y-3">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input type="text" placeholder="Search products by title or model..." aria-label="Search Products Input" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 text-xs h-9" autoFocus />
                    </div>
                    <div className="max-h-64 overflow-y-auto border rounded-lg divide-y bg-background shadow-2xs">
                        {filtered.length > 0 ? (
                            filtered.map((prod) => (
                                <div key={prod.value} onClick={() => { onSelectProduct(prod); onOpenChange(false); setSearchQuery(""); }} className="p-3 hover:bg-muted/60 cursor-pointer flex items-center justify-between text-xs transition-colors group">
                                    <div className="space-y-0.5">
                                        <div className="font-medium group-hover:text-primary transition-colors">{prod.label}</div>
                                        <div className="flex items-center space-x-1.5"><Badge variant={prod.isSerialized ? "default" : "secondary"} className="text-[9px] px-1 py-0 h-4">{prod.isSerialized ? "Serialized" : "Non-Serialized"}</Badge></div>
                                    </div>
                                    <Button variant="secondary" size="sm" className="h-7 px-2.5 text-xs group-hover:bg-primary group-hover:text-primary-foreground transition-colors"><Plus className="h-3 w-3 mr-1" /> Add</Button>
                                </div>
                            ))
                        ) : (<div className="p-6 text-center text-xs text-muted-foreground">No matching products found.</div>)}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
});
ProductSearchModal.displayName = "ProductSearchModal";

const QuickAddModal = React.memo(({ open, onOpenChange, showImeis, showSerial, onAddItems }: { open: boolean; onOpenChange: (open: boolean) => void; showImeis: boolean; showSerial: boolean; onAddItems: (newItems: RowItem[]) => void; }) => {
    const [comboboxOpen, setComboboxOpen] = useState(false);
    const [product, setProduct] = useState(SAMPLE_PRODUCTS[0]);
    const [condition, setCondition] = useState("used");
    const [quality, setQuality] = useState("super mint");
    const [warrantyMode] = useState<WarrantyMode>("D");
    const [warrantyVal, setWarrantyVal] = useState("6 months");
    const [batteryHealth, setBatteryHealth] = useState("95");
    const [cost, setCost] = useState(65000);
    const [selling, setSelling] = useState(74999);
    const [qty, setQty] = useState(2);
    const [units, setUnits] = useState<QuickAddUnit[]>([{ imei1: "", imei2: "", serial: "" }, { imei1: "", imei2: "", serial: "" }]);

    const handleQtyChange = useCallback((newQty: number) => {
        const targetQty = Math.max(1, Math.min(100, newQty));
        setQty(targetQty);
        setUnits((prev) => {
            const next = [...prev];
            if (targetQty > next.length) { for (let i = next.length; i < targetQty; i++) next.push({ imei1: "", imei2: "", serial: "" }); }
            else { next.splice(targetQty); }
            return next;
        });
    }, []);

    const handleUnitChange = useCallback((index: number, field: keyof QuickAddUnit, val: string) => {
        setUnits((prev) => { const copy = [...prev]; copy[index] = { ...copy[index], [field]: val }; return copy; });
    }, []);

    const handleConfirm = useCallback(() => {
        if (product.isSerialized) {
            const newRows: RowItem[] = units.map((u, i) => ({ id: `${Date.now()}-${i}-${Math.random().toString(36).substring(2, 5)}`, productName: product.label, isSerialized: true, batteryHealth, condition, quality, warrantyMode, warrantyValue: warrantyVal, imei1: u.imei1, imei2: u.imei2, serial: u.serial, qty: 1, cost, discPercent: 0, taxMode: "E", taxPercent: 0, wholesale: cost * 1.05, selling }));
            onAddItems(newRows);
        } else {
            const bulkRow: RowItem = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, productName: product.label, isSerialized: false, batteryHealth: "", condition, quality, warrantyMode, warrantyValue: warrantyVal, imei1: "", imei2: "", serial: "", qty, cost, discPercent: 0, taxMode: "E", taxPercent: 0, wholesale: cost * 1.05, selling };
            onAddItems([bulkRow]);
        }
        onOpenChange(false);
    }, [product, units, batteryHealth, condition, quality, warrantyMode, warrantyVal, cost, selling, qty, onAddItems, onOpenChange]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl p-0 overflow-hidden max-h-[92vh] flex flex-col">
                <DialogHeader className="p-4 pb-3 border-b bg-muted/30">
                    <DialogTitle className="text-base flex items-center"><Zap className="h-4 w-4 mr-2 text-primary" />Quick Add Multi-Unit Batch</DialogTitle>
                    <DialogDescription className="text-xs">Define shared specs once, generate units, scan identifiers, and insert.</DialogDescription>
                </DialogHeader>
                <div className="px-4 space-y-2 text-xs overflow-y-auto flex-1">
                    <div className="space-y-1.5">
                        <label className="font-semibold text-xs flex items-center"><Sparkles className="h-3.5 w-3.5 mr-1 text-primary" />Select Product</label>
                        <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                            <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" aria-expanded={comboboxOpen} className="w-full h-9 justify-between text-xs px-3 bg-background"><span className="font-medium">{product ? `${product.label} (${product.isSerialized ? "Serialized" : "Non-Serialized"})` : "Search and select product..."}</span><ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" /></Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[500px] p-0" align="start">
                                <Command>
                                    <CommandInput placeholder="Search catalog products..." className="h-9 text-xs" />
                                    <CommandList>
                                        <CommandEmpty className="p-3 text-xs">No products found.</CommandEmpty>
                                        <CommandGroup>
                                            {SAMPLE_PRODUCTS.map((prod) => (
                                                <CommandItem key={prod.value} value={prod.label} className="text-xs" onSelect={() => { setProduct(prod); setComboboxOpen(false); }}>
                                                    <Check className={cn("mr-2 h-3.5 w-3.5", product.value === prod.value ? "opacity-100" : "opacity-0")} />
                                                    <span>{prod.label}</span>
                                                    <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0">{prod.isSerialized ? "Serialized" : "Bulk"}</Badge>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    <div className="bg-muted/30 border rounded-lg p-3 space-y-3">
                        <div className="text-[11px] font-semibold tracking-wide uppercase text-muted-foreground flex items-center"><Layers className="h-3 w-3 mr-1" />Shared Item Specification</div>
                        <div className="grid grid-cols-3 gap-2.5">
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Condition</label>
                                <Select value={condition} onValueChange={setCondition}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="new" className="text-xs">New</SelectItem><SelectItem value="used" className="text-xs">Used</SelectItem><SelectItem value="refurbished" className="text-xs">Refurbished</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Quality</label>
                                <Select value={quality} onValueChange={setQuality}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="fair" className="text-xs">Fair</SelectItem><SelectItem value="good" className="text-xs">Good</SelectItem><SelectItem value="super mint" className="text-xs">Super Mint</SelectItem></SelectContent>
                                </Select>
                            </div>
                            <div>
                                <label className="font-medium text-[11px] mb-1 block">Warranty Mode</label>
                                <Select value={warrantyVal} onValueChange={setWarrantyVal}>
                                    <SelectTrigger className="w-full h-8 text-xs bg-background"><SelectValue /></SelectTrigger>
                                    <SelectContent><SelectItem value="out of warranty" className="text-xs">No Warranty</SelectItem><SelectItem value="1 month" className="text-xs">1 Month</SelectItem><SelectItem value="3 months" className="text-xs">3 Months</SelectItem><SelectItem value="6 months" className="text-xs">6 Months</SelectItem><SelectItem value="1 year" className="text-xs">1 Year</SelectItem></SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2.5">
                            <div><label className="font-medium text-[11px] mb-1 block">Cost Price (₹)</label><Input type="number" aria-label="Cost Price" value={cost} onChange={(e) => setCost(parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-background" /></div>
                            <div><label className="font-medium text-[11px] mb-1 block">Selling Price (₹)</label><Input type="number" aria-label="Selling Price" value={selling} onChange={(e) => setSelling(parseFloat(e.target.value) || 0)} className="h-8 text-xs bg-background" /></div>
                            {product.isSerialized && (<div><label className="font-medium text-[11px] mb-1 block">Battery Health (%)</label><Input type="number" aria-label="Battery Health" value={batteryHealth} onChange={(e) => setBatteryHealth(e.target.value)} className="h-8 text-xs bg-background" /></div>)}
                        </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-3">
                        <div><div className="font-bold text-xs">Unit Quantity</div><div className="text-[11px] text-muted-foreground">{product.isSerialized ? "Generates 1 line item per unit with IMEI/SN" : "Generates 1 single bulk line item"}</div></div>
                        <div className="flex items-center space-x-2">
                            <Button type="button" variant="outline" size="icon" aria-label="Decrease Quantity" className="h-7 w-7" onClick={() => handleQtyChange(qty - 1)}>-</Button>
                            <Input type="number" min="1" max="50" aria-label="Batch Quantity Input" value={qty} onChange={(e) => handleQtyChange(parseInt(e.target.value, 10) || 1)} className="h-7 w-16 text-center font-bold text-xs" />
                            <Button type="button" variant="outline" size="icon" aria-label="Increase Quantity" className="h-7 w-7" onClick={() => handleQtyChange(qty + 1)}>+</Button>
                        </div>
                    </div>

                    {product.isSerialized ? (
                        <div className="space-y-2 border rounded-lg p-3 bg-card shadow-2xs">
                            <div className="text-[11px] font-semibold flex items-center justify-between"><span className="flex items-center text-primary"><Barcode className="h-3.5 w-3.5 mr-1" />Unit Barcode / Identifier Scanning ({qty} Units)</span></div>
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {units.map((unit, idx) => (
                                    <div key={idx} className="flex items-center space-x-2 text-[11px] bg-muted/20 p-1.5 rounded border">
                                        <Badge variant="outline" className="w-7 h-6 p-0 justify-center font-bold shrink-0 bg-background">#{idx + 1}</Badge>
                                        {showImeis && (
                                            <>
                                                <Input type="text" placeholder="Scan IMEI 1" aria-label={`Scan IMEI 1 for unit ${idx + 1}`} value={unit.imei1} onChange={(e) => handleUnitChange(idx, "imei1", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />
                                                <Input type="text" placeholder="Scan IMEI 2" aria-label={`Scan IMEI 2 for unit ${idx + 1}`} value={unit.imei2} onChange={(e) => handleUnitChange(idx, "imei2", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />
                                            </>
                                        )}
                                        {showSerial && (<Input type="text" placeholder="Scan Serial No." aria-label={`Scan Serial Number for unit ${idx + 1}`} value={unit.serial} onChange={(e) => handleUnitChange(idx, "serial", e.target.value)} className="h-7 text-[11px] px-2 bg-background" />)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 bg-muted/20 border rounded-lg text-center text-xs text-muted-foreground">Non-Serialized item will be added to the invoice with <strong className="text-foreground">QTY = {qty}</strong>.</div>
                    )}
                </div>
                <DialogFooter className="p-3 bg-muted/30 border-t flex items-center justify-between">
                    <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="button" size="sm" onClick={handleConfirm}><Plus className="h-3.5 w-3.5 mr-1" /> Add {qty} Units to Invoice</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
QuickAddModal.displayName = "QuickAddModal";

export default function VendorAndDocMeta() {
    const [showImeis, setShowImeis] = useState<boolean>(true);
    const [showSerial, setShowSerial] = useState<boolean>(false);
    const [searchModalOpen, setSearchModalOpen] = useState(false);
    const [quickAddModalOpen, setQuickAddModalOpen] = useState(false);
    const [openComboboxId, setOpenComboboxId] = useState<string | null>(null);

    const [items, setItems] = useState<RowItem[]>([
        { id: "1", productName: "iPhone 15 Pro 256GB", isSerialized: true, batteryHealth: "95", condition: "used", quality: "super mint", warrantyMode: "A", warrantyValue: "", imei1: "356789123456789", imei2: "356789123456797", serial: "SN-IP15-001", qty: 1, cost: 65000, discPercent: 0, taxMode: "E", taxPercent: 0, wholesale: 68000, selling: 74999 },
        { id: "2", productName: "Samsung Galaxy S24 256GB", isSerialized: true, batteryHealth: "90", condition: "used", quality: "good", warrantyMode: "D", warrantyValue: "3 months", imei1: "351234567890123", imei2: "351234567890131", serial: "SN-S24-002", qty: 1, cost: 52000, discPercent: 2, taxMode: "I", taxPercent: 18, wholesale: 55000, selling: 62999 },
        { id: "3", productName: "Premium Data Cable 1.5M", isSerialized: false, batteryHealth: "", condition: "new", quality: "sealed pack", warrantyMode: "D", warrantyValue: "1 year", imei1: "", imei2: "", serial: "", qty: 25, cost: 150, discPercent: 0, taxMode: "E", taxPercent: 18, wholesale: 220, selling: 350 },
    ]);

    const totalLineCount = items.length;
    const totalQtyCount = useMemo(() => items.reduce((sum, item) => sum + (item.qty || 0), 0), [items]);

    const updateItem = useCallback((id: string, field: keyof RowItem, value: any) => {
        setItems((prev) => prev.map((item) => item.id === id ? { ...item, [field]: value } : item));
    }, []);

    const cycleWarrantyMode = useCallback((id: string, currentMode: WarrantyMode) => {
        const nextMode: Record<WarrantyMode, WarrantyMode> = { A: "D", D: "E", E: "A" };
        updateItem(id, "warrantyMode", nextMode[currentMode]);
    }, [updateItem]);

    const cycleTaxMode = useCallback((id: string, currentMode: TaxMode) => {
        const nextMode: Record<TaxMode, TaxMode> = { I: "E", E: "I" };
        updateItem(id, "taxMode", nextMode[currentMode]);
    }, [updateItem]);

    const addRow = useCallback((initialProduct?: ProductCatalogItem) => {
        const prod = initialProduct || SAMPLE_PRODUCTS[0];
        const newItem: RowItem = { id: `${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, productName: prod.label, isSerialized: prod.isSerialized, batteryHealth: prod.isSerialized ? "100" : "", condition: "used", quality: "good", warrantyMode: "A", warrantyValue: "", imei1: "", imei2: "", serial: "", qty: 1, cost: 0, discPercent: 0, taxMode: "E", taxPercent: 0, wholesale: 0, selling: 0 };
        setItems((prev) => [...prev, newItem]);
    }, []);

    const removeRow = useCallback((id: string) => setItems((prev) => prev.filter((item) => item.id !== id)), []);
    const duplicateRow = useCallback((item: RowItem) => setItems((prev) => [...prev, { ...item, id: `${Date.now()}-${Math.random().toString(36).substring(2, 5)}`, imei1: "", imei2: "", serial: "" }]), []);
    const handleBatchAddItems = useCallback((newRows: RowItem[]) => setItems((prev) => [...prev, ...newRows]), []);

    return (
        <div>
            {/* Header Bar */}
            <div className="flex items-center justify-between bg-muted border-b px-4 py-2 shadow-xs">
                <div className="flex items-center space-x-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-card border"><ShoppingCart className="h-4 w-4 text-primary/80" /></div>
                    <div className="flex items-center divide-x">
                        <span className="text-sm font-medium pr-2">Lines Items: <strong className="ml-1 font-bold">{totalLineCount}</strong></span>
                        <span className="text-sm font-medium px-2">Qty: <strong className="ml-1 font-bold">{totalQtyCount}</strong></span>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    <Button type="button" variant="outline" size="sm" onClick={() => setSearchModalOpen(true)} className="h-7 px-2 text-xs"><Search className="h-3.5 w-3.5 mr-1.5" />Search</Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddModalOpen(true)} className="h-7 px-2 text-xs"><Zap className="h-3.5 w-3.5 mr-1.5" />Quick Add</Button>
                    <Button type="button" size="sm" onClick={() => addRow()} className="h-7 px-2 text-xs"><Plus className="h-3.5 w-3.5 mr-1.5" />Add Row</Button>
                </div>
            </div>

            {/* Grid Entry Table */}
            <div className="w-full overflow-x-auto">
                <Table className="w-full border-collapse text-xs table-auto">
                    <TableHeader className="bg-muted/40">
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="w-6 text-center p-1 border-r border-b font-bold text-foreground">#</TableHead>
                            <TableHead className="min-w-[160px] px-2 py-1 border-r border-b font-bold text-foreground">PRODUCT & BH</TableHead>
                            <TableHead className="w-28 min-w-[110px] px-2 py-1 border-r border-b font-bold text-foreground">TYPE</TableHead>
                            <TableHead className="w-28 min-w-[110px] px-2 py-1 border-r border-b font-bold text-foreground">QUALITY</TableHead>
                            <TableHead className="w-28 min-w-[110px] px-2 py-1 border-r border-b font-bold text-foreground">WARRANTY</TableHead>

                            {showImeis && (
                                <>
                                    <TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 1</TableHead>
                                    <TableHead className="min-w-[100px] px-2 py-1 border-r border-b font-bold text-foreground">IMEI 2</TableHead>
                                </>
                            )}
                            {showSerial && (<TableHead className="min-w-[90px] px-2 py-1 border-r border-b font-bold text-foreground">SERIAL</TableHead>)}

                            <TableHead className="w-10 p-1 border-r border-b font-bold text-foreground text-center">QTY</TableHead>
                            <TableHead className="min-w-[65px] px-1.5 py-1 border-r border-b font-bold text-foreground">COST</TableHead>
                            <TableHead className="w-11 p-1 border-r border-b font-bold text-foreground text-center">DISC%</TableHead>
                            <TableHead className="min-w-[65px] px-1.5 py-1 border-r border-b font-bold text-foreground">TAX</TableHead>
                            <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">WHOLESALE</TableHead>
                            <TableHead className="min-w-[70px] px-1.5 py-1 border-r border-b font-bold text-foreground">SELLING</TableHead>
                            <TableHead className="min-w-[70px] px-2 py-1 border-r border-b font-bold text-foreground text-right">TOTAL</TableHead>
                            <TableHead className="w-8 p-1 border-b font-bold text-foreground text-center">*</TableHead>
                        </TableRow>
                    </TableHeader>

                    <TableBody>
                        {items.map((item, index) => (
                            <TableRowItem key={item.id} item={item} index={index} showImeis={showImeis} showSerial={showSerial} openComboboxId={openComboboxId} setOpenComboboxId={setOpenComboboxId} updateItem={updateItem} cycleWarrantyMode={cycleWarrantyMode} cycleTaxMode={cycleTaxMode} duplicateRow={duplicateRow} removeRow={removeRow} />
                        ))}
                    </TableBody>
                </Table>

                {items.length > 4 && (
                    <div className="flex items-center justify-between bg-muted/50 border-b border-l border-r p-4 text-xs">
                        <div className="flex items-center space-x-2">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSearchModalOpen(true)} className="h-7 px-2 text-xs"><Search className="h-3.5 w-3.5 mr-1.5" />Search</Button>
                            <Button type="button" variant="outline" size="sm" onClick={() => setQuickAddModalOpen(true)} className="h-7 px-2 text-xs"><Zap className="h-3.5 w-3.5 mr-1.5" />Quick Add</Button>
                            <Button type="button" size="sm" onClick={() => addRow()} className="h-7 px-2 text-xs"><Plus className="h-3.5 w-3.5 mr-1.5" />Add Row</Button>
                        </div>
                        <span className="text-muted-foreground">Showing {items.length} line items</span>
                    </div>
                )}
            </div>

            <ProductSearchModal open={searchModalOpen} onOpenChange={setSearchModalOpen} onSelectProduct={addRow} />
            <QuickAddModal open={quickAddModalOpen} onOpenChange={setQuickAddModalOpen} showImeis={showImeis} showSerial={showSerial} onAddItems={handleBatchAddItems} />
        </div>
    );
}

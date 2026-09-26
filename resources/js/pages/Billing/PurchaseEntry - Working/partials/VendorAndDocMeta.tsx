import React, { useState, useRef, useEffect } from "react";
import { MapPin, FileText, UserRound, Search, Building2, BadgeCheck, ScrollText, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Party, usePurchase } from "../purchase-context";
import { usePartySearch } from "@/hooks/use-purchase-search";
import SupplierFormModal from "@/pages/App/Suppliers/Partials/SupplierFormModal";
import CustomerFormModal from "@/pages/App/Customers/Partials/CustomerFormModal";

function partyAddressText(p: Party): string | null {
    if (p.address_snapshot) return p.address_snapshot;
    if (p.address) return [p.address.line1, p.address.city, p.address.state].filter(Boolean).join(", ") || null;
    return null;
}

export default function VendorAndDocMeta() {
    const { state, dispatch, flags, vendorIsRegistered, store } = usePurchase();
    const { partyType, selectedParty, taxMovement, poNumber, vendorInvoiceNo, orderDate } = state;
    const { query, setQuery, results, loading, clear } = usePartySearch(partyType);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function onOutside(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setDropdownOpen(false);
        }
        document.addEventListener("mousedown", onOutside);
        return () => document.removeEventListener("mousedown", onOutside);
    }, []);

    const handleSelect = (party: Party) => {
        dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin, storeState: store.address?.state } });
        setDropdownOpen(false);
        clear();
    };

    const handleCreated = (party: Party) => {
        dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin, storeState: store.address?.state } });
        setCreateModalOpen(false);
    };

    const switchPartyType = (t: typeof partyType) => {
        dispatch({ type: "SET_PARTY_TYPE", payload: t });
        dispatch({ type: "SET_PARTY", payload: { party: null } });
        clear();
    };

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 px-4">
                <div className="grid grid-cols-1 gap-2.5 content-start">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center border border-border rounded-md bg-muted/40 shrink-0" role="group" aria-label="Party type">
                            {(["customer", "supplier"] as const).map((t) => (
                                <Button key={t} type="button" variant={partyType === t ? "outline" : "ghost"} size="sm" aria-pressed={partyType === t} onClick={() => switchPartyType(t)} className={cn("h-8 px-2.5 text-xs font-medium rounded-md capitalize", partyType === t ? "bg-background shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground")}>{t}</Button>
                            ))}
                        </div>
                        <div className="relative flex-1" ref={dropdownRef}>
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                            <Input placeholder={`Search ${partyType}... (min 3 chars)`} className="h-9 pl-8 pr-3 text-xs bg-background shadow-2xs" value={query} onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }} onFocus={() => setDropdownOpen(true)} />
                            {dropdownOpen && (query.length >= 3 || results.length > 0) && (
                                <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-popover border rounded-md shadow-md max-h-56 overflow-y-auto">
                                    {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
                                    {!loading && results.length === 0 && query.length >= 3 && (
                                        <div className="px-3 py-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">No results found.</p>
                                            <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => { setDropdownOpen(false); setCreateModalOpen(true); }}><Plus className="size-3" /> Add new {partyType}</button>
                                        </div>
                                    )}
                                    {results.map((p) => (
                                        <button key={p.uuid ?? p.id} className="w-full text-left px-3 py-2.5 hover:bg-muted/50 flex flex-col gap-0.5 border-b last:border-0" onMouseDown={() => handleSelect(p)}>
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0">
                                                    {partyType === "supplier" ? <Building2 className="size-3.5 shrink-0 text-muted-foreground" /> : <UserRound className="size-3.5 shrink-0 text-muted-foreground" />}
                                                    <span className="font-semibold text-xs truncate">{partyType === "supplier" ? p.company_name || p.name : p.name}</span>
                                                </div>
                                                <div className="flex shrink-0 gap-1">
                                                    {partyType === "customer" && p.is_verified && <Badge variant="outline" className="text-[9px] px-1 h-4 border-blue-500/30 bg-blue-50 text-blue-700">KYC</Badge>}
                                                    {p.gstin && <Badge variant="outline" className="text-[9px] px-1 h-4 border-emerald-500/30 bg-emerald-50 text-emerald-700">GST</Badge>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground pl-5"><span className="font-mono">{p.phone_primary ?? p.phone ?? "—"}</span></div>
                                            {partyAddressText(p) && <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground pl-5"><MapPin className="size-3 shrink-0 mt-0.5 opacity-70" /><span className="truncate">{partyAddressText(p)}</span></div>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {selectedParty ? (
                        <div className="relative rounded-lg border bg-card p-3 shadow-2xs">
                            <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                <Badge variant="secondary" className="gap-1 text-[10px] font-normal capitalize">{partyType === "supplier" ? <Building2 className="size-3" /> : <UserRound className="size-3" />} {partyType}</Badge>
                                {(selectedParty.gstin || selectedParty.is_verified) && <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-50 text-[10px] text-emerald-700 font-normal"><BadgeCheck className="size-3" /> {selectedParty.gstin ? "GST" : "KYC"}</Badge>}
                                <button type="button" onClick={() => dispatch({ type: "SET_PARTY", payload: { party: null } })} className="ml-1 text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
                            </div>
                            <div className="flex items-start gap-3 pr-28">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 border">{partyType === "supplier" ? <Building2 className="size-4 text-muted-foreground" /> : <UserRound className="size-4 text-muted-foreground" />}</div>
                                <div className="min-w-0"><h3 className="text-sm font-semibold truncate">{partyType === "supplier" ? selectedParty.company_name || selectedParty.name : selectedParty.name}</h3><p className="mt-0.5 text-[11px] text-muted-foreground font-mono">{selectedParty.gstin ? `GSTIN: ${selectedParty.gstin}` : partyType === "supplier" ? "Unregistered" : selectedParty.care_of ? `c/o ${selectedParty.care_of}` : "Walk-in customer"}</p></div>
                            </div>
                            <div className="mt-2.5 grid grid-cols-3 gap-2 border-t pt-2">
                                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Mobile</p><p className="mt-0.5 text-xs font-medium truncate">{selectedParty.phone_primary ?? selectedParty.phone ?? "—"}</p></div>
                                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Email</p><p className="mt-0.5 text-xs font-medium truncate">{selectedParty.email ?? "—"}</p></div>
                                <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{partyType === "supplier" ? "Balance" : "Aadhaar"}</p><p className="mt-0.5 text-xs font-medium truncate">{partyType === "supplier" ? (selectedParty.current_balance ?? "—") : selectedParty.aadhaar_number ? `•••• ${selectedParty.aadhaar_number.slice(-4)}` : "—"}</p></div>
                            </div>
                            {partyAddressText(selectedParty) && <div className="mt-2 flex items-start gap-1.5 border-t pt-2"><MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" /><p className="text-xs text-muted-foreground truncate">{partyAddressText(selectedParty)}</p></div>}
                        </div>
                    ) : (
                        <div className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed bg-card/50 p-3 text-center"><p className="text-xs text-muted-foreground">Search and select a <span className="font-medium capitalize">{partyType}</span> above</p><button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline" onClick={() => setCreateModalOpen(true)}><Plus className="size-3.5" /> Create new {partyType}</button></div>
                    )}
                </div>

                <div className="border-y lg:border-y-0 lg:border-x border-border/80 px-4 py-3 lg:py-0 text-xs text-muted-foreground">
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted/60 border"><ScrollText className="size-4 text-muted-foreground" /></div>
                        <p className="mt-2 text-xs font-semibold text-foreground">Account Summary</p>
                        <p className="mt-1 text-[10px] leading-relaxed max-w-50">Ledger balance & outstanding for the selected party appear here after the store() wiring.</p>
                    </div>
                </div>

                <div>
                    <div className="relative rounded-lg border bg-card p-3 shadow-2xs">
                        <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] font-mono uppercase">{flags.billType}</Badge>
                            {flags.isGstBilled && <Badge variant="outline" className="text-[10px] border-emerald-500/30 bg-emerald-50 text-emerald-700">GST</Badge>}
                        </div>
                        <div className="flex items-start gap-3 pr-24">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 border"><FileText className="size-4 text-muted-foreground" /></div>
                            <div><h3 className="text-sm font-semibold">Purchase Details</h3><p className="text-[10px] text-muted-foreground">Invoice & purchase information</p></div>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 border-t pt-2">
                            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Purchase No.</p><Input name="po_number" className="mt-0.5 h-7 text-xs bg-muted/30 font-mono" value={poNumber} readOnly /></div>
                            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Vendor Invoice</p><Input className="mt-0.5 h-7 text-xs" value={vendorInvoiceNo} onChange={(e) => dispatch({ type: "SET_VENDOR_INVOICE", payload: e.target.value })} placeholder="Invoice number" /></div>
                            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Purchase Date</p><Input type="date" className="mt-0.5 h-7 text-xs" value={orderDate} onChange={(e) => dispatch({ type: "SET_ORDER_DATE", payload: e.target.value })} /></div>
                            {flags.isGstBilled && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tax Movement</p><div className="mt-0.5 flex h-7 items-center rounded-md border bg-muted/30">{(["intra", "inter"] as const).map((m) => (<Button key={m} type="button" variant={taxMovement === m ? "outline" : "ghost"} size="sm" aria-pressed={taxMovement === m} onClick={() => dispatch({ type: "SET_TAX_MOVEMENT", payload: m })} className={cn("h-6 flex-1 px-1.5 text-[10px] rounded-md", taxMovement === m ? "bg-background shadow-2xs font-semibold" : "text-muted-foreground")}>{m === "intra" ? "CGST+SGST" : "IGST"}</Button>))}</div></div>}
                        </div>
                        <div className="flex items-center justify-between border-t pt-2 mt-2"><span className="text-[10px] text-muted-foreground">Store GST State</span><span className="text-[11px] font-semibold">{store.address?.state || "—"}</span></div>
                    </div>
                </div>
            </div>
            {createModalOpen && partyType === "supplier" && <SupplierFormModal open={createModalOpen} onOpenChange={setCreateModalOpen} stores={store as any} onSuccessCallback={handleCreated} />}
            {createModalOpen && partyType === "customer" && <CustomerFormModal open={createModalOpen} onOpenChange={setCreateModalOpen} onSuccessCallback={handleCreated} />}
        </div>
    );
}

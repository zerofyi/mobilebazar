import React, { useState } from "react";
import { UserRound, Building2, Search, X, Plus, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import SupplierFormModal from "@/pages/App/Suppliers/Partials/SupplierFormModal";
import CustomerFormModal from "@/pages/App/Customers/Partials/CustomerFormModal";
import { useSale, type PartyType, type SaleParty } from "../sale-context";
import { useCustomerSearch, useSupplierSearch } from "../use-stock-search";

function toSaleParty(raw: any, type: PartyType): SaleParty | null {
    if (!raw || raw.id == null) return null;
    const name = type === "supplier" ? raw.company_name || raw.name : raw.name;
    if (!name) return null;
    return {
        type,
        id: raw.id,
        name,
        phone: raw.phone ?? raw.phone_primary ?? null,
        gstin: raw.gstin ?? null,
    };
}

/**
 * Party picker strip: customer | supplier tabs, debounced search, global
 * quick-add modals (same ones the purchase flow uses). Every sale requires
 * a selected party. Invoice meta (date, bill type, GST toggles) lives in
 * the InvoiceMeta card on the right — this strip is party-only.
 */
export default function PartyStrip() {
    const { state, dispatch, store } = useSale();
    const [partyType, setPartyType] = useState<PartyType>("customer");
    const [open, setOpen] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);

    const customerSearch = useCustomerSearch();
    const supplierSearch = useSupplierSearch();
    const search = partyType === "customer" ? customerSearch : supplierSearch;

    const switchType = (t: PartyType) => {
        setPartyType(t);
        dispatch({ type: "CLEAR_PARTY" });
        customerSearch.clear();
        supplierSearch.clear();
        setOpen(false);
    };

    const select = (raw: any) => {
        const party = toSaleParty(raw, partyType);
        if (!party) return;
        dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin } });
        search.clear();
        setOpen(false);
    };

    const selected = state.party;

    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Customer / Party</p>
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Party type">
                    {(["customer", "supplier"] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => switchType(t)}
                            aria-pressed={partyType === t}
                            className={cn(
                                "flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium capitalize",
                                partyType === t ? "bg-background shadow-2xs font-semibold" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {t === "customer" ? <UserRound className="size-3.5" /> : <Building2 className="size-3.5" />}
                            {t === "customer" ? "Customer" : "Party"}
                        </button>
                    ))}
                </div>

                <div className="relative min-w-52 flex-1">
                    {selected ? (
                        <div className="flex h-9 items-center gap-2 rounded-md bg-muted/60 px-2.5">
                            <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">{selected.type}</Badge>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13px] font-medium leading-tight">{selected.name}</p>
                            </div>
                            {selected.gstin && (
                                <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                                    <BadgeCheck className="size-3 text-primary" /> GSTIN
                                </Badge>
                            )}
                            <span className="shrink-0 truncate text-[11px] text-muted-foreground">{selected.phone ?? ""}</span>
                            <Button
                                type="button" variant="ghost" size="icon" className="size-6 shrink-0"
                                onClick={() => dispatch({ type: "CLEAR_PARTY" })}
                                aria-label="Remove party"
                            >
                                <X className="size-3.5" />
                            </Button>
                        </div>
                    ) : (
                        <>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                                <Input
                                    value={search.query}
                                    onChange={(e) => { search.setQuery(e.target.value); setOpen(true); }}
                                    onFocus={() => setOpen(true)}
                                    placeholder={`Search ${partyType === "customer" ? "customers" : "parties"}… (min 3 chars)`}
                                    className="h-9 pl-9"
                                    aria-label={`Search ${partyType}`}
                                />
                            </div>
                            {open && search.query.trim().length >= 3 && (
                                <div className="absolute z-40 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-xl">
                                    {search.loading && <p className="px-2 py-3 text-center text-xs text-muted-foreground">Searching…</p>}
                                    {!search.loading && search.results.length === 0 && (
                                        <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches. Create one →</p>
                                    )}
                                    {search.results.map((r: any) => {
                                        const label = partyType === "supplier" ? r.company_name || r.name : r.name;
                                        const phone = r.phone ?? r.phone_primary ?? null;
                                        return (
                                            <button
                                                key={r.id}
                                                type="button"
                                                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
                                                onClick={() => select(r)}
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-[13px] font-medium">{label}</p>
                                                    <p className="truncate text-[11px] text-muted-foreground">{phone ?? "—"}</p>
                                                </div>
                                                {r.gstin && (
                                                    <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                                                        <BadgeCheck className="size-3 text-primary" /> GSTIN
                                                    </Badge>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <Button type="button" variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-3.5 mr-1" /> New {partyType === "customer" ? "Customer" : "Party"}
                </Button>
            </div>
            {!selected && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Label className="sr-only">Party required</Label>
                    Select a {partyType === "customer" ? "customer" : "party"} — or create one — before completing the sale.
                </p>
            )}

            {createOpen && partyType === "supplier" && (
                <SupplierFormModal
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    stores={store as any}
                    onSuccessCallback={(created) => {
                        const party = toSaleParty(created, "supplier");
                        if (party) {
                            dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin } });
                            setCreateOpen(false);
                        }
                    }}
                />
            )}
            {createOpen && partyType === "customer" && (
                <CustomerFormModal
                    open={createOpen}
                    onOpenChange={setCreateOpen}
                    onSuccessCallback={(created) => {
                        const party = toSaleParty(created, "customer");
                        if (party) {
                            dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin } });
                            setCreateOpen(false);
                        }
                    }}
                />
            )}
        </div>
    );
}

import React, { useState } from "react";
import {
    MapPin,
    FileText,
    UserRound,
    Search,
    Building2,
    BadgeCheck,
    ScrollText,
    X,
    Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Party, usePurchase } from "../purchase-context";
import { usePartySearch } from "@/hooks/use-purchase-search";

import SupplierFormModal from '@/pages/App/Suppliers/Partials/SupplierFormModal';
import CustomerFormModal from '@/pages/App/Customers/Partials/CustomerFormModal';

export default function VendorAndDocMeta() {
    const { state, dispatch, flags, store } = usePurchase();
    const { partyType, selectedParty, taxMovement, poNumber, vendorInvoiceNo, orderDate } = state;

    const { query, setQuery, results, loading } = usePartySearch(partyType);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [createModalOpen, setCreateModalOpen] = useState(false);

    const handleSelect = (party: Party) => {
        dispatch({ type: 'SET_PARTY', payload: party });
        setDropdownOpen(false);
        setQuery('');
    };

    const handleCreated = (party: Party) => {
        dispatch({ type: 'SET_PARTY_TYPE', payload: partyType });
        dispatch({ type: 'SET_PARTY', payload: party });
        setCreateModalOpen(false);
    };

    return (
        <div className="w-full">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 px-4">

                {/* LEFT COLUMN: Party Switcher & Selected Party Meta */}
                <div className="grid grid-cols-1 gap-2.5">
                    {/* Search & Party Toggle Row */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center border border-border rounded-md bg-muted/40 shrink-0" role="group" aria-label="Party type">
                            {(['customer', 'supplier'] as const).map((t) => (
                                <Button
                                    key={t}
                                    type="button"
                                    variant={partyType === t ? 'outline' : 'ghost'}
                                    aria-pressed={partyType === t}
                                    onClick={() => dispatch({ type: 'SET_PARTY_TYPE', payload: t })}
                                    className={cn('h-8 text-xs', partyType !== t && 'text-muted-foreground')}
                                >
                                    {t === 'customer' ? <UserRound className="size-3 mr-1" /> : <Building2 className="size-3 mr-1" />}
                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                </Button>
                            ))}
                        </div>

                        {/* Search Input */}
                        <div className="relative flex-1">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <Input
                                className="h-8 pl-7 text-xs"
                                placeholder={`Search ${partyType}…`}
                                value={query}
                                onChange={(e) => { setQuery(e.target.value); setDropdownOpen(true); }}
                                onFocus={() => setDropdownOpen(true)}
                                onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
                            />
                            {dropdownOpen && (query.length >= 2 || results.length > 0) && (
                                <div className="absolute top-full mt-1 left-0 right-0 z-20 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
                                    {loading && <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>}
                                    {!loading && results.length === 0 && query.length >= 2 && (
                                        <div className="px-3 py-2 space-y-1">
                                            <p className="text-xs text-muted-foreground">No results found.</p>
                                            <button
                                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                                                onMouseDown={() => setCreateModalOpen(true)}
                                            >
                                                <Plus className="size-3" /> Add new {partyType}
                                            </button>
                                        </div>
                                    )}
                                    {results.map((p) => (
                                        <button
                                            key={p.id}
                                            className="w-full text-left px-3 py-2 text-xs hover:bg-muted/50 flex items-center gap-2"
                                            onMouseDown={() => handleSelect(p)}
                                        >
                                            <span className="font-medium truncate">{p.name}</span>
                                            <span className="text-muted-foreground text-[10px] font-mono">{p.phone_primary ?? p.phone}</span>
                                            {p.gstin && (
                                                <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0">GST</Badge>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Party Info Card Container */}
                    {selectedParty ? (
                        <div className="relative rounded-lg border border-border bg-card p-3 shadow-2xs transition-all">
                            {/* Top Badges & Actions */}
                            <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                {/* Party Type Badge */}
                                <Badge variant="secondary" className="gap-1 text-[10px] font-normal capitalize">
                                    {partyType === 'customer' ? (
                                        <UserRound className="size-3" aria-hidden="true" />
                                    ) : (
                                        <Building2 className="size-3" aria-hidden="true" />
                                    )}
                                    {partyType}
                                </Badge>

                                {/* Verification Status Badges */}
                                {partyType === 'customer' && selectedParty.is_verified && (
                                    <Badge
                                        variant="outline"
                                        className="gap-1 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-[10px] text-emerald-700 dark:text-emerald-300 font-normal"
                                    >
                                        <BadgeCheck className="size-3" aria-hidden="true" />
                                        KYC
                                    </Badge>
                                )}

                                {selectedParty.gstin && (
                                    <Badge
                                        variant="outline"
                                        className="gap-1 border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-[10px] text-emerald-700 dark:text-emerald-300 font-normal"
                                    >
                                        <BadgeCheck className="size-3" aria-hidden="true" />
                                        GST
                                    </Badge>
                                )}

                                {/* Clear Party Selection */}
                                <button
                                    type="button"
                                    onClick={() => dispatch({ type: 'SET_PARTY', payload: null })}
                                    className="ml-1 rounded-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    aria-label="Clear selected party"
                                    title="Clear selection"
                                >
                                    <X className="size-3.5" />
                                </button>
                            </div>

                            {/* Entity Header */}
                            <div className="flex items-start gap-3 pr-36">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted/60">
                                    {partyType === 'customer' ? (
                                        <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                                    ) : (
                                        <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                                    )}
                                </div>

                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold tracking-tight text-foreground truncate">
                                        {selectedParty.name}
                                    </h3>

                                    {selectedParty.care_of ? (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                                            c/o {selectedParty.care_of}
                                        </p>
                                    ) : selectedParty.gstin ? (
                                        <p className="mt-0.5 text-[11px] font-mono text-muted-foreground truncate">
                                            GSTIN: {selectedParty.gstin}
                                        </p>
                                    ) : (
                                        <p className="mt-0.5 text-[11px] text-muted-foreground capitalize">
                                            Individual {partyType}
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Meta Details Grid */}
                            <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/80 pt-2 text-[10px]">
                                {/* Mobile Contact */}
                                <div>
                                    <p className="font-medium uppercase tracking-wider text-muted-foreground">
                                        Mobile
                                    </p>
                                    <p className="mt-0.5 font-medium text-foreground truncate">
                                        {selectedParty.phone_primary ?? selectedParty.phone ?? '—'}
                                    </p>
                                </div>

                                {/* Dynamic Middle Meta: GSTIN vs Identification */}
                                {selectedParty.gstin ? (
                                    <div className="col-span-2">
                                        <p className="font-medium uppercase tracking-wider text-muted-foreground">
                                            GSTIN
                                        </p>
                                        <p className="mt-0.5 font-mono font-medium text-foreground truncate">
                                            {selectedParty.gstin}
                                        </p>
                                    </div>
                                ) : partyType === 'customer' && selectedParty.aadhaar_number ? (
                                    <div>
                                        <p className="font-medium uppercase tracking-wider text-muted-foreground">
                                            Aadhaar
                                        </p>
                                        <p className="mt-0.5 font-mono font-medium text-foreground truncate">
                                            XXXX XXXX {selectedParty.aadhaar_number.slice(-4)}
                                        </p>
                                    </div>
                                ) : selectedParty.email ? (
                                    <div className="col-span-2">
                                        <p className="font-medium uppercase tracking-wider text-muted-foreground">
                                            Email
                                        </p>
                                        <p className="mt-0.5 font-medium text-foreground truncate">
                                            {selectedParty.email}
                                        </p>
                                    </div>
                                ) : null}

                                {/* Address Snapshot */}
                                {selectedParty.address_snapshot && (
                                    <div className="col-span-3 flex items-start gap-1.5 border-t border-border/80 pt-2 mt-1">
                                        <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                                        <p className="text-xs leading-relaxed text-muted-foreground truncate">
                                            {selectedParty.address_snapshot}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Empty State Container */
                        <div className="flex min-h-35 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-card/50 p-3 text-center transition-colors">
                            <p className="text-xs text-muted-foreground">
                                Search and select a <span className="font-medium capitalize">{partyType}</span> above
                            </p>
                            <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/80 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                onClick={() => setCreateModalOpen(true)}
                            >
                                <Plus className="size-3.5" aria-hidden="true" />
                                <span>Create new {partyType}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* MIDDLE COLUMN: Account Summary Visual Anchor */}
                <div className="border-y lg:border-y-0 lg:border-x border-border/80 px-4 py-3 lg:py-0 text-xs text-muted-foreground">
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="flex size-9 items-center justify-center rounded-md bg-muted/60 border border-border">
                            <ScrollText className="size-4 text-muted-foreground" />
                        </div>

                        <p className="mt-2 text-xs font-semibold text-foreground">
                            Account Summary
                        </p>

                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground max-w-[200px]">
                            Transactions, payments, totals and outstanding dues
                        </p>
                    </div>
                </div>

                {/* RIGHT COLUMN: Document Metadata Form */}
                <div>
                    <div className="relative rounded-lg border border-border bg-card p-3 shadow-2xs">
                        {/* Status Badges */}
                        <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px] font-normal uppercase">
                                PO
                            </Badge>

                            <Badge
                                variant="outline"
                                className="text-[10px] font-normal border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300"
                            >
                                GST
                            </Badge>
                        </div>

                        {/* Card Title */}
                        <div className="flex items-start gap-3 pr-24">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/60 border border-border">
                                <FileText className="size-4 text-muted-foreground" />
                            </div>

                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-foreground">
                                    Purchase Details
                                </h3>
                                <p className="text-[10px] text-muted-foreground">
                                    Invoice & purchase information
                                </p>
                            </div>
                        </div>

                        {/* Fields Grid */}
                        <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-border/80 pt-2">
                            {/* Purchase No */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Purchase No.
                                </p>
                                <Input
                                    name="po_number"
                                    className="mt-0.5 h-7 text-xs bg-muted/30 font-mono"
                                    value={poNumber}
                                    readOnly
                                />
                            </div>

                            {/* Vendor Invoice */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Vendor Invoice
                                </p>
                                <Input
                                    name="vendor_invoice_no"
                                    className="mt-0.5 h-7 text-xs bg-background shadow-2xs"
                                    value=""
                                    placeholder="Invoice number"
                                />
                            </div>

                            {/* Purchase Date */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Purchase Date
                                </p>
                                <Input
                                    name="order_date"
                                    className="mt-0.5 h-7 text-xs bg-background shadow-2xs"
                                    type="date"
                                    value={orderDate}
                                />
                            </div>

                            {/* Tax Movement Switcher */}
                            {/* <div>
                                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                                    Tax Movement
                                </p>
                                <div
                                    className="mt-0.5 flex h-7 items-center rounded-md border border-input bg-muted/30"
                                    role="group"
                                    aria-label="Tax movement"
                                >
                                    <Button
                                        type="button"
                                        variant={isIntraState ? "outline" : "ghost"}
                                        size="sm"
                                        aria-pressed={isIntraState}
                                        onClick={() => setIsIntraState(true)}
                                        className={cn(
                                            "h-6.5 flex-1 px-1.5 text-[10px] font-medium rounded-md transition-all",
                                            isIntraState
                                                ? "bg-background text-foreground shadow-2xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        CGST + SGST
                                    </Button>

                                    <Button
                                        type="button"
                                        variant={!isIntraState ? "outline" : "ghost"}
                                        size="sm"
                                        aria-pressed={!isIntraState}
                                        onClick={() => setIsIntraState(false)}
                                        className={cn(
                                            "h-6.5 flex-1 px-1.5 text-[10px] font-medium rounded-md transition-all",
                                            !isIntraState
                                                ? "bg-background text-foreground shadow-2xs font-semibold"
                                                : "text-muted-foreground hover:text-foreground"
                                        )}
                                    >
                                        IGST
                                    </Button>
                                </div>
                            </div> */}
                        </div>

                        {/* Store GST State Bar */}
                        <div className="flex items-center justify-between border-t border-border/80 pt-2 mt-2">
                            <span className="text-[10px] text-muted-foreground">
                                Store GST State
                            </span>
                            <span className="text-[11px] font-semibold text-foreground">
                                West Bengal
                            </span>
                        </div>
                    </div>
                </div>

            </div>
            {/* Create modals */}
            {createModalOpen && partyType === 'supplier' && (
                <SupplierFormModal
                    open={createModalOpen}
                    onOpenChange={setCreateModalOpen}
                    stores={store}
                    onSuccessCallback={handleCreated}
                />
            )}

            {createModalOpen && partyType === 'customer' && (
                <CustomerFormModal
                    open={createModalOpen}
                    onOpenChange={setCreateModalOpen}
                    onSuccessCallback={handleCreated}
                />
            )}
        </div>
    );
}

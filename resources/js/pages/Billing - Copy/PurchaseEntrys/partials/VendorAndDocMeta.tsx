import React, { useState } from 'react';
import {
    MapPin, FileText, UserRound, Building2, BadgeCheck, ScrollText,
    Phone, Search, Plus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { usePurchase, type Party } from '../purchase-context';
import { usePartySearch } from '@/hooks/use-purchase-search';

// These modals already exist in the app — imported as-is
// Adjust paths if your folder structure differs
// They should accept { open, onOpenChange, onCreated } props
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
        <div>
            <div className="grid grid-cols-3 px-4">

                {/* ── LEFT COLUMN: Party Picker ─────────────────────────────── */}
                <div className="pr-4 grid grid-cols-1 gap-2">

                    {/* Type toggle + search */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center border rounded-md bg-muted/30" role="group" aria-label="Party type">
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

                    {/* Party info card */}
                    {selectedParty ? (
                        <div className="relative rounded-lg border bg-background p-3">
                            <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                <Badge variant="secondary" className="gap-1 text-[10px]">
                                    {partyType === 'customer' ? <UserRound className="size-3" /> : <Building2 className="size-3" />}
                                    {partyType.charAt(0).toUpperCase() + partyType.slice(1)}
                                </Badge>
                                {partyType === 'customer' && selectedParty.is_verified && (
                                    <Badge variant="outline" className="gap-1 text-[10px] border-primary/30 text-primary">
                                        <BadgeCheck className="size-3" /> KYC
                                    </Badge>
                                )}
                                {selectedParty.gstin && (
                                    <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                                        GST Registered
                                    </Badge>
                                )}
                                <button onClick={() => dispatch({ type: 'SET_PARTY', payload: null })} className="ml-1 text-muted-foreground hover:text-foreground">
                                    <X className="size-3.5" />
                                </button>
                            </div>

                            <div className="flex items-start gap-3 pr-32">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                    {partyType === 'customer' ? <UserRound className="size-4 text-muted-foreground" /> : <Building2 className="size-4 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold truncate">{selectedParty.name}</h3>
                                    {selectedParty.care_of && (
                                        <p className="text-[11px] text-muted-foreground">c/o {selectedParty.care_of}</p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2 grid grid-cols-3 gap-3 border-t pt-2 text-[10px]">
                                <div>
                                    <p className="font-medium uppercase tracking-wide text-muted-foreground">Mobile</p>
                                    <p className="mt-0.5 font-medium">{selectedParty.phone_primary ?? selectedParty.phone ?? '—'}</p>
                                </div>
                                {selectedParty.gstin && (
                                    <div className="col-span-2">
                                        <p className="font-medium uppercase tracking-wide text-muted-foreground">GSTIN</p>
                                        <p className="mt-0.5 font-mono font-medium">{selectedParty.gstin}</p>
                                    </div>
                                )}
                                {partyType === 'customer' && selectedParty.aadhaar_number && (
                                    <div>
                                        <p className="font-medium uppercase tracking-wide text-muted-foreground">Aadhaar</p>
                                        <p className="mt-0.5 font-mono font-medium">XXXX XXXX {selectedParty.aadhaar_number.slice(-4)}</p>
                                    </div>
                                )}
                                {selectedParty.address_snapshot && (
                                    <div className="col-span-3 flex items-start gap-1">
                                        <MapPin className="size-3 mt-0.5 shrink-0 text-muted-foreground" />
                                        <p className="text-muted-foreground leading-tight">{selectedParty.address_snapshot}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-lg border bg-background p-3 flex flex-col items-center justify-center text-center gap-1 min-h-[80px]">
                            <p className="text-xs text-muted-foreground">Search and select a {partyType} above</p>
                            <button
                                className="flex items-center gap-1 text-xs text-primary hover:underline"
                                onClick={() => setCreateModalOpen(true)}
                            >
                                <Plus className="size-3" /> Create new {partyType}
                            </button>
                        </div>
                    )}
                </div>

                {/* ── MID COLUMN: Account Summary (placeholder for v2) ─────── */}
                <div className="flex h-full flex-col items-center justify-center text-center">
                    <div className="flex size-9 items-center justify-center rounded-md bg-muted">
                        <ScrollText className="size-4 text-muted-foreground" />
                    </div>
                    <p className="mt-2 text-xs font-medium text-foreground">Account Summary</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                        Transactions, payments, totals and outstanding dues
                    </p>
                </div>

                {/* ── RIGHT COLUMN: Doc Meta & Tax Movement ────────────────── */}
                <div className="pl-4">
                    <div className="relative rounded-lg border bg-background p-3">
                        {/* Status badges */}
                        <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <Badge variant="secondary" className="text-[10px]">
                                {flags.billType.toUpperCase()}
                            </Badge>
                            {flags.isGstBilled ? (
                                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                                    GST
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    Non-GST
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-start gap-3 pr-24">
                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                <FileText className="size-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold">Purchase Details</h3>
                                <p className="text-[10px] text-muted-foreground">Invoice &amp; purchase information</p>
                            </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Purchase No.</p>
                                <Input
                                    className="mt-0.5 h-7 text-xs font-mono"
                                    value={poNumber}
                                    onChange={(e) => dispatch({ type: 'SET_PO_NUMBER', payload: e.target.value })}
                                />
                            </div>
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Vendor Invoice</p>
                                <Input
                                    className="mt-0.5 h-7 text-xs"
                                    placeholder="Invoice number"
                                    value={vendorInvoiceNo}
                                    onChange={(e) => dispatch({ type: 'SET_VENDOR_INVOICE', payload: e.target.value })}
                                />
                            </div>
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Purchase Date</p>
                                <Input
                                    className="mt-0.5 h-7 text-xs"
                                    type="date"
                                    value={orderDate}
                                    onChange={(e) => dispatch({ type: 'SET_ORDER_DATE', payload: e.target.value })}
                                />
                            </div>

                            {/* Tax Movement — auto-set, user-overridable */}
                            <div>
                                <div className="flex items-center justify-between mb-0.5">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Tax Movement</p>
                                </div>
                                <div className="flex h-7 items-center rounded-md border bg-muted/30" role="group">
                                    {(['intra', 'inter'] as const).map((mode) => (
                                        <Button
                                            key={mode}
                                            type="button"
                                            variant={taxMovement === mode ? 'outline' : 'ghost'}
                                            aria-pressed={taxMovement === mode}
                                            onClick={() => dispatch({ type: 'SET_TAX_MOVEMENT', payload: mode })}
                                            className={cn('h-6 flex-1 px-2 text-[10px]', taxMovement !== mode && 'text-muted-foreground')}
                                        >
                                            {mode === 'intra' ? 'CGST+SGST' : 'IGST'}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-2 text-[10px]">
                            <span className="text-muted-foreground">Store GST State</span>
                            <span className="font-medium">{store.state_name}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Create modals */}
            {createModalOpen && partyType === 'supplier' && (
                <SupplierFormModal open={createModalOpen} onOpenChange={setCreateModalOpen} onCreated={handleCreated} />
            )}
            {createModalOpen && partyType === 'customer' && (
                <CustomerFormModal open={createModalOpen} onOpenChange={setCreateModalOpen} onCreated={handleCreated} />
            )}
        </div>
    );
}

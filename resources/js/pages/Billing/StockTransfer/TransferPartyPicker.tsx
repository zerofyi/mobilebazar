import { Building2, BadgeCheck, Store, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useSale, type SaleParty } from "../SaleEntry/sale-context";

export interface AttachedSupplier {
    id: number;
    name: string;
    phone: string | null;
    gstin: string | null;
    linked_store: { id: number; name: string; code: string | null } | null;
}

/**
 * Transfer party picker: the sale party and the target store are the same
 * choice — a supplier of this store that has a store attached. Only those
 * suppliers are listed (the controller passes nothing else). Selecting one
 * dispatches the regular SET_PARTY, so GST movement (intra/inter) is
 * derived from the GSTINs exactly like a normal sale.
 */
export default function TransferPartyPicker({ suppliers }: { suppliers: AttachedSupplier[] }) {
    const { state, dispatch, store } = useSale();
    const selected = state.party;

    const select = (supplierId: string) => {
        const s = suppliers.find((x) => x.id === Number(supplierId));
        if (!s) return;
        const party: SaleParty = {
            type: "supplier",
            id: s.id,
            name: s.name,
            phone: s.phone,
            gstin: s.gstin,
        };
        dispatch({ type: "SET_PARTY", payload: { party, storeGstin: store.gstin } });
    };

    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Transfer To — Store / Party
            </p>

            {suppliers.length === 0 ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                    <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                    <p>
                        No supplier in this store has a store attached yet. Attach one first —
                        Suppliers → ⋯ → Attach Store — then it will appear here. The other store
                        must also attach your store on their side before a transfer can post.
                    </p>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-52 flex-1">
                        <Label className="sr-only">Target store</Label>
                        <Select
                            value={selected ? String(selected.id) : ""}
                            onValueChange={select}
                        >
                            <SelectTrigger className="h-9 w-full">
                                <SelectValue placeholder="Select the target store…" />
                            </SelectTrigger>
                            <SelectContent>
                                {suppliers.map((s) => (
                                    <SelectItem key={s.id} value={String(s.id)}>
                                        {s.linked_store?.name ?? s.name} — {s.name}
                                        {s.gstin ? " · GSTIN" : ""}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {selected && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                                <Store className="size-3" />
                                {suppliers.find((s) => s.id === selected.id)?.linked_store?.name ?? "Store"}
                            </Badge>
                            <span className="flex items-center gap-1">
                                <Building2 className="size-3.5" /> {selected.name}
                            </span>
                            {selected.gstin && (
                                <Badge variant="outline" className="gap-1 text-[10px]">
                                    <BadgeCheck className="size-3 text-primary" /> {selected.gstin}
                                </Badge>
                            )}
                            {selected.phone && <span>{selected.phone}</span>}
                        </div>
                    )}
                </div>
            )}

            {!selected && suppliers.length > 0 && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                    The sale is billed to this party, and the same stock is purchased automatically
                    in the attached store.
                </p>
            )}
        </div>
    );
}

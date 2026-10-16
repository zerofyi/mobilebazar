import { useEffect, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useSale } from "../SaleEntry/sale-context";

export interface BuybackForm {
    product_variant_id: number | null;
    manual_item_name: string;
    imei1: string;
    imei2: string;
    serial_number: string;
    device_condition: string;
    agreed_value: number;
    notes: string;
}

const CONDITIONS = ["EXCELLENT", "GOOD", "AVERAGE", "POOR", "DAMAGED"];

function newId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * The old-device side of a buyback: what the customer is selling us.
 * The agreed value is mirrored into the sale's payment splits as a locked
 * 'buyback' row so the cashier sees the net payable live.
 */
export default function BuybackPanel({
    value,
    onChange,
}: {
    value: BuybackForm;
    onChange: (v: BuybackForm) => void;
}) {
    const { state, dispatch } = useSale();
    const [variantQuery, setVariantQuery] = useState("");
    const [variantResults, setVariantResults] = useState<{ id: number; label: string }[]>([]);
    const [searching, setSearching] = useState(false);

    const set = (patch: Partial<BuybackForm>) => onChange({ ...value, ...patch });

    // Mirror the agreed value into a locked buyback payment split.
    useEffect(() => {
        const existing = state.payments.find((p) => p.mode === "buyback");
        if (value.agreed_value > 0) {
            if (existing) {
                if (existing.amount !== value.agreed_value) {
                    dispatch({
                        type: "UPDATE_PAYMENT",
                        payload: { id: existing.id, patch: { amount: value.agreed_value } },
                    });
                }
            } else {
                dispatch({
                    type: "ADD_PAYMENT",
                    payload: { id: newId(), mode: "buyback", amount: value.agreed_value, locked: true },
                });
            }
        } else if (existing) {
            dispatch({ type: "REMOVE_PAYMENT", payload: existing.id });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value.agreed_value]);

    // Simple variant search for the old device.
    useEffect(() => {
        if (variantQuery.trim().length < 2) {
            setVariantResults([]);
            return;
        }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const res = await fetch(`/app/buyback/variants/search?q=${encodeURIComponent(variantQuery)}`, {
                    headers: { Accept: "application/json" },
                });
                const json = await res.json();
                const out: { id: number; label: string }[] = (json.results ?? []).slice(0, 8);
                setVariantResults(out);
            } catch {
                setVariantResults([]);
            } finally {
                setSearching(false);
            }
        }, 300);
        return () => clearTimeout(t);
    }, [variantQuery]);

    return (
        <Card className="border-primary/30">
            <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                    <ArrowLeftRight className="size-4 text-primary" />
                    Old device — buyback
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                        Value ₹{(value.agreed_value || 0).toLocaleString("en-IN")}
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="space-y-1">
                    <Label>Device (search catalog)</Label>
                    <Input
                        value={variantQuery}
                        onChange={(e) => setVariantQuery(e.target.value)}
                        placeholder="Search brand / model…"
                    />
                    {(searching || variantResults.length > 0) && (
                        <div className="rounded-md border max-h-32 overflow-auto">
                            {searching && <p className="p-2 text-xs text-muted-foreground">Searching…</p>}
                            {variantResults.map((r) => (
                                <button
                                    key={r.id}
                                    type="button"
                                    className="block w-full text-left px-2 py-1.5 text-xs hover:bg-muted"
                                    onClick={() => {
                                        set({ product_variant_id: r.id, manual_item_name: "" });
                                        setVariantQuery(r.label);
                                        setVariantResults([]);
                                    }}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {value.product_variant_id && (
                        <p className="text-xs text-emerald-600">Selected catalog item #{value.product_variant_id}</p>
                    )}
                </div>
                <div className="space-y-1">
                    <Label>Or device name (manual)</Label>
                    <Input
                        value={value.manual_item_name}
                        onChange={(e) => set({ manual_item_name: e.target.value, product_variant_id: null })}
                        placeholder="e.g. iPhone 12 128GB"
                        maxLength={255}
                    />
                </div>
                <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                        <Label>IMEI 1</Label>
                        <Input value={value.imei1} onChange={(e) => set({ imei1: e.target.value })} maxLength={30} placeholder="IMEI" />
                    </div>
                    <div className="space-y-1">
                        <Label>IMEI 2</Label>
                        <Input value={value.imei2} onChange={(e) => set({ imei2: e.target.value })} maxLength={30} placeholder="IMEI 2" />
                    </div>
                    <div className="space-y-1">
                        <Label>Serial</Label>
                        <Input value={value.serial_number} onChange={(e) => set({ serial_number: e.target.value })} maxLength={60} placeholder="S/N" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                        <Label>Condition</Label>
                        <Select value={value.device_condition} onValueChange={(v) => set({ device_condition: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {CONDITIONS.map((c) => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label>Agreed value ₹ *</Label>
                        <Input
                            type="number"
                            min={0}
                            value={value.agreed_value || ""}
                            onChange={(e) => set({ agreed_value: parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            className="text-right font-semibold"
                            placeholder="0"
                        />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label>Notes</Label>
                    <Textarea value={value.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={1000} placeholder="Scratches, bill/box available…" />
                </div>
            </CardContent>
        </Card>
    );
}

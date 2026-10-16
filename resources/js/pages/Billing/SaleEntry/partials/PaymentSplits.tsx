import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useSale, type PaymentSplit, type SplitMode } from "../sale-context";
import { cn } from "@/lib/utils";

const MODES: { value: SplitMode; label: string }[] = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "neft", label: "NEFT" },
    { value: "cheque", label: "Cheque" },
];

function newId() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function inr(n: number) {
    return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

/**
 * Per-invoice payment breakdown: the cashier can split the paid amount
 * across modes (e.g. ₹1,000 cash + ₹15,000 UPI + ₹1,200 buyback).
 * Buyback rows are system-added and locked.
 */
export default function PaymentSplits({ grandTotal }: { grandTotal: number }) {
    const { state, dispatch } = useSale();
    const payments = state.payments;

    const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const remaining = Math.max(0, Math.round((grandTotal - paid) * 100) / 100);

    const addPayment = () => {
        const split: PaymentSplit = {
            id: newId(),
            mode: state.paymentMode,
            amount: remaining > 0 ? remaining : 0,
        };
        dispatch({ type: "ADD_PAYMENT", payload: split });
    };

    // First render with no splits: seed one editable row so the cashier can
    // just type. (paidInFull bypasses this entirely.)
    if (!state.paidInFull && payments.length === 0) {
        return (
            <div className="rounded-lg border border-dashed p-2">
                <Button type="button" variant="ghost" size="sm" className="w-full h-8 text-xs" onClick={addPayment}>
                    <Plus className="size-3.5 mr-1" /> Add payment
                </Button>
            </div>
        );
    }

    if (state.paidInFull) return null;

    return (
        <div className="space-y-1.5">
            {payments.map((p) => (
                <div key={p.id} className="flex items-center gap-1.5">
                    <Select
                        value={p.mode}
                        disabled={p.locked}
                        onValueChange={(v) => dispatch({ type: "UPDATE_PAYMENT", payload: { id: p.id, patch: { mode: v as SplitMode } } })}
                    >
                        <SelectTrigger className="h-8 w-24 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {MODES.map((m) => (
                                <SelectItem key={m.value} value={m.value} className="text-xs">
                                    {m.label}
                                </SelectItem>
                            ))}
                            {p.mode === "buyback" && (
                                <SelectItem value="buyback" className="text-xs">
                                    Buyback
                                </SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                    <Input
                        type="number"
                        min={0}
                        value={p.amount || ""}
                        placeholder="0"
                        disabled={p.locked}
                        onChange={(e) =>
                            dispatch({ type: "UPDATE_PAYMENT", payload: { id: p.id, patch: { amount: parseFloat(e.target.value) || 0 } } })
                        }
                        onFocus={(e) => e.target.select()}
                        className="h-8 text-right text-sm tabular-nums"
                        aria-label={`Amount for ${p.mode}`}
                    />
                    {!p.locked ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => dispatch({ type: "REMOVE_PAYMENT", payload: p.id })}
                            aria-label="Remove payment"
                        >
                            <X className="size-3.5" />
                        </Button>
                    ) : (
                        <span className="w-8 shrink-0 text-center text-[10px] text-muted-foreground" title="Linked buyback bill">
                            linked
                        </span>
                    )}
                </div>
            ))}
            <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={addPayment}>
                    <Plus className="size-3.5 mr-1" /> Add
                </Button>
                <span className={cn("text-xs tabular-nums", remaining > 0.009 ? "text-muted-foreground" : "text-emerald-600 dark:text-emerald-400")}>
                    Paid ₹{inr(paid)}
                    {remaining > 0.009 && <> · remaining ₹{inr(remaining)}</>}
                </span>
            </div>
        </div>
    );
}

import React, { useState } from "react";
import { CheckCircle2, PauseCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useSale, inr, type PaymentMode } from "../sale-context";

const PAYMENT_MODES = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "neft", label: "NEFT" },
    { value: "cheque", label: "Cheque" },
] as const;

interface Props {
    onSubmit: () => void;
    onPark: () => void;
    isSubmitting: boolean;
    errors: string[];
    isValid: boolean;
    triedSubmit: boolean;
}

/**
 * Bill totals + shipping + payment + notes + submit actions.
 * Shown below the cart table (or in the side column).
 */
export default function SaleTotals({ onSubmit, onPark, isSubmitting, errors, isValid, triedSubmit }: Props) {
    const {
        state, dispatch, lineCount,
        subtotal, taxAmount, cgst, sgst, igst, roundOff, grandTotal, dueAmount,
    } = useSale();
    const [taxOpen, setTaxOpen] = useState(false);

    const showErrors = triedSubmit && !isValid;

    return (
        <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-card p-4">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="flex items-center gap-2">
                        <Label htmlFor="bill-discount" className="text-xs text-muted-foreground whitespace-nowrap">Bill discount ₹</Label>
                        <Input
                            id="bill-discount" type="number" min={0}
                            value={state.billDiscount || ""}
                            placeholder="0"
                            onChange={(e) => dispatch({ type: "SET_BILL_DISCOUNT", payload: parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            className="h-8 text-right text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <Label htmlFor="shipping-charge" className="text-xs text-muted-foreground whitespace-nowrap">Shipping ₹</Label>
                        <Input
                            id="shipping-charge" type="number" min={0}
                            value={state.shippingCharge || ""}
                            placeholder="0"
                            onChange={(e) => dispatch({ type: "SET_SHIPPING_CHARGE", payload: parseFloat(e.target.value) || 0 })}
                            onFocus={(e) => e.target.select()}
                            className="h-8 text-right text-sm"
                        />
                    </div>
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                    <Checkbox
                        id="auto-round"
                        checked={state.autoRoundOff}
                        onCheckedChange={(c) => dispatch({ type: "SET_ROUND_OFF", payload: { auto: !!c, manual: state.roundOffManual } })}
                    />
                    <Label htmlFor="auto-round" className="text-xs text-muted-foreground cursor-pointer">Auto round-off</Label>
                    {!state.autoRoundOff && (
                        <Input
                            type="number" step="0.01"
                            value={state.roundOffManual}
                            onChange={(e) => dispatch({ type: "SET_ROUND_OFF", payload: { auto: false, manual: parseFloat(e.target.value) || 0 } })}
                            className="h-8 w-20 text-right text-sm"
                            aria-label="Manual round-off"
                        />
                    )}
                </div>

                <Separator className="my-3" />

                <dl className="space-y-1 text-sm">
                    <div className="flex justify-between">
                        <dt className="text-muted-foreground">Subtotal</dt>
                        <dd className="tabular-nums">₹{inr(subtotal)}</dd>
                    </div>
                    {state.billDiscount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                            <dt>Bill discount</dt>
                            <dd className="tabular-nums">− ₹{inr(state.billDiscount)}</dd>
                        </div>
                    )}
                    {state.shippingCharge > 0 && (
                        <div className="flex justify-between">
                            <dt className="text-muted-foreground">Shipping</dt>
                            <dd className="tabular-nums">+ ₹{inr(state.shippingCharge)}</dd>
                        </div>
                    )}
                    <div>
                        <button type="button" className="flex w-full items-center justify-between" onClick={() => setTaxOpen((o) => !o)}>
                            <dt className="flex items-center gap-1 text-muted-foreground">
                                Tax {state.isGstBilled ? `(${state.taxMovement === "intra" ? "CGST+SGST" : "IGST"})` : "(no GST)"}
                                <ChevronDown className={cn("size-3.5 transition-transform", taxOpen && "rotate-180")} />
                            </dt>
                            <dd className="tabular-nums">₹{inr(taxAmount)}</dd>
                        </button>
                        {taxOpen && state.isGstBilled && (
                            <div className="ml-2 mt-1 space-y-0.5 border-l-2 border-border pl-2 text-[13px] text-muted-foreground">
                                {state.taxMovement === "intra" ? (
                                    <>
                                        <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">₹{inr(cgst)}</span></div>
                                        <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">₹{inr(sgst)}</span></div>
                                    </>
                                ) : (
                                    <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">₹{inr(igst)}</span></div>
                                )}
                            </div>
                        )}
                    </div>
                    {roundOff !== 0 && (
                        <div className="flex justify-between text-muted-foreground">
                            <dt>Round off</dt>
                            <dd className="tabular-nums">{roundOff > 0 ? "+" : "−"} ₹{inr(Math.abs(roundOff))}</dd>
                        </div>
                    )}
                    <div className="flex items-baseline justify-between pt-1">
                        <dt className="text-base font-semibold">Grand Total</dt>
                        <dd className="text-xl font-bold tabular-nums text-primary">₹{inr(grandTotal)}</dd>
                    </div>
                </dl>

                <Separator className="my-3" />

                <div className="flex items-center gap-2">
                    <Label htmlFor="paid-amount" className="text-xs text-muted-foreground whitespace-nowrap">Paid ₹</Label>
                    <Input
                        id="paid-amount" type="number" min={0}
                        value={state.paidAmount || ""}
                        placeholder="0"
                        onChange={(e) => dispatch({ type: "SET_PAID_AMOUNT", payload: parseFloat(e.target.value) || 0 })}
                        onFocus={(e) => e.target.select()}
                        className="h-8 text-right text-sm"
                    />
                    <span className={cn("text-sm font-semibold tabular-nums whitespace-nowrap", dueAmount > 0.009 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                        Due ₹{inr(dueAmount)}
                    </span>
                </div>
                <div className="mt-2 grid grid-cols-6 gap-1" role="group" aria-label="Payment mode">
                    {PAYMENT_MODES.map((m) => (
                        <button
                            key={m.value}
                            type="button"
                            onClick={() => dispatch({ type: "SET_PAYMENT_MODE", payload: m.value as PaymentMode })}
                            className={cn(
                                "rounded-md border px-1 py-1.5 text-[11px] font-medium",
                                state.paymentMode === m.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>

                <Textarea
                    value={state.notes}
                    onChange={(e) => dispatch({ type: "SET_NOTES", payload: e.target.value })}
                    placeholder="Notes (optional)"
                    rows={1}
                    className="mt-2 min-h-8 text-xs"
                />
            </div>

            {showErrors && (
                <div id="sale-validation" className="rounded-lg border border-destructive/40 bg-destructive/5 p-2.5">
                    <p className="text-xs font-semibold text-destructive">Fix these before completing the sale:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-destructive/90">
                        {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                </div>
            )}

            <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" disabled={isSubmitting || lineCount === 0} onClick={onPark}>
                    <PauseCircle className="size-4 mr-1.5" /> Park
                </Button>
                <Button type="button" className="flex-[2] h-11 text-base font-semibold" disabled={isSubmitting || !isValid} onClick={onSubmit}>
                    <CheckCircle2 className="size-5 mr-2" /> {isSubmitting ? "Posting…" : `Complete Sale · ₹${inr(grandTotal, grandTotal % 1 === 0 ? 0 : 2)}`}
                </Button>
            </div>
        </div>
    );
}

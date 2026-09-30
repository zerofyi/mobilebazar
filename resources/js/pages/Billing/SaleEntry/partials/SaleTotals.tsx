import React, { useState } from "react";
import { CheckCircle2, PauseCircle, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSale, inr } from "../sale-context";

interface Props {
    onSubmit: () => void;
    onPark: () => void;
    isSubmitting: boolean;
    errors: string[];
    isValid: boolean;
    triedSubmit: boolean;
}

/**
 * Bill summary (right column, below the invoice meta card).
 * Mirrors the invoices table money fields: subtotal, discount, shipping,
 * tax, round-off, grand total, paid, due, payment status.
 * Payment mode + notes live in InvoiceMeta.
 */
export default function SaleTotals({ onSubmit, onPark, isSubmitting, errors, isValid, triedSubmit }: Props) {
    const {
        state, dispatch, lineCount, totalQty, paidAmount,
        subtotal, taxAmount, cgst, sgst, igst, roundOff, grandTotal, dueAmount,
    } = useSale();
    const [taxOpen, setTaxOpen] = useState(false);

    const showErrors = triedSubmit && !isValid;
    const paid = Math.max(0, paidAmount);
    const paymentStatus: "paid" | "partial" | "unpaid" =
        dueAmount <= 0.009 ? "paid" : paid > 0 ? "partial" : "unpaid";

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
                    <div className="flex justify-between text-muted-foreground">
                        <dt>{lineCount} line{lineCount !== 1 ? "s" : ""} · {totalQty} item{totalQty !== 1 ? "s" : ""}</dt>
                        <dd>
                            <Badge
                                variant="outline"
                                className={cn(
                                    "text-[10px] capitalize",
                                    paymentStatus === "paid" && "text-emerald-700 dark:text-emerald-400",
                                    paymentStatus === "partial" && "text-amber-700 dark:text-amber-400",
                                    paymentStatus === "unpaid" && "text-muted-foreground"
                                )}
                            >
                                {paymentStatus}
                            </Badge>
                        </dd>
                    </div>
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
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Checkbox
                            id="paid-in-full"
                            checked={state.paidInFull}
                            onCheckedChange={(c) => dispatch({ type: "SET_PAID_IN_FULL", payload: !!c })}
                        />
                        <Label htmlFor="paid-in-full" className="text-xs font-medium cursor-pointer whitespace-nowrap" title="Tick to collect the full bill amount now">
                            Paid ₹
                        </Label>
                    </div>
                    <Input
                        id="paid-amount" type="number" min={0}
                        value={paidAmount || ""}
                        placeholder="0"
                        disabled={state.paidInFull}
                        onChange={(e) => dispatch({ type: "SET_PAID_AMOUNT", payload: parseFloat(e.target.value) || 0 })}
                        onFocus={(e) => e.target.select()}
                        className="h-8 text-right text-sm disabled:opacity-70"
                        aria-label="Paid amount"
                    />
                    <span className={cn("text-sm font-semibold tabular-nums whitespace-nowrap", dueAmount > 0.009 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")}>
                        Due ₹{inr(dueAmount)}
                    </span>
                </div>
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

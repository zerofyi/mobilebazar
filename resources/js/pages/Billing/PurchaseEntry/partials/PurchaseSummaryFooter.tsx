import React, { useMemo, useState } from "react";
import { CreditCard, Info, ChevronDown, ChevronUp, AlertTriangle, FileCheck, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import SingleImageUploader from "@/components/special/single-image-uploader";
import { usePurchase, type PaymentMode } from "../purchase-context";
import { cn } from "@/lib/utils";

const Uploader = SingleImageUploader as any;

interface Props {
    onSubmit: (isDraft: boolean) => void;
    isSubmitting?: boolean;
    triedSubmit: boolean;
    errors: string[];
    isValid: boolean;
}
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PurchaseSummaryFooter({ onSubmit, isSubmitting = false, triedSubmit, errors, isValid }: Props) {
    const { state, dispatch, subtotal, totalTax, grandTotal, roundOff, dueAmount, flags, vendorIsRegistered, marginLineCount, calculatedRows } = usePurchase();
    const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);

    const isInterstate = state.taxMovement === "inter";
    const cgst = isInterstate ? 0 : totalTax / 2;
    const sgst = isInterstate ? 0 : totalTax / 2;
    const igst = isInterstate ? totalTax : 0;

    // errors/isValid now come from Index.tsx — that's the single gate both
    // the header's and this footer's Save & Post buttons share. Don't
    // recompute them here; a local copy is how the header ended up able
    // to bypass validation entirely.
    const showErrors = triedSubmit && !isValid;

    const flagHint = useMemo(() => {
        if (!flags.isGstBilled) return "Non-GST purchase — no tax billed, base cost = cost − discount.";
        if (flags.billType === "po" && vendorIsRegistered) return "GST purchase (B2B, registered vendor) — tax applies only on New-condition lines; Used/Refurb lines go under margin scheme (0% at purchase).";
        return "GST purchase, margin scheme — vendor unregistered: no ITC, tax 0% at purchase; GST applies on margin at sale time.";
    }, [flags, vendorIsRegistered]);

    return (
        <div className="bg-card rounded-b-md overflow-hidden border-t">
            {showErrors && (
                <div id="purchase-validation" className="mx-4 mt-4 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="flex items-center text-xs font-semibold text-destructive"><AlertTriangle className="size-3.5 mr-1.5" /> Fix {errors.length} issue{errors.length > 1 ? "s" : ""} before posting</p>
                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-destructive/90 list-disc pl-5 max-h-32 overflow-y-auto">
                        {errors.slice(0, 8).map((e, i) => <li key={i}>{e}</li>)}
                        {errors.length > 8 && <li>…and {errors.length - 8} more</li>}
                    </ul>
                </div>
            )}

            <div className="px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
                    <div className="lg:col-span-2 space-y-3">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-muted-foreground">Purchase Remarks / Notes</label>
                            <Textarea value={state.notes} onChange={(e) => dispatch({ type: "SET_NOTES", payload: e.target.value })} rows={3} placeholder="e.g. Walk-in purchase, goods verified physically." className="text-xs resize-none" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1"><span className="text-[11px] text-muted-foreground">Invoice Document</span><Uploader value={state.invoiceDocumentPath} onChange={(p: string | null) => dispatch({ type: "SET_INVOICE_DOC", payload: p })} /></div>
                            <div className="space-y-1"><span className="text-[11px] text-muted-foreground">Challan / Other</span><Uploader value={state.additionalDocumentPath} onChange={(p: string | null) => dispatch({ type: "SET_ADDITIONAL_DOC", payload: p })} /></div>
                        </div>

                        <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
                            <p className="flex items-center text-[11px] font-semibold text-foreground"><ReceiptText className="size-3.5 mr-1.5 text-primary" /> GST Routing (auto)</p>
                            <div className="flex flex-wrap gap-1.5">
                                <Badge variant="secondary" className="text-[10px] font-mono uppercase">bill: {flags.billType}</Badge>
                                <Badge variant={flags.isGstBilled ? "default" : "outline"} className="text-[10px]">{flags.isGstBilled ? "GST billed" : "Non-GST"}</Badge>
                                {flags.isGstBilled && !vendorIsRegistered && <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-50 text-amber-700">Margin · whole bill</Badge>}
                                {flags.isGstBilled && vendorIsRegistered && marginLineCount > 0 && <Badge variant="outline" className="text-[10px] border-amber-500/40 bg-amber-50 text-amber-700">Margin · {marginLineCount}/{calculatedRows.length} lines</Badge>}
                                <Badge variant="outline" className="text-[10px]">{state.taxMovement === "inter" ? "IGST" : "CGST+SGST"}</Badge>
                            </div>
                            <p className="text-[10px] leading-relaxed text-muted-foreground">{flagHint}</p>
                        </div>
                    </div>

                    <div className="col-span-2 hidden lg:flex flex-col items-center justify-center text-center text-muted-foreground">
                        <FileCheck className="size-8 opacity-20" />
                        <p className="mt-2 text-[11px] max-w-48 leading-relaxed">Instant purchase posts stock immediately: serialized → one <span className="font-mono">stock_units</span> row per IMEI, bulk → one <span className="font-mono">stock_batches</span> row.</p>
                    </div>

                    <div className="lg:col-span-2 space-y-4">
                        <div className="bg-muted/30 rounded-lg border p-4 space-y-2 text-xs">
                            <div className="flex justify-between text-muted-foreground"><span>Sub Total (net base):</span><span className="font-mono font-semibold text-foreground">₹ {fmt(subtotal)}</span></div>
                            <div className="flex justify-between items-center text-muted-foreground"><span>Additional Discount:</span><div className="flex items-center gap-1.5"><span>− ₹</span><Input type="number" min="0" value={state.additionalDiscount || ""} onChange={(e) => dispatch({ type: "SET_ADDITIONAL_DISCOUNT", payload: Math.max(0, parseFloat(e.target.value) || 0) })} placeholder="0" className="w-24 h-7 text-right text-xs font-mono" /></div></div>
                            <div className="flex justify-between items-center text-muted-foreground"><span>Freight & Charges:</span><div className="flex items-center gap-1.5"><span>+ ₹</span><Input type="number" min="0" value={state.freightCharges || ""} onChange={(e) => dispatch({ type: "SET_FREIGHT", payload: Math.max(0, parseFloat(e.target.value) || 0) })} placeholder="0" className="w-24 h-7 text-right text-xs font-mono" /></div></div>

                            {flags.isGstBilled ? (
                                <div className="pt-1 border-t border-border/60">
                                    <button type="button" onClick={() => setShowTaxBreakdown((p) => !p)} className="flex items-center justify-between w-full text-primary hover:underline font-medium text-xs">
                                        <span>Evaluated Tax Total:</span>
                                        <span className="flex items-center gap-1 font-mono text-foreground">₹ {fmt(totalTax)} {showTaxBreakdown ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}</span>
                                    </button>
                                    {showTaxBreakdown && (
                                        <div className="mt-1.5 pl-2 space-y-1 text-muted-foreground">
                                            {!isInterstate ? (<><div className="flex justify-between"><span>CGST:</span><span className="font-mono text-foreground">₹ {fmt(cgst)}</span></div><div className="flex justify-between"><span>SGST:</span><span className="font-mono text-foreground">₹ {fmt(sgst)}</span></div></>) : (<div className="flex justify-between"><span>IGST:</span><span className="font-mono text-foreground">₹ {fmt(igst)}</span></div>)}
                                            <p className="text-[10px] pt-1">Tax applies only on New-condition lines from registered vendors.</p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="pt-1 border-t border-border/60 flex justify-between text-muted-foreground"><span>Tax:</span><span className="font-mono">₹ 0.00 (non-GST)</span></div>
                            )}

                            <div className="flex justify-between items-center text-muted-foreground pt-1 border-t border-border/60">
                                <div className="flex items-center gap-2">
                                    <Checkbox id="auto-roundoff" checked={state.autoRoundOff} onCheckedChange={(c) => dispatch({ type: "SET_AUTO_ROUND_OFF", payload: !!c })} />
                                    <label htmlFor="auto-roundoff" className="cursor-pointer select-none text-xs">Auto Round Off</label>
                                </div>
                                <span className="font-mono">{roundOff >= 0 ? "+" : ""} ₹ {roundOff.toFixed(2)}</span>
                            </div>

                            <div className="pt-3 border-t-2 flex justify-between items-baseline">
                                <span className="text-sm font-bold">Grand Total:</span>
                                <span className="text-xl font-extrabold text-primary font-mono">₹ {fmt(grandTotal)}</span>
                            </div>
                        </div>

                        <div className="bg-card rounded-lg border p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold flex items-center"><CreditCard className="size-3.5 mr-1.5 text-primary" /> Record Direct Payment</span>
                                <label className="flex items-center gap-1.5 text-muted-foreground cursor-pointer select-none">
                                    <Checkbox checked={state.markAsPaid} onCheckedChange={(c) => { const checked = !!c; dispatch({ type: "SET_MARK_AS_PAID", payload: checked }); if (checked && state.paidAmount === 0) dispatch({ type: "SET_PAID_AMOUNT", payload: Math.round(grandTotal * 100) / 100 }); }} />
                                    <span>Already Paid</span>
                                </label>
                            </div>
                            {state.markAsPaid && (
                                <div className="space-y-2 pt-2 border-t border-border/50">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1"><span className="text-[11px] text-muted-foreground">Paid Amount</span><Input type="number" min="0" max={grandTotal} value={state.paidAmount || ""} onChange={(e) => dispatch({ type: "SET_PAID_AMOUNT", payload: Math.max(0, parseFloat(e.target.value) || 0) })} placeholder="0.00" className="h-8 text-xs font-mono" /></div>
                                        <div className="space-y-1"><span className="text-[11px] text-muted-foreground">Payment Mode</span><Select value={state.paymentMode} onValueChange={(v) => dispatch({ type: "SET_PAYMENT_MODE", payload: v as PaymentMode })}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cash">Cash</SelectItem><SelectItem value="upi">UPI</SelectItem><SelectItem value="neft">NEFT / RTGS</SelectItem><SelectItem value="cheque">Cheque</SelectItem><SelectItem value="card">Card</SelectItem></SelectContent></Select></div>
                                    </div>
                                    <div className="flex justify-between items-center pt-2 border-t border-border/40"><span className="text-muted-foreground font-medium">Balance Due:</span><span className={cn("font-mono font-bold", dueAmount > 0.009 ? "text-destructive" : "text-primary")}>₹ {fmt(dueAmount)}</span></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-muted px-6 py-4 border-t flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><Info className="size-4 shrink-0" /><span>Instant purchase: stock units/batches & journals post immediately on Save & Post.</span></div>
                <div className="flex items-center gap-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" disabled={isSubmitting} onClick={() => window.history.back()}>Cancel</Button>
                    <Button type="button" variant="outline" size="sm" disabled={isSubmitting} onClick={() => onSubmit(true)}>{isSubmitting ? "Saving…" : "Save Draft"}</Button>
                    <Button type="button" size="sm" disabled={isSubmitting} onClick={() => onSubmit(false)}>{isSubmitting ? "Posting…" : "Save & Post"}</Button>
                </div>
            </div>
        </div>
    );
}

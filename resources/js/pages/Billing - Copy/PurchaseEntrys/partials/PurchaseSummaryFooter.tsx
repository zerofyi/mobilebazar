import React from 'react';
import { CreditCard, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SingleImageUploader from '@/components/special/single-image-uploader';
import { usePurchase, type PaymentMode } from '../purchase-context';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function PurchaseSummaryFooter({ onSubmit }: { onSubmit: (isDraft: boolean) => void }) {
    const {
        state, dispatch,
        subtotal, totalTax, grandTotal, roundOff, dueAmount,
        flags,
    } = usePurchase();

    const [showTaxBreakdown, setShowTaxBreakdown] = useState(false);

    const isInterstate = state.taxMovement === 'inter';
    const cgst = isInterstate ? 0 : totalTax / 2;
    const sgst = isInterstate ? 0 : totalTax / 2;
    const igst = isInterstate ? totalTax : 0;

    const fmt = (n: number) =>
        n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
        <div className="bg-card rounded-b-md overflow-hidden">
            <div className="px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">

                    {/* ── Left: Notes & Document Uploads (2 cols) ────────────── */}
                    <div className="lg:col-span-2 space-y-2">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-muted-foreground">
                                Vendor Purchase Remarks / Notes
                            </label>
                            <Textarea
                                value={state.notes}
                                onChange={(e) => dispatch({ type: 'SET_NOTES', payload: e.target.value })}
                                rows={3}
                                placeholder="e.g. Received goods in good condition. Reference challan #882."
                                className="text-xs resize-none"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <span className="text-[11px] text-muted-foreground">Invoice Document</span>
                                <SingleImageUploader />
                            </div>
                            <div className="space-y-1">
                                <span className="text-[11px] text-muted-foreground">Delivery Challan / Other</span>
                                <SingleImageUploader />
                            </div>
                        </div>
                    </div>

                    {/* ── Mid: spacer (v2 will have ledger summary here) ─────── */}
                    <div className="col-span-2" />

                    {/* ── Right: Totals & Payment (2 cols) ───────────────────── */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Totals summary box */}
                        <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-2 text-xs">

                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Sub Total (Net Base):</span>
                                <span className="font-mono font-semibold text-foreground">₹ {fmt(subtotal)}</span>
                            </div>

                            {/* Additional discount */}
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Additional Discount:</span>
                                <div className="flex items-center space-x-1.5">
                                    <span className="text-muted-foreground">- ₹</span>
                                    <Input
                                        type="number"
                                        value={state.additionalDiscount || ''}
                                        onChange={(e) =>
                                            dispatch({ type: 'SET_ADDITIONAL_DISCOUNT', payload: parseFloat(e.target.value) || 0 })
                                        }
                                        placeholder="0"
                                        className="w-24 h-7 text-right text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {/* Freight */}
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Freight &amp; Charges:</span>
                                <div className="flex items-center space-x-1.5">
                                    <span className="text-muted-foreground">+ ₹</span>
                                    <Input
                                        type="number"
                                        value={state.freightCharges || ''}
                                        onChange={(e) =>
                                            dispatch({ type: 'SET_FREIGHT', payload: parseFloat(e.target.value) || 0 })
                                        }
                                        placeholder="0"
                                        className="w-24 h-7 text-right text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {/* GST breakdown — only shown when GST is billed */}
                            {flags.isGstBilled && (
                                <div className="pt-1 border-t border-border/60">
                                    <button
                                        type="button"
                                        onClick={() => setShowTaxBreakdown((p) => !p)}
                                        className="flex items-center justify-between w-full text-primary hover:underline font-medium text-xs"
                                    >
                                        <span>Evaluated Tax Total:</span>
                                        <span className="flex items-center gap-1 font-mono text-foreground">
                                            ₹ {fmt(totalTax)}
                                            {showTaxBreakdown ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                        </span>
                                    </button>
                                    {showTaxBreakdown && (
                                        <div className="mt-1.5 pl-2 space-y-1 text-muted-foreground">
                                            {!isInterstate ? (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span>Central Tax (CGST):</span>
                                                        <span className="font-mono text-foreground">₹ {fmt(cgst)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>State Tax (SGST):</span>
                                                        <span className="font-mono text-foreground">₹ {fmt(sgst)}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex justify-between">
                                                    <span>Integrated Tax (IGST):</span>
                                                    <span className="font-mono text-foreground">₹ {fmt(igst)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Round off */}
                            <div className="flex justify-between items-center text-muted-foreground pt-1 border-t border-border/60">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="auto-roundoff"
                                        checked={state.autoRoundOff}
                                        onCheckedChange={(c) => dispatch({ type: 'SET_AUTO_ROUND_OFF', payload: !!c })}
                                    />
                                    <label htmlFor="auto-roundoff" className="cursor-pointer select-none text-xs">
                                        Auto Round Off
                                    </label>
                                </div>
                                <span className="font-mono text-muted-foreground">
                                    {roundOff >= 0 ? '+' : ''} ₹ {roundOff.toFixed(2)}
                                </span>
                            </div>

                            {/* Grand total */}
                            <div className="pt-3 border-t-2 border-border flex justify-between items-baseline">
                                <span className="text-sm font-bold text-foreground">Grand Total:</span>
                                <span className="text-xl font-extrabold text-primary font-mono">₹ {fmt(grandTotal)}</span>
                            </div>
                        </div>

                        {/* Direct Payment Widget */}
                        <div className="bg-card rounded-lg border border-border p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground flex items-center">
                                    <CreditCard className="size-3.5 mr-1.5 text-primary" />
                                    Record Direct Payment
                                </span>
                                <label className="flex items-center space-x-1.5 text-muted-foreground cursor-pointer select-none">
                                    <Checkbox
                                        checked={state.markAsPaid}
                                        onCheckedChange={(c) => {
                                            const checked = !!c;
                                            dispatch({ type: 'SET_MARK_AS_PAID', payload: checked });
                                            if (checked && state.paidAmount === 0) {
                                                dispatch({ type: 'SET_PAID_AMOUNT', payload: grandTotal });
                                            }
                                        }}
                                    />
                                    <span>Already Paid</span>
                                </label>
                            </div>

                            {state.markAsPaid && (
                                <div className="space-y-2 pt-1 border-t border-border/50">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <span className="text-[11px] text-muted-foreground">Paid Amount</span>
                                            <Input
                                                type="number"
                                                value={state.paidAmount || ''}
                                                onChange={(e) =>
                                                    dispatch({ type: 'SET_PAID_AMOUNT', payload: parseFloat(e.target.value) || 0 })
                                                }
                                                placeholder="Paid Amount"
                                                className="h-8 text-xs font-mono"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[11px] text-muted-foreground">Payment Mode</span>
                                            <Select
                                                value={state.paymentMode}
                                                onValueChange={(v) => dispatch({ type: 'SET_PAYMENT_MODE', payload: v as PaymentMode })}
                                            >
                                                <SelectTrigger className="w-full h-8 text-xs">
                                                    <SelectValue placeholder="Select Mode" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="cash">Cash</SelectItem>
                                                    <SelectItem value="upi">UPI</SelectItem>
                                                    <SelectItem value="neft">NEFT / RTGS</SelectItem>
                                                    <SelectItem value="cheque">Cheque</SelectItem>
                                                    <SelectItem value="card">Card</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center pt-2 border-t border-border/40">
                                        <span className="text-muted-foreground font-medium">Balance Due:</span>
                                        <span
                                            className={cn(
                                                'font-mono font-bold',
                                                dueAmount > 0 ? 'text-destructive' : 'text-primary',
                                            )}
                                        >
                                            ₹ {fmt(dueAmount)}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom action footer */}
            <div className="bg-muted px-6 py-4 border-t border-border flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <Info className="size-4 shrink-0" />
                    <span>Stock ledgers &amp; journals posted immediately upon Save &amp; Post.</span>
                </div>
                <div className="flex items-center space-x-2 justify-end">
                    <Button type="button" variant="ghost" size="sm" onClick={() => window.history.back()}>
                        Cancel
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => onSubmit(true)}>
                        Save Draft
                    </Button>
                    <Button type="button" size="sm" onClick={() => onSubmit(false)}>
                        Save &amp; Post
                    </Button>
                </div>
            </div>
        </div>
    );
}

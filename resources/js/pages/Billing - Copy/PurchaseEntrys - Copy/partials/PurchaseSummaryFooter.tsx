'react';

import React, { useState } from 'react';
import { CreditCard, Info, ChevronDown, ChevronUp } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

import SingleImageUploader from '@/components/special/single-image-uploader';

export default function PurchaseSummaryFooter() {
    // --- Static / Pre-calculated Base Values ---
    const subtotal = 125000.00;
    const isInterstate = false; // Toggle to show IGST vs CGST+SGST

    // --- Interactive Form State ---
    const [notes, setNotes] = useState('Received goods in good condition. Reference challan #882.');
    const [additionalDiscount, setAdditionalDiscount] = useState<number>(0);
    const [freightCharges, setFreightCharges] = useState<number>(2500);
    const [autoRoundOff, setAutoRoundOff] = useState<boolean>(true);
    const [markAsPaid, setMarkAsPaid] = useState<boolean>(true);
    const [paidAmount, setPaidAmount] = useState<number>(150000);
    const [paymentMode, setPaymentMode] = useState<string>('neft');
    const [showTaxBreakdown, setShowTaxBreakdown] = useState<boolean>(false);

    // --- Tax Calculations (Standard 18% GST baseline example) ---
    const taxableBase = Math.max(0, subtotal - additionalDiscount + freightCharges);
    const totalTaxRate = 0.18;
    const totalTax = taxableBase * totalTaxRate;

    const cgst = isInterstate ? 0 : totalTax / 2;
    const sgst = isInterstate ? 0 : totalTax / 2;
    const igst = isInterstate ? totalTax : 0;

    // --- Totals & Rounding ---
    const rawGrandTotal = taxableBase + totalTax;
    const roundedGrandTotal = autoRoundOff ? Math.round(rawGrandTotal) : rawGrandTotal;
    const roundOff = roundedGrandTotal - rawGrandTotal;

    const dueAmount = markAsPaid ? Math.max(0, roundedGrandTotal - paidAmount) : roundedGrandTotal;

    return (
        <div className="bg-card rounded-md border border-border overflow-hidden">
            <div className="px-4 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">

                    {/* Left Panel: Remarks & Document Uploads (7 Cols) */}
                    <div className="lg:col-span-2 space-y-2">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-semibold text-muted-foreground">
                                Vendor Purchase Remarks / Notes
                            </label>
                            <Textarea
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                placeholder="e.g. Received goods in good condition. Reference challan #882."
                                className="text-xs resize-none"
                            />
                        </div>

                        {/* Documents Section */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                    <div className="col-span-2"></div>

                    {/* Right Panel: Totals Breakdown & Direct Payment (5 Cols) */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Totals Summary Box */}
                        <div className="bg-muted/30 rounded-lg border border-border p-4 space-y-2 text-xs">

                            {/* Subtotal */}
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Sub Total (Net Base):</span>
                                <span className="font-mono font-semibold text-foreground">
                                    ₹ {subtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>

                            {/* Additional Discount Input */}
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Additional Discount:</span>
                                <div className="flex items-center space-x-1.5">
                                    <span className="text-muted-foreground">- ₹</span>
                                    <Input
                                        type="number"
                                        value={additionalDiscount || ''}
                                        onChange={(e) => setAdditionalDiscount(parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className="w-24 h-7 text-right text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {/* Freight & Shipping Charges Input */}
                            <div className="flex justify-between items-center text-muted-foreground">
                                <span>Freight & Charges:</span>
                                <div className="flex items-center space-x-1.5">
                                    <span className="text-muted-foreground">+ ₹</span>
                                    <Input
                                        type="number"
                                        value={freightCharges || ''}
                                        onChange={(e) => setFreightCharges(parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className="w-24 h-7 text-right text-xs font-mono"
                                    />
                                </div>
                            </div>

                            {/* Evaluated Tax Breakdown Toggle */}
                            <div className="pt-1 border-t border-border/60">
                                <div className="flex justify-between items-center text-muted-foreground">
                                    <button
                                        type="button"
                                        onClick={() => setShowTaxBreakdown(!showTaxBreakdown)}
                                        className="flex items-center space-x-1 text-primary hover:underline font-medium text-xs cursor-pointer focus:outline-none"
                                    >
                                        <span>Evaluated Tax (18% GST):</span>
                                        {showTaxBreakdown ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    </button>
                                    <span className="font-mono font-semibold text-foreground">
                                        ₹ {totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>

                                {/* Expanded Tax Details */}
                                {showTaxBreakdown && (
                                    <div className="mt-2 pl-3 pr-1 py-2 bg-muted/50 rounded border border-border/50 space-y-1.5 text-[11px]">
                                        {!isInterstate ? (
                                            <>
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>Central Tax (CGST @ 9%):</span>
                                                    <span className="font-mono text-foreground">
                                                        ₹ {cgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-muted-foreground">
                                                    <span>State Tax (SGST @ 9%):</span>
                                                    <span className="font-mono text-foreground">
                                                        ₹ {sgst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="flex justify-between text-muted-foreground">
                                                <span>Integrated Tax (IGST @ 18%):</span>
                                                <span className="font-mono text-foreground">
                                                    ₹ {igst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Auto Round Off */}
                            <div className="flex justify-between items-center text-muted-foreground pt-1 border-t border-border/60">
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="auto-roundoff"
                                        checked={autoRoundOff}
                                        onCheckedChange={(checked) => setAutoRoundOff(!!checked)}
                                    />
                                    <label htmlFor="auto-roundoff" className="cursor-pointer select-none">
                                        Auto Round Off
                                    </label>
                                </div>
                                <span className="font-mono text-muted-foreground">
                                    {roundOff >= 0 ? '+' : ''} ₹ {roundOff.toFixed(2)}
                                </span>
                            </div>

                            {/* Grand Total */}
                            <div className="pt-3 border-t-2 border-border flex justify-between items-baseline">
                                <span className="text-sm font-bold text-foreground">Grand Total:</span>
                                <span className="text-xl font-extrabold text-primary font-mono">
                                    ₹ {roundedGrandTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>

                        {/* Direct Payment Widget */}
                        <div className="bg-card rounded-lg border border-border p-3.5 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground flex items-center">
                                    <CreditCard className="w-3.5 h-3.5 mr-1.5 text-primary" />
                                    Record Direct Payment
                                </span>

                                <label className="flex items-center space-x-1.5 text-muted-foreground cursor-pointer select-none">
                                    <Checkbox
                                        checked={markAsPaid}
                                        onCheckedChange={(checked) => {
                                            const isChecked = !!checked;
                                            setMarkAsPaid(isChecked);
                                            if (isChecked && paidAmount === 0) {
                                                setPaidAmount(roundedGrandTotal);
                                            }
                                        }}
                                    />
                                    <span>Already Paid</span>
                                </label>
                            </div>

                            {markAsPaid && (
                                <div className="space-y-2 pt-1 border-t border-border/50">
                                    <div className="grid grid-cols-2 gap-2">
                                        {/* Paid Amount */}
                                        <div className="space-y-1">
                                            <span className="text-[11px] text-muted-foreground">Paid Amount</span>
                                            <Input
                                                type="number"
                                                value={paidAmount || ''}
                                                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                                                placeholder="Paid Amount"
                                                className="h-8 text-xs font-mono"
                                            />
                                        </div>

                                        {/* Payment Mode */}
                                        <div className="space-y-1">
                                            <span className="text-[11px] text-muted-foreground">Payment Mode</span>
                                            <Select value={paymentMode} onValueChange={setPaymentMode}>
                                                <SelectTrigger className="w-full h-8 text-xs">
                                                    <SelectValue placeholder="Select Payment Mode" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="neft">NEFT / RTGS</SelectItem>
                                                    <SelectItem value="upi">Corporate UPI</SelectItem>
                                                    <SelectItem value="cash">Petty Cash</SelectItem>
                                                    <SelectItem value="cheque">Cheque</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Due Amount Readout */}
                                    <div className="flex justify-between items-center pt-2 border-t border-border/40">
                                        <span className="text-muted-foreground font-medium">Balance Due:</span>
                                        <span className={`font-mono font-bold ${dueAmount > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                                            ₹ {dueAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Action Footer */}
            <div className="bg-muted px-6 py-4 border-t border-border flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
                <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                    <Info className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span>Stock ledgers & journals posted immediately upon Save & Print.</span>
                </div>

                <div className="flex items-center space-x-2 justify-end">
                    <Button type="button" variant="ghost" size="sm">
                        Cancel
                    </Button>
                    <Button type="button" variant="outline" size="sm">
                        Save Draft
                    </Button>
                    <Button type="button" size="sm">
                        Save & Print
                    </Button>
                </div>
            </div>
        </div>
    );
}

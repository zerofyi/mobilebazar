import React, { type ReactNode } from "react";
import { ReceiptText, BadgeCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSale, deriveDocument, type PaymentMode, type TaxMovement } from "../sale-context";

const PAYMENT_MODES = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "neft", label: "NEFT" },
    { value: "cheque", label: "Cheque" },
] as const;

function Segmented<T extends string>({
    options, value, onChange, ariaLabel,
}: {
    options: { value: T; label: ReactNode; title?: string }[];
    value: T;
    onChange: (v: T) => void;
    ariaLabel: string;
}) {
    return (
        <div className="flex rounded-md border border-border p-0.5 text-[11px] font-medium" role="group" aria-label={ariaLabel}>
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    title={o.title}
                    onClick={() => onChange(o.value)}
                    aria-pressed={value === o.value}
                    className={cn(
                        "flex-1 rounded px-2 py-1.5 whitespace-nowrap",
                        value === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/**
 * Invoice meta card (right column, above the bill summary).
 * Mirrors the invoices table: invoice number, date, document type,
 * tax movement, payment mode, notes.
 * Party selection lives in PartyStrip; the wholesale + GST-bill toggles
 * live in the header — this card is invoice-only.
 */
export default function InvoiceMeta() {
    const { state, dispatch, computedLines } = useSale();

    const hasMargin = computedLines.some((l) => l._margin);
    const doc = deriveDocument(state.isGstBilled, state.party?.gstin ?? null, hasMargin);

    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice</h2>
                <span className="font-mono text-xs text-muted-foreground">{state.invoiceNumber}</span>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="text-[11px]">
                    <ReceiptText className="size-3 mr-1" />
                    {doc.label}
                </Badge>
                <Badge variant="outline" className="text-[10px]">{doc.buyerKind}</Badge>
                {doc.itcEligible && (
                    <Badge variant="outline" className="gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
                        <BadgeCheck className="size-3" /> ITC eligible
                    </Badge>
                )}
                {doc.hideTax && (
                    <Badge variant="outline" className="text-[10px] text-amber-700 dark:text-amber-400">
                        Tax incl. in price
                    </Badge>
                )}
            </div>

            <div className="space-y-3">
                <div>
                    <Label htmlFor="invoice-date" className="mb-1 block text-xs text-muted-foreground">Invoice date</Label>
                    <Input
                        id="invoice-date"
                        type="date"
                        value={state.invoiceDate}
                        onChange={(e) => dispatch({ type: "SET_INVOICE_DATE", payload: e.target.value })}
                        className="h-9 text-sm"
                    />
                </div>

                {state.isGstBilled && (
                    <div>
                        <Label className="mb-1 block text-xs text-muted-foreground">Tax movement</Label>
                        <Segmented<TaxMovement>
                            ariaLabel="Tax movement"
                            value={state.taxMovement}
                            onChange={(m) => dispatch({ type: "SET_TAX_MOVEMENT", payload: m })}
                            options={[
                                { value: "intra", label: "CGST + SGST", title: "Intra-state sale" },
                                { value: "inter", label: "IGST", title: "Inter-state sale" },
                            ]}
                        />
                    </div>
                )}

                <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">Payment mode</Label>
                    <div className="grid grid-cols-6 gap-1" role="group" aria-label="Payment mode">
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
                </div>

                <div>
                    <Label htmlFor="invoice-notes" className="mb-1 block text-xs text-muted-foreground">Notes</Label>
                    <Textarea
                        id="invoice-notes"
                        value={state.notes}
                        onChange={(e) => dispatch({ type: "SET_NOTES", payload: e.target.value })}
                        placeholder="Notes (optional)"
                        rows={1}
                        className="min-h-8 text-xs"
                    />
                </div>
            </div>
        </div>
    );
}

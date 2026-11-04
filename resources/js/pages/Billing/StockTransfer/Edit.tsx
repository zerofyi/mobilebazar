import { useEffect, useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { toast } from "sonner";
import { ArrowLeftRight, Lock } from "lucide-react";
import { dashboard } from "@/routes";
import {
    SaleProvider,
    useSale,
    buildSalePayload,
    round2,
    generateUuid,
    type StoreInfo,
    type CartLine,
    type SaleState,
} from "../SaleEntry/sale-context";
import SaleHeader from "../SaleEntry/partials/SaleHeader";
import CartTable from "../SaleEntry/partials/CartTable";
import InvoiceMeta from "../SaleEntry/partials/InvoiceMeta";
import SaleTotals from "../SaleEntry/partials/SaleTotals";
import SecurityPinModal from "@/components/SecurityPinModal";
import { useFlashToast } from "@/hooks/use-flash-toast";

/* ─── Types (mirror StockTransferController::serializeInvoiceForEdit) ─── */

interface EditLine extends Omit<CartLine, "key"> {}

interface EditInvoice {
    uuid: string;
    invoice_number: string;
    invoice_date: string;
    party: { type: "customer" | "supplier"; id: number; name: string; phone: string | null } | null;
    saleMode: "retail" | "wholesale";
    taxMovement: "intra" | "inter";
    isGstBilled: boolean;
    billDiscount: number;
    shippingCharge: number;
    paidAmount: number;
    paidInFull: boolean;
    paymentMode: "cash" | "upi" | "card" | "bank" | "neft" | "cheque";
    payments: Array<{ id: string; mode: string; amount: number; reference?: string; purchase_order_id?: number }>;
    notes: string;
    lines: EditLine[];
}

interface Props {
    store: StoreInfo;
    transfer: {
        uuid: string;
        transfer_number: string;
        to_store: { id: number; name: string; code: string | null } | null;
    };
    invoice: EditInvoice;
}

function inr(n: number) {
    return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * "Paid in full" on a transfer means the settlement tracks the (edited)
 * grand total exactly. The hydrated split rows still hold the ORIGINAL
 * amounts, so before submitting they are re-synced to the new grand:
 * a shortfall is added to the largest split, an excess is trimmed from
 * the largest splits down — modes and references are preserved. The
 * backend re-mirrors exactly these splits onto the target purchase.
 */
function syncSplitsToGrand(
    payments: SaleState["payments"],
    grand: number,
    fallbackMode: SaleState["paymentMode"],
): Array<{ mode: string; amount: number; reference: string | null; purchase_order_id: number | null }> {
    const splits = payments
        .filter((p) => p.mode !== "buyback")
        .map((p) => ({
            mode: p.mode as string,
            amount: round2(Number(p.amount) || 0),
            reference: p.reference?.trim() || null,
            purchase_order_id: p.purchase_order_id ?? null,
        }));
    if (splits.length === 0) {
        return grand > 0.005 ? [{ mode: fallbackMode, amount: round2(grand), reference: null, purchase_order_id: null }] : [];
    }
    const total = round2(splits.reduce((s, p) => s + p.amount, 0));
    const delta = round2(grand - total);
    if (Math.abs(delta) <= 0.005) return splits;
    if (delta > 0) {
        let idx = 0;
        splits.forEach((p, i) => {
            if (p.amount > splits[idx].amount) idx = i;
        });
        splits[idx] = { ...splits[idx], amount: round2(splits[idx].amount + delta) };
        return splits;
    }
    let remaining = -delta;
    const order = splits.map((_, i) => i).sort((a, b) => splits[b].amount - splits[a].amount);
    for (const i of order) {
        if (remaining <= 0.005) break;
        const cut = Math.min(splits[i].amount, remaining);
        splits[i] = { ...splits[i], amount: round2(splits[i].amount - cut) };
        remaining = round2(remaining - cut);
    }
    return splits.filter((p) => p.amount > 0.005);
}

function buildHydratedState(store: StoreInfo, invoice: EditInvoice): SaleState {
    return {
        store,
        // Fresh key per edit session — retries reuse it, a saved edit gets a new one.
        idempotencyKey: generateUuid(),
        lines: invoice.lines.map((l, i) => ({ ...l, key: `edit-${i}` }) as CartLine),
        party: invoice.party
            ? { type: invoice.party.type, id: invoice.party.id, name: invoice.party.name, phone: invoice.party.phone, gstin: null }
            : null,
        saleMode: invoice.saleMode,
        taxMovement: invoice.taxMovement,
        isGstBilled: invoice.isGstBilled,
        invoiceNumber: invoice.invoice_number,
        // Immutable on edit — the documents stay in their original month.
        invoiceDate: invoice.invoice_date,
        billDiscount: invoice.billDiscount,
        shippingCharge: invoice.shippingCharge,
        // Transfers never carry round-off: the purchase in the target store
        // must total exactly the same as the sale.
        autoRoundOff: false,
        roundOffManual: 0,
        paidAmount: invoice.paidAmount,
        paidInFull: invoice.paidInFull,
        paymentMode: invoice.paymentMode,
        payments: (invoice.payments ?? []).map((p) => ({
            id: p.id,
            mode: p.mode as any,
            amount: Number(p.amount) || 0,
            reference: p.reference,
            purchase_order_id: p.purchase_order_id,
            locked: p.mode === "buyback",
        })),
        notes: invoice.notes,
    };
}

function TransferEditInner({ transfer, invoice }: { transfer: Props["transfer"]; invoice: EditInvoice }) {
    useFlashToast();
    const {
        state, dispatch, store, computedLines,
        subtotal, taxAmount, roundOff, grandTotal, dueAmount,
    } = useSale();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    const originalState = useMemo(() => buildHydratedState(store, invoice), [store, invoice]);

    useEffect(() => {
        dispatch({ type: "HYDRATE", payload: originalState });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const errors = useMemo(() => {
        const list: string[] = [];
        if (computedLines.length === 0) {
            list.push("Keep at least one item in the transfer. To take an item back, remove its line — but one item must remain.");
        }
        computedLines.forEach((l, i) => {
            const label = l.product_name || `Line ${i + 1}`;
            if (l.qty < 1) list.push(`${label}: qty must be at least 1.`);
            if (l.unit_price <= 0) list.push(`${label}: price must be greater than 0.`);
            if (l.discount_amount > l.unit_price * l.qty) list.push(`${label}: line discount exceeds line value.`);
            if (l.is_serialized) {
                if (l.unit_ids.length !== l.qty) list.push(`${label}: pick ${l.qty} unit(s) — ${l.unit_ids.length} selected.`);
                if (l.unit_ids.length === 0) list.push(`${label}: no unit selected.`);
            }
        });
        if (state.billDiscount < 0) list.push("Bill discount cannot be negative.");
        if (state.billDiscount > subtotal + taxAmount + state.shippingCharge + 0.01) list.push("Bill discount exceeds transfer value.");
        if (state.shippingCharge < 0) list.push("Shipping charge cannot be negative.");
        if (Math.abs(roundOff) > 0.005) list.push("Round-off must stay 0 on a transfer so both stores' books match exactly.");
        // Effective paid, same rule as the payload builder: "paid in full"
        // tracks the grand total; otherwise split rows win over the manual
        // field. (Checking the raw manual field here dead-ended the form:
        // it still holds the ORIGINAL paid amount after a line is removed.)
        const splitsTotal = state.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
        const effectivePaid = state.paidInFull
            ? grandTotal
            : state.payments.length > 0
              ? round2(splitsTotal)
              : round2(Math.max(0, state.paidAmount));
        if (effectivePaid < 0) list.push("Paid amount cannot be negative.");
        if (effectivePaid > grandTotal + 0.01) {
            list.push(
                `Payments total ${inr(effectivePaid)} but the transfer is now ${inr(grandTotal)} — reduce a payment split by ${inr(round2(effectivePaid - grandTotal))}.`,
            );
        }
        return list;
    }, [state, computedLines, subtotal, taxAmount, roundOff, grandTotal]);

    const isValid = errors.length === 0;

    const handleReset = () => {
        dispatch({ type: "HYDRATE", payload: buildHydratedState(store, invoice) });
        toast.info("Reverted to the posted transfer.");
    };

    const handleSubmit = () => {
        setTriedSubmit(true);
        if (isSubmitting) return;
        if (!isValid) {
            document.getElementById("sale-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setPinError(null);
        setPinOpen(true);
    };

    const confirmSubmit = (securityPin: string) => {
        setIsSubmitting(true);
        const payload = buildSalePayload(state, computedLines, subtotal, taxAmount, roundOff, grandTotal, dueAmount);
        payload.subtotal = round2(payload.subtotal);
        payload.tax_amount = round2(payload.tax_amount);
        payload.grand_total = round2(payload.grand_total);
        payload.round_off = 0;
        if (state.paidInFull) {
            // buildSalePayload sets paid_amount = grand total but copies the
            // split rows verbatim (still the ORIGINAL amounts) — the server
            // then rejects "splits total ≠ paid amount" after any price
            // change. Re-sync the splits to the new grand so both agree.
            payload.payments = syncSplitsToGrand(state.payments, round2(grandTotal), state.paymentMode);
            payload.paid_amount = round2(grandTotal);
            payload.due_amount = 0;
            payload.payment_status = "paid";
        }

        router.put(`/app/transfers/${transfer.uuid}`, { ...payload, security_pin: securityPin } as unknown as Parameters<typeof router.put>[1], {
            preserveScroll: true,
            onError: (errs) => {
                if (errs.security_pin) {
                    setPinError(errs.security_pin as string);
                    setPinOpen(true);
                }
            },
            onFinish: () => setIsSubmitting(false),
            onSuccess: () => setPinOpen(false),
        });
    };

    return (
        <>
            <Head title={`Edit Transfer ${transfer.transfer_number}`} />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <SaleHeader onPark={() => {}} onClear={handleReset} isSubmitting={isSubmitting} hidePark clearLabel="Reset" />
                <div className="mx-auto px-4 py-4 pb-8 lg:px-6">
                    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs text-primary flex items-center gap-2">
                        <ArrowLeftRight className="size-4 shrink-0" />
                        <span>
                            Editing transfer <strong className="font-mono">{transfer.transfer_number}</strong> — sale{" "}
                            <span className="font-mono font-semibold">{invoice.invoice_number}</span> dated {invoice.invoice_date}.
                            Change prices, or remove a line to take that item back into this store. Saving re-posts the
                            sale here <strong>and</strong> the matching purchase in {transfer.to_store?.name ?? "the target store"} —
                            both documents keep their numbers, revisions bump. New items cannot be added; create a new
                            transfer for those.
                        </span>
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
                        <div className="flex min-w-0 flex-col gap-4">
                            <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
                                <Lock className="size-4 text-muted-foreground" />
                                <span className="text-muted-foreground">Target store:</span>
                                <span className="font-medium">
                                    {transfer.to_store?.name ?? invoice.party?.name ?? "—"}
                                    {transfer.to_store?.code ? ` (${transfer.to_store.code})` : ""}
                                </span>
                                <span className="text-xs text-muted-foreground">— fixed for this transfer</span>
                            </div>
                            <CartTable />
                        </div>
                        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
                            <InvoiceMeta lockDate />
                            <SaleTotals
                                onSubmit={handleSubmit}
                                onPark={() => {}}
                                isSubmitting={isSubmitting}
                                errors={errors}
                                isValid={isValid}
                                triedSubmit={triedSubmit}
                            />
                        </div>
                    </div>
                </div>
            </div>

            <SecurityPinModal
                open={pinOpen}
                onOpenChange={setPinOpen}
                onConfirm={confirmSubmit}
                title="Confirm transfer edit"
                description={`Enter the store's 6-digit security PIN to save changes to transfer ${transfer.transfer_number} (₹${grandTotal.toLocaleString("en-IN")}) — the sale here and the purchase in ${transfer.to_store?.name ?? "the target store"} are updated together.`}
                error={pinError}
                verifying={isSubmitting}
                confirmLabel="Save changes"
            />
        </>
    );
}

export default function Edit({ store, transfer, invoice }: Props) {
    return (
        <>
            <Head title={`Edit Transfer — ${store.name}`} />
            <SaleProvider store={store} initialInvoiceNumber={invoice.invoice_number}>
                <TransferEditInner transfer={transfer} invoice={invoice} />
            </SaleProvider>
        </>
    );
}

Edit.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Stock Transfers", href: "/app/transfers" },
        { title: "Edit Transfer", href: "#" },
    ],
};

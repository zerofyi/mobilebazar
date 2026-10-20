import { useEffect, useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { toast } from "sonner";
import SaleHeader from "./partials/SaleHeader";
import PosSearchBar from "./partials/PosSearchBar";
import CartTable from "./partials/CartTable";
import PartyStrip from "./partials/PartyStrip";
import InvoiceMeta from "./partials/InvoiceMeta";
import SaleTotals from "./partials/SaleTotals";
import SecurityPinModal from "@/components/SecurityPinModal";
import { dashboard } from "@/routes";
import {
    SaleProvider, useSale, buildSalePayload, round2, generateUuid,
    type StoreInfo, type CategoryOption, type CartLine, type SaleState,
} from "./sale-context";
import { useFlashToast } from "@/hooks/use-flash-toast";

// ─── Types (mirror SaleEntryController::serializeForEdit) ────────────────────

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

interface SaleEditProps {
    store: StoreInfo;
    categories: CategoryOption[];
    invoice: EditInvoice;
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
        // Immutable on edit — the sale stays in its original month.
        invoiceDate: invoice.invoice_date,
        billDiscount: invoice.billDiscount,
        shippingCharge: invoice.shippingCharge,
        autoRoundOff: true,
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

function SaleEditInner({ invoice }: { invoice: EditInvoice }) {
    const {
        state, dispatch, store, computedLines,
        subtotal, taxAmount, roundOff, grandTotal, dueAmount,
    } = useSale();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    const originalState = useMemo(() => buildHydratedState(store, invoice), [store, invoice]);

    // Hydrate the POS with the posted sale on mount.
    useEffect(() => {
        dispatch({ type: "HYDRATE", payload: originalState });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── Single shared validation gate (mirrors create) ───────────────────────
    const errors = useMemo(() => {
        const list: string[] = [];
        if (!state.party) list.push("Select a customer or party for this sale.");
        if (computedLines.length === 0) list.push("Add at least one item to the cart.");
        if (!state.invoiceNumber.trim()) list.push("Invoice number is missing.");

        computedLines.forEach((l, i) => {
            const label = l.product_name || `Line ${i + 1}`;
            if (l.product_variant_id == null && !l.manual_item_name) list.push(`${label}: pick a product or add it as a manual item.`);
            if (l.qty < 1) list.push(`${label}: qty must be at least 1.`);
            if (l.unit_price <= 0) list.push(`${label}: price must be greater than 0.`);
            if (state.saleMode === "retail" && l.min_selling_price > 0 && l.unit_price < l.min_selling_price) {
                list.push(`${label}: price ₹${l.unit_price} is below minimum ₹${l.min_selling_price}.`);
            }
            if (l.discount_amount > l.unit_price * l.qty) list.push(`${label}: line discount exceeds line value.`);
            if (l.is_serialized) {
                if (l.unit_ids.length !== l.qty) list.push(`${label}: pick ${l.qty} unit(s) — ${l.unit_ids.length} selected.`);
                if (l.unit_ids.length === 0) list.push(`${label}: scan or pick a unit (IMEI/serial).`);
            }
        });

        if (state.billDiscount < 0) list.push("Bill discount cannot be negative.");
        if (state.billDiscount > subtotal + taxAmount + state.shippingCharge + 0.01) list.push("Bill discount exceeds invoice value.");
        if (state.shippingCharge < 0) list.push("Shipping charge cannot be negative.");
        if (state.paidAmount < 0) list.push("Paid amount cannot be negative.");
        if (state.paidAmount > grandTotal + 0.01) list.push("Paid amount cannot exceed grand total.");
        return list;
    }, [state, computedLines, subtotal, taxAmount, grandTotal]);

    const isValid = errors.length === 0;

    const handleReset = () => {
        dispatch({ type: "HYDRATE", payload: buildHydratedState(store, invoice) });
        toast.info("Reverted to the posted sale.");
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

        router.put(`/app/sales/${invoice.uuid}`, { ...payload, security_pin: securityPin } as unknown as Parameters<typeof router.put>[1], {
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
            <Head title={`Edit Sale ${invoice.invoice_number}`} />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <SaleHeader onPark={() => {}} onClear={handleReset} isSubmitting={isSubmitting} hidePark clearLabel="Reset" />
                <div className="mx-auto px-4 py-4 pb-8 lg:px-6">
                    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-700 dark:text-amber-400">
                        Editing <span className="font-mono font-semibold">{invoice.invoice_number}</span> dated {invoice.invoice_date}.
                        Saving reverses the original posting and re-posts — removed items return to stock, the invoice number stays the same.
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
                        <div className="flex min-w-0 flex-col gap-4">
                            <PartyStrip />
                            <PosSearchBar />
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
                title="Confirm sale edit"
                description={`Enter the store's 6-digit security PIN to save changes to ${invoice.invoice_number}.`}
                error={pinError}
                verifying={isSubmitting}
                confirmLabel="Save changes"
            />
        </>
    );
}

export default function SaleEdit({ store, categories, invoice }: SaleEditProps) {
    useFlashToast();
    void categories;

    return (
        <>
            <Head title={`Edit Sale — ${store.name}`} />
            <SaleProvider store={store} initialInvoiceNumber={invoice.invoice_number}>
                <SaleEditInner invoice={invoice} />
            </SaleProvider>
        </>
    );
}

SaleEdit.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Sales", href: "/app/sales" },
        { title: "Edit", href: "#" },
    ],
};

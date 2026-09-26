import { useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import PurchaseHeader from "./partials/PurchaseHeader";
import VendorAndDocMeta from "./partials/VendorAndDocMeta";
import LineItemTable from "./partials/LineItemTable";
import PurchaseSummaryFooter from "./partials/PurchaseSummaryFooter";
import { Separator } from "@/components/ui/separator";
import { DeviceConditionOption, PurchaseProvider, StoreInfo, groupRowsForSubmit, usePurchase } from "./purchase-context";

interface PurchaseEntryProps {
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
    initialPoNumber: string;
}

function PurchaseEntryInner() {
    const { state, flags, vendorIsRegistered, hasParty, subtotal, totalTax, grandTotal, dueAmount } = usePurchase();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    const errors = useMemo(() => {
        const list: string[] = [];
        if (!state.selectedParty) list.push("Select a customer or supplier above.");
        if (state.rows.length === 0) list.push("Add at least one line item.");
        if (!state.poNumber.trim()) list.push("Purchase number is missing.");

        const seen = new Set<string>();
        state.rows.forEach((r, i) => {
            const label = `Row ${i + 1}`;
            const hasProduct = r.product_variant_id != null || r.name.trim() !== "" || r.manual_item_name.trim() !== "";
            if (!hasProduct) list.push(`${label}: pick a product or enter an off-catalog name.`);
            if (r.cost <= 0) list.push(`${label}: cost must be greater than 0.`);
            if (r.qty < 1) list.push(`${label}: qty must be at least 1.`);
            if (r.is_serialized) {
                if (r.imei1.trim() === "" && r.serial.trim() === "") list.push(`${label}: serialized item needs IMEI 1 or Serial.`);
                const keys = [
                    r.imei1.trim() && `imei1:${r.imei1.trim()}`,
                    r.imei2.trim() && `imei2:${r.imei2.trim()}`,
                    r.serial.trim() && `serial:${r.serial.trim()}`,
                ].filter(Boolean) as string[];
                for (const k of keys) {
                    if (seen.has(k)) list.push(`${label}: duplicate ${k.split(":")[0]} in this purchase.`);
                    seen.add(k);
                }
            }
            if (r.selling > 0 && r.selling < r.cost) list.push(`${label}: selling price is below cost.`);
        });

        if (state.markAsPaid) {
            if (state.paidAmount < 0) list.push("Paid amount cannot be negative.");
            if (state.paidAmount > grandTotal + 0.01) list.push("Paid amount cannot exceed grand total.");
        }
        if (state.additionalDiscount < 0) list.push("Additional discount cannot be negative.");
        if (state.additionalDiscount > subtotal + totalTax) list.push("Additional discount exceeds invoice value.");
        return list;
    }, [state, grandTotal, subtotal, totalTax]);

    const isValid = errors.length === 0;

    const handleSubmit = (isDraft: boolean) => {
        setTriedSubmit(true);
        if (isSubmitting) return;
        if (!isDraft && !isValid) {
            document.getElementById("purchase-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setIsSubmitting(true);

        const lines = groupRowsForSubmit(state.rows, flags, vendorIsRegistered, hasParty);
        const paymentStatus: string = isDraft ? "draft" : state.markAsPaid ? dueAmount <= 0.009 ? "paid" : state.paidAmount > 0 ? "partial" : "unpaid" : "unpaid";

        // Ensure UUID is lowercased and valid RFC 4122 standard
        const generateUuid = (): string => {
            if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
                return crypto.randomUUID().toLowerCase();
            }
            // Fallback RFC4122 v4 generator
            return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === "x" ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        };

        // Mapped exact keys to match the backend validation rules
        const payload = {
            idempotency_key: generateUuid(),
            po_number: state.poNumber,
            vendor_invoice_no: state.vendorInvoiceNo || null,
            order_date: state.orderDate,

            // Aligned to new polymorphic service
            party_type: state.partyType,
            party_id: state.selectedParty?.id ?? null,

            bill_type: flags.billType,
            is_gst_billed: flags.isGstBilled,
            is_intra_state: state.taxMovement === "intra",

            subtotal: Math.round(subtotal * 100) / 100,
            tax_amount: Math.round(totalTax * 100) / 100,
            discount_amount: state.additionalDiscount,
            shipping_charge: state.freightCharges,
            grand_total: Math.round(grandTotal * 100) / 100,

            paid_amount: state.markAsPaid ? state.paidAmount : 0,
            due_amount: Math.round(dueAmount * 100) / 100,

            payment_status: paymentStatus,
            payment_mode: state.paymentMode,
            notes: state.notes || null,
            invoice_document_path: state.invoiceDocumentPath,
            additional_document_path: state.additionalDocumentPath,
            is_draft: isDraft,
            type: "direct",

            // Grouped lines payload
            lines: lines,
        };

        router.post("/app/purchases", payload as unknown as Parameters<typeof router.post>[1], {
            preserveScroll: true,
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <>
            <Head title="Purchase Entry" />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <PurchaseHeader onSubmit={handleSubmit} isSubmitting={isSubmitting} />
                <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl px-6 py-4">
                    <div className="bg-card pt-4 border rounded-md border-border text-sm">
                        <VendorAndDocMeta />
                        <Separator className="mt-6" />
                        <LineItemTable />
                        <PurchaseSummaryFooter onSubmit={handleSubmit} isSubmitting={isSubmitting} triedSubmit={triedSubmit} errors={errors} isValid={isValid} />
                    </div>
                </div>
            </div>
        </>
    );
}

export default function PurchaseEntry({ store, deviceConditions, initialPoNumber }: PurchaseEntryProps) {
    return (
        <>
            <Head title={`Purchase Entry — ${store.name}`} />
            <PurchaseProvider store={store} deviceConditions={deviceConditions} initialPoNumber={initialPoNumber}>
                <PurchaseEntryInner />
            </PurchaseProvider>
        </>
    );
}

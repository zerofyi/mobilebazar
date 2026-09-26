import { useState } from "react";
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
    const { state, flags, vendorIsRegistered, subtotal, totalTax, grandTotal, dueAmount } = usePurchase();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    const handleSubmit = (isDraft: boolean) => {
        setTriedSubmit(true);
        if (isSubmitting) return;
        setIsSubmitting(true);

        const lines = groupRowsForSubmit(state.rows, flags, vendorIsRegistered);
        const paymentStatus: string = isDraft ? "draft" : state.markAsPaid ? dueAmount <= 0.009 ? "paid" : state.paidAmount > 0 ? "partial" : "unpaid" : "unpaid";

        const payload = {
            po_number: state.poNumber,
            vendor_invoice_no: state.vendorInvoiceNo || null,
            order_date: state.orderDate,
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
            lines,
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
                <PurchaseHeader onSubmit={handleSubmit} isSubmitting={isSubmitting} triedSubmit={triedSubmit} />
                <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl px-6 py-4">
                    <div className="bg-card pt-4 border rounded-md border-border text-sm">
                        <VendorAndDocMeta />
                        <Separator className="mt-6" />
                        <LineItemTable />
                        <PurchaseSummaryFooter onSubmit={handleSubmit} isSubmitting={isSubmitting} triedSubmit={triedSubmit} />
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

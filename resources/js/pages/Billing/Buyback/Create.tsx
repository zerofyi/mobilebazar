import { useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { ArrowLeftRight } from "lucide-react";
import { dashboard } from "@/routes";
import {
    SaleProvider,
    useSale,
    buildSalePayload,
} from "../SaleEntry/sale-context";
import SaleHeader from "../SaleEntry/partials/SaleHeader";
import PartyStrip from "../SaleEntry/partials/PartyStrip";
import PosSearchBar from "../SaleEntry/partials/PosSearchBar";
import CartTable from "../SaleEntry/partials/CartTable";
import InvoiceMeta from "../SaleEntry/partials/InvoiceMeta";
import SaleTotals from "../SaleEntry/partials/SaleTotals";
import BuybackPanel, { type BuybackForm } from "./BuybackPanel";
import SecurityPinModal from "@/components/SecurityPinModal";
import { useFlashToast } from "@/hooks/use-flash-toast";

function BuybackInner({ store }: { store: any }) {
    useFlashToast();
    const { state, computedLines, subtotal, taxAmount, roundOff, grandTotal, dueAmount, paidAmount, lineCount } = useSale();
    const [buyback, setBuyback] = useState<BuybackForm>({
        product_variant_id: null,
        manual_item_name: "",
        imei1: "",
        imei2: "",
        serial_number: "",
        device_condition: "GOOD",
        agreed_value: 0,
        notes: "",
    });
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    const errors = useMemo(() => {
        const errs: string[] = [];
        if (lineCount === 0) errs.push("Add at least one item to sell.");
        if (!state.party) errs.push("Select the customer.");
        else if (state.party.type !== "customer") errs.push("Buyback requires a customer, not a supplier.");
        if (buyback.agreed_value <= 0) errs.push("Enter the agreed buyback value for the old device.");
        if (!buyback.product_variant_id && !buyback.manual_item_name.trim()) {
            errs.push("Identify the old device (catalog search or manual name).");
        }
        if (buyback.agreed_value - grandTotal > 0.011) {
            errs.push("Buyback value cannot exceed the sale total.");
        }
        if (paidAmount - grandTotal > 0.011) errs.push("Paid amount cannot exceed the grand total.");
        return errs;
    }, [lineCount, state.party, buyback, grandTotal, paidAmount]);

    const isValid = errors.length === 0;

    const handleSubmit = () => {
        setTriedSubmit(true);
        if (isSubmitting || !isValid) {
            document.getElementById("sale-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setPinError(null);
        setPinOpen(true);
    };

    const confirmSubmit = (securityPin: string) => {
        setIsSubmitting(true);
        try {
            const salePayload = buildSalePayload(state, computedLines, subtotal, taxAmount, roundOff, grandTotal, dueAmount);
            const payload = {
                ...salePayload,
                security_pin: securityPin,
                buyback: {
                    customer_id: state.party!.id,
                    product_variant_id: buyback.product_variant_id,
                    manual_item_name: buyback.manual_item_name.trim() || undefined,
                    imei1: buyback.imei1.trim() || undefined,
                    imei2: buyback.imei2.trim() || undefined,
                    serial_number: buyback.serial_number.trim() || undefined,
                    device_condition: buyback.device_condition,
                    agreed_value: buyback.agreed_value,
                    notes: buyback.notes.trim() || undefined,
                },
            };
            router.post(
                "/app/buyback",
                payload as unknown as Parameters<typeof router.post>[1],
                {
                    onError: (errs) => {
                        if (errs.security_pin) {
                            setPinError(errs.security_pin as string);
                            setPinOpen(true);
                        }
                    },
                    onFinish: () => setIsSubmitting(false),
                    onSuccess: () => setPinOpen(false),
                }
            );
        } catch (e: any) {
            setIsSubmitting(false);
            setPinError(e.message ?? "Could not build the buyback payload.");
            setPinOpen(true);
        }
    };

    return (
        <>
            <Head title={`Buyback — ${store.name}`} />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <SaleHeader
                    onPark={() => {}}
                    onClear={() => window.location.reload()}
                    isSubmitting={isSubmitting}
                    hidePark
                    clearLabel="Reset"
                />
                <div className="mx-auto px-4 py-4 pb-8 lg:px-6">
                    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5 text-xs text-primary flex items-center gap-2">
                        <ArrowLeftRight className="size-4" />
                        Buyback: the customer's old device is purchased into stock and its agreed value adjusts this sale —
                        one atomic transaction, one bill each side.
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
                        <div className="flex min-w-0 flex-col gap-4">
                            <PartyStrip />
                            <BuybackPanel value={buyback} onChange={setBuyback} />
                            <PosSearchBar />
                            <CartTable />
                        </div>
                        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-20">
                            <InvoiceMeta />
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
                onOpenChange={(o) => !o && setPinOpen(false)}
                onConfirm={confirmSubmit}
                title="Confirm buyback"
                description={`Enter the store's 6-digit security PIN to complete this buyback (sale ₹${grandTotal.toLocaleString("en-IN")} − buyback ₹${buyback.agreed_value.toLocaleString("en-IN")}).`}
                error={pinError}
                verifying={isSubmitting}
                confirmLabel="Complete buyback"
            />
        </>
    );
}

export default function Create({ store }: { store: { id: number; code: string; name: string; gstin: string | null; is_gst_registered: boolean; state_code: string | null } }) {
    return (
        <SaleProvider store={store} initialInvoiceNumber={"BB-" + Date.now().toString(36).toUpperCase()}>
            <BuybackInner store={store} />
        </SaleProvider>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Buyback", href: "#" },
    ],
};

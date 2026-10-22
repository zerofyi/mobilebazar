import { useEffect, useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { ArrowLeftRight } from "lucide-react";
import { dashboard } from "@/routes";
import {
    SaleProvider,
    useSale,
    buildSalePayload,
    type StoreInfo,
} from "../SaleEntry/sale-context";
import SaleHeader from "../SaleEntry/partials/SaleHeader";
import PosSearchBar from "../SaleEntry/partials/PosSearchBar";
import CartTable from "../SaleEntry/partials/CartTable";
import InvoiceMeta from "../SaleEntry/partials/InvoiceMeta";
import SaleTotals from "../SaleEntry/partials/SaleTotals";
import TransferPartyPicker, { type AttachedSupplier } from "./TransferPartyPicker";
import SecurityPinModal from "@/components/SecurityPinModal";
import { useFlashToast } from "@/hooks/use-flash-toast";

interface Props {
    store: StoreInfo;
    attachedSuppliers: AttachedSupplier[];
    initialInvoiceNumber: string;
}

function TransferInner({ store, attachedSuppliers }: { store: StoreInfo; attachedSuppliers: AttachedSupplier[] }) {
    useFlashToast();
    const { state, dispatch, computedLines, subtotal, taxAmount, roundOff, grandTotal, dueAmount, paidAmount, lineCount } = useSale();
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    // A transfer is a wholesale movement by default, and round-off stays 0
    // so the mirrored purchase in the target store totals exactly the same.
    useEffect(() => {
        dispatch({ type: "SET_SALE_MODE", payload: { mode: "wholesale" } });
        dispatch({ type: "SET_ROUND_OFF", payload: { auto: false, manual: 0 } });
        // Mount-only defaults.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const errors = useMemo(() => {
        const errs: string[] = [];
        if (lineCount === 0) errs.push("Add at least one stock item to transfer.");
        if (!state.party) errs.push("Select the target store.");
        else if (state.party.type !== "supplier") errs.push("The transfer party must be a supplier with a store attached.");
        if (Math.abs(roundOff) > 0.005) {
            errs.push("Round-off must stay 0 on a transfer — turn off auto round-off so both stores' books match exactly.");
        }
        if (state.lines.some((l) => l.product_variant_id == null && l.unit_ids.length === 0 && !l.preferred_batch_id)) {
            errs.push("Manual items cannot be transferred — remove them; only stock items move between stores.");
        }
        if (paidAmount - grandTotal > 0.011) errs.push("Paid amount cannot exceed the grand total.");
        return errs;
    }, [lineCount, state.party, state.lines, roundOff, paidAmount, grandTotal]);

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
            const payload = { ...salePayload, security_pin: securityPin };
            router.post(
                "/app/transfers",
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
            setPinError(e.message ?? "Could not build the transfer payload.");
            setPinOpen(true);
        }
    };

    const targetName =
        attachedSuppliers.find((s) => s.id === state.party?.id)?.linked_store?.name ?? "the target store";

    return (
        <>
            <Head title={`Stock Transfer — ${store.name}`} />
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
                        Stock transfer: this posts a <strong>sale</strong> in {store.name} and the matching
                        <strong> purchase</strong> in {targetName} — one atomic transaction, and the payment
                        you record here settles both sides together.
                    </div>
                    <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
                        <div className="flex min-w-0 flex-col gap-4">
                            <TransferPartyPicker suppliers={attachedSuppliers} />
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
                title="Confirm stock transfer"
                description={`Enter the store's 6-digit security PIN to complete this transfer of ₹${grandTotal.toLocaleString("en-IN")} to ${targetName} (sale here + purchase there).`}
                error={pinError}
                verifying={isSubmitting}
                confirmLabel="Complete transfer"
            />
        </>
    );
}

export default function Create({ store, attachedSuppliers, initialInvoiceNumber }: Props) {
    return (
        <SaleProvider store={store} initialInvoiceNumber={initialInvoiceNumber}>
            <TransferInner store={store} attachedSuppliers={attachedSuppliers} />
        </SaleProvider>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Stock Transfer", href: "/app/transfers" },
        { title: "New Transfer", href: "#" },
    ],
};

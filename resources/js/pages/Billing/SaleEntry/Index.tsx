import { useEffect, useMemo, useState } from "react";
import { Head, router } from "@inertiajs/react";
import { toast } from "sonner";
import SaleHeader from "./partials/SaleHeader";
import PosSearchBar from "./partials/PosSearchBar";
import CartTable from "./partials/CartTable";
import PartyStrip from "./partials/PartyStrip";
import SaleTotals from "./partials/SaleTotals";
import {
    SaleProvider, useSale, buildSalePayload, round2,
    type StoreInfo, type CategoryOption, type StockSearchResult,
} from "./sale-context";
import { useFlashToast } from "@/hooks/use-flash-toast";

interface SaleEntryProps {
    store: StoreInfo;
    categories: CategoryOption[];
    initialInvoiceNumber: string;
    initialProducts: StockSearchResult[];
}

const PARK_PREFIX = "pos-park-";

function parkKey(storeId: number): string {
    return `${PARK_PREFIX}${storeId}`;
}

function SaleEntryInner({ initialProducts }: { initialProducts: StockSearchResult[] }) {
    const {
        state, dispatch, store, computedLines,
        subtotal, taxAmount, roundOff, grandTotal, dueAmount,
    } = useSale();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);

    // ── Single shared validation gate ────────────────────────────────────────
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
            // Minimum-price floor applies to retail mode only. Wholesale prices
            // come from the wholesale price list itself.
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

    // ── Park / restore ───────────────────────────────────────────────────────
    useEffect(() => {
        try {
            const raw = localStorage.getItem(parkKey(store.id));
            if (raw) {
                const saved = JSON.parse(raw);
                dispatch({ type: "HYDRATE", payload: saved });
                toast.info("Parked sale restored.");
            }
        } catch {
            /* corrupted park data — start fresh */
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handlePark = () => {
        try {
            localStorage.setItem(parkKey(store.id), JSON.stringify(state));
            dispatch({ type: "CLEAR" });
            toast.success("Sale parked. Resume anytime from this device.");
        } catch {
            toast.error("Could not park the sale (storage unavailable).");
        }
    };

    const handleClear = () => {
        if (computedLines.length === 0) return;
        dispatch({ type: "CLEAR" });
        toast.info("Cart cleared.");
    };

    // ── Submit ───────────────────────────────────────────────────────────────
    const handleSubmit = () => {
        setTriedSubmit(true);
        if (isSubmitting) return;
        if (!isValid) {
            document.getElementById("sale-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setIsSubmitting(true);

        const payload = buildSalePayload(state, computedLines, subtotal, taxAmount, roundOff, grandTotal, dueAmount);

        // Sanity: payload totals are derived from the same engine as the preview.
        payload.subtotal = round2(payload.subtotal);
        payload.tax_amount = round2(payload.tax_amount);
        payload.grand_total = round2(payload.grand_total);

        // A successful post starts a fresh cart; a parked copy is no longer needed.
        try { localStorage.removeItem(parkKey(store.id)); } catch { /* noop */ }

        router.post("/app/sales", payload as unknown as Parameters<typeof router.post>[1], {
            preserveScroll: true,
            onFinish: () => setIsSubmitting(false),
        });
    };

    return (
        <>
            <Head title="New Sale" />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <SaleHeader onPark={handlePark} onClear={handleClear} isSubmitting={isSubmitting} />
                <div className="mx-auto px-4 py-4 lg:px-6">
                    <div className="flex flex-col gap-4">
                        <PartyStrip />
                        <div className="grid items-start gap-4 lg:grid-cols-[1fr_400px]">
                            <div className="flex min-w-0 flex-col gap-4">
                                <PosSearchBar initialProducts={initialProducts} />
                                <CartTable />
                            </div>
                            <div className="min-w-0 lg:sticky lg:top-20">
                                <SaleTotals
                                    onSubmit={handleSubmit}
                                    onPark={handlePark}
                                    isSubmitting={isSubmitting}
                                    errors={errors}
                                    isValid={isValid}
                                    triedSubmit={triedSubmit}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export default function SaleEntry({ store, categories, initialInvoiceNumber, initialProducts }: SaleEntryProps) {
    useFlashToast();
    void categories;

    return (
        <>
            <Head title={`New Sale — ${store.name}`} />
            <SaleProvider store={store} initialInvoiceNumber={initialInvoiceNumber}>
                <SaleEntryInner initialProducts={initialProducts} />
            </SaleProvider>
        </>
    );
}

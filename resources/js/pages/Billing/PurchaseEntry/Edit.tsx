import { useEffect, useMemo, useRef, useState } from "react";
import { Head, router } from "@inertiajs/react";
import PurchaseHeader from "./partials/PurchaseHeader";
import SecurityPinModal from "@/components/SecurityPinModal";
import VendorAndDocMeta from "./partials/VendorAndDocMeta";
import LineItemTable from "./partials/LineItemTable";
import PurchaseSummaryFooter from "./partials/PurchaseSummaryFooter";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import app from "@/routes/app";
import {
    DeviceConditionOption, LineRow, Party, PaymentMode, PurchaseProvider,
    StoreInfo, WarrantyMode, groupRowsForSubmit, usePurchase,
} from "./purchase-context";

/* ─── Props (serialized by PurchaseEntryController@edit → serializeForEdit) ─── */

interface EditUnit {
    stock_unit_id: number | null; status: string | null;
    imei1: string | null; imei2: string | null; serial_number: string | null;
    device_condition: string | null; overall_health: string | null;
    battery_health_pct: number | null; activation_date: string | null;
    remaining_warranty: string | null;
    warranty_expiry_date: string | null; wholesale_price: number | null;
    selling_price: number | null; base_cost: number; landed_cost: number;
    is_margin_scheme: boolean;
}

interface EditBatch {
    stock_batch_id: number | null; batch_number: string | null; received_qty: number; remaining_qty: number | null;
    base_cost: number; landed_cost: number;
    is_margin_scheme: boolean; product_condition: string | null; overall_health: string | null;
    remaining_warranty: string | null; wholesale_price: number | null; selling_price: number | null;
}

interface EditLine {
    purchase_order_item_id: number | null;
    product_variant_id: number | null; manual_item_name: string | null; variant_name: string | null;
    sku: string | null; is_serialized: boolean; tax_type: string | null; tax_pct: number; variant_tax_pct?: number | null;
    is_margin_scheme: boolean; base_cost: number; landed_cost: number; tax_amount: number;
    discount_amount: number; line_total: number; ordered_qty: number; unit_cost: number;
    units: EditUnit[]; batches: EditBatch[];
}

interface EditParty {
    id: number; uuid: string | null; name: string;
    phone_primary: string | null; email: string | null; gstin: string | null;
}

interface EditPurchase {
    uuid: string; po_number: string; vendor_invoice_no: string | null;
    order_date: string | null; bill_type: "pv" | "po"; is_gst_billed: boolean;
    is_intra_state: boolean; type: string; status: string; revision: number;
    party_type: "supplier" | "customer"; party: EditParty | null;
    subtotal: number; tax_amount: number; discount_amount: number; shipping_charge: number;
    grand_total: number; paid_amount: number; due_amount: number;
    payment_status: string; payment_mode: string | null; notes: string | null;
    invoice_document_path: string | null; additional_document_path: string | null;
    lines: EditLine[];
}

interface PurchaseEditProps {
    purchase: EditPurchase;
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
}

const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Ensure UUID is lowercased and valid RFC 4122 standard (same as create page)
function generateUuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID().toLowerCase();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function conditionId(deviceConditions: DeviceConditionOption[], code: string | null): number | null {
    return deviceConditions.find((d) => d.code.toUpperCase() === (code ?? "NEW").toUpperCase())?.id ?? null;
}

/**
 * Rebuild editable LineRows from the posted purchase lines.
 * The per-row cost is reconstructed so the GST engine re-evaluates to the
 * same totals: cost = netRate + perUnitDiscount, discPercent backs the
 * discount amount out of the cost (evalLineCost reverses it exactly).
 */
function detectWarranty(u: { activation_date?: string | null; warranty_expiry_date?: string | null; remaining_warranty?: string | null }): { mode: WarrantyMode; value: string } {
    if (u.activation_date) return { mode: "A", value: u.activation_date };
    if (u.warranty_expiry_date) return { mode: "E", value: u.warranty_expiry_date };
    return { mode: "D", value: u.remaining_warranty ?? "" };
}

function buildRows(purchase: EditPurchase, deviceConditions: DeviceConditionOption[]): LineRow[] {
    const rows: LineRow[] = [];
    purchase.lines.forEach((item, li) => {
        const name = item.manual_item_name ?? item.variant_name ?? "";
        const taxMode = item.tax_type === "inclusive" ? "I" : "E";

        if (item.is_serialized && item.units.length > 0) {
            const perUnitDiscount = item.discount_amount / Math.max(1, item.units.length);
            item.units.forEach((u, ui) => {
                const netRate = item.tax_type === "exclusive" ? u.base_cost : u.landed_cost;
                const cost = netRate + perUnitDiscount;
                const w = detectWarranty(u);
                rows.push({
                    id: `edit-u-${li}-${ui}`,
                    purchase_order_item_id: item.purchase_order_item_id ?? null,
                    stock_unit_id: u.stock_unit_id ?? null,
                    unit_status: u.status ?? null,
                    product_variant_id: item.product_variant_id,
                    manual_item_name: item.manual_item_name ?? "",
                    name,
                    sku: item.sku ?? "",
                    hsn_code: "",
                    is_serialized: true,
                    imei1: u.imei1 ?? "", imei2: u.imei2 ?? "", serial: u.serial_number ?? "",
                    batteryHealth: u.battery_health_pct != null ? String(u.battery_health_pct) : "",
                    condition: u.device_condition ?? "NEW",
                    condition_id: conditionId(deviceConditions, u.device_condition),
                    quality: u.overall_health ?? "",
                    warrantyMode: w.mode,
                    warrantyValue: w.value,
                    qty: 1,
                    cost,
                    discPercent: cost > 0 ? (perUnitDiscount / cost) * 100 : 0,
                    taxMode,
                    taxPercent: item.is_margin_scheme ? (item.variant_tax_pct ?? item.tax_pct) : item.tax_pct,
                    wholesale: u.wholesale_price ?? 0,
                    selling: u.selling_price ?? 0,
                });
            });
        } else if (!item.is_serialized && item.batches.length > 0) {
            const perUnitDiscount = item.discount_amount / Math.max(1, item.ordered_qty);
            item.batches.forEach((b, bi) => {
                const cost = (item.tax_type === "exclusive" ? b.base_cost : b.landed_cost) + perUnitDiscount;
                rows.push({
                    id: `edit-b-${li}-${bi}`,
                    purchase_order_item_id: item.purchase_order_item_id ?? null,
                    stock_batch_id: b.stock_batch_id ?? null,
                    batch_remaining_qty: b.remaining_qty ?? null,
                    batch_received_qty: b.received_qty,
                    product_variant_id: item.product_variant_id,
                    manual_item_name: item.manual_item_name ?? "",
                    name,
                    sku: item.sku ?? "",
                    hsn_code: "",
                    is_serialized: false,
                    imei1: "", imei2: "", serial: "",
                    batteryHealth: "",
                    condition: b.product_condition ?? "NEW",
                    condition_id: conditionId(deviceConditions, b.product_condition),
                    quality: b.overall_health ?? "",
                    warrantyMode: "D",
                    warrantyValue: b.remaining_warranty ?? "",
                    qty: b.received_qty,
                    cost,
                    discPercent: cost > 0 ? (perUnitDiscount / cost) * 100 : 0,
                    taxMode,
                    taxPercent: item.is_margin_scheme ? (item.variant_tax_pct ?? item.tax_pct) : item.tax_pct,
                    wholesale: b.wholesale_price ?? 0,
                    selling: b.selling_price ?? 0,
                });
            });
        } else {
            // Fallback: no stock rows attached — one row carrying the ordered qty.
            const perUnitDiscount = item.discount_amount / Math.max(1, item.ordered_qty);
            const netRate = item.tax_type === "exclusive" ? item.base_cost : item.landed_cost;
            const cost = netRate + perUnitDiscount;
            rows.push({
                id: `edit-f-${li}`,
                product_variant_id: item.product_variant_id,
                manual_item_name: item.manual_item_name ?? "",
                name,
                sku: item.sku ?? "",
                hsn_code: "",
                is_serialized: item.is_serialized,
                imei1: "", imei2: "", serial: "",
                batteryHealth: "",
                condition: "NEW",
                condition_id: conditionId(deviceConditions, "NEW"),
                quality: "",
                warrantyMode: "D",
                warrantyValue: "",
                qty: Math.max(1, item.ordered_qty),
                cost,
                discPercent: cost > 0 ? (perUnitDiscount / cost) * 100 : 0,
                taxMode,
                taxPercent: item.tax_pct,
                wholesale: 0,
                selling: 0,
            });
        }
    });
    return rows;
}

const PAYMENT_MODES: PaymentMode[] = ["cash", "upi", "neft", "cheque", "card"];

function PurchaseEditInner({ purchase }: { purchase: EditPurchase }) {
    const { state, dispatch, flags, vendorIsRegistered, hasParty, subtotal, totalTax, grandTotal, dueAmount, deviceConditions } = usePurchase();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [triedSubmit, setTriedSubmit] = useState(false);
    const [idempotencyKey, setIdempotencyKey] = useState(() => generateUuid());
    const hydratedRef = useRef(false);

    // Hydrate the reducer once from the posted purchase. Document-identity
    // fields (PO number, order date, party, tax movement, GST toggle) are
    // rendered locked — the backend re-validates them as immutable anyway.
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;

        const party: Party | null = purchase.party ? {
            id: purchase.party.id,
            uuid: purchase.party.uuid ?? "",
            name: purchase.party.name,
            phone_primary: purchase.party.phone_primary,
            email: purchase.party.email,
            gstin: purchase.party.gstin,
        } : null;

        const paymentMode: PaymentMode = PAYMENT_MODES.includes(purchase.payment_mode as PaymentMode)
            ? (purchase.payment_mode as PaymentMode)
            : "cash";

        dispatch({ type: "SET_PARTY_TYPE", payload: purchase.party_type });
        dispatch({ type: "SET_PARTY", payload: { party } });
        dispatch({ type: "SET_TAX_MOVEMENT", payload: purchase.is_intra_state ? "intra" : "inter" });
        dispatch({ type: "SET_PO_NUMBER", payload: purchase.po_number });
        dispatch({ type: "SET_VENDOR_INVOICE", payload: purchase.vendor_invoice_no ?? "" });
        dispatch({ type: "SET_ORDER_DATE", payload: purchase.order_date ?? "" });
        dispatch({ type: "SET_ROWS", payload: buildRows(purchase, deviceConditions) });
        dispatch({ type: "SET_ADDITIONAL_DISCOUNT", payload: purchase.discount_amount });
        dispatch({ type: "SET_FREIGHT", payload: purchase.shipping_charge });
        dispatch({ type: "SET_MARK_AS_PAID", payload: purchase.paid_amount > 0 });
        dispatch({ type: "SET_PAID_AMOUNT", payload: purchase.paid_amount });
        dispatch({ type: "SET_PAYMENT_MODE", payload: paymentMode });
        dispatch({ type: "SET_NOTES", payload: purchase.notes ?? "" });
        dispatch({ type: "SET_INVOICE_DOC", payload: purchase.invoice_document_path });
        dispatch({ type: "SET_ADDITIONAL_DOC", payload: purchase.additional_document_path });
        dispatch({ type: "TOGGLE_GST", payload: purchase.is_gst_billed });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
                    r.imei1.trim() && `imei1:${r.imei1.trim().toLowerCase()}`,
                    r.imei2.trim() && `imei2:${r.imei2.trim().toLowerCase()}`,
                    r.serial.trim() && `serial:${r.serial.trim().toLowerCase()}`,
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
    const delta = grandTotal - purchase.grand_total;

    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);

    // Save is PIN-gated: validate the form first, then ask for the store PIN.
    const requestSubmit = () => {
        setTriedSubmit(true);
        if (isSubmitting) return;
        if (!isValid) {
            document.getElementById("purchase-validation")?.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        setPinError(null);
        setPinOpen(true);
    };

    const handleSubmit = (securityPin: string) => {
        setIsSubmitting(true);

        const lines = groupRowsForSubmit(state.rows, flags, vendorIsRegistered, hasParty);
        const paymentStatus: string = state.markAsPaid
            ? dueAmount <= 0.009 ? "paid" : state.paidAmount > 0 ? "partial" : "unpaid"
            : "unpaid";

        // Same payload shape as create; row IDs (purchase_order_item_id,
        // stock_unit_id, stock_batch_id) drive the backend's row-level guards.
        // Vendor can be changed (sent from state); date/bill/tax flags stay immutable.
        const payload = {
            idempotency_key: idempotencyKey,
            security_pin: securityPin,
            po_number: purchase.po_number,
            vendor_invoice_no: state.vendorInvoiceNo || null,
            order_date: purchase.order_date,

            party_type: state.partyType,
            party_id: state.selectedParty?.id ?? null,

            bill_type: purchase.bill_type,
            is_gst_billed: purchase.is_gst_billed,
            is_intra_state: purchase.is_intra_state,

            subtotal: Math.round(subtotal * 100) / 100,
            tax_amount: Math.round(totalTax * 100) / 100,
            discount_amount: state.additionalDiscount,
            shipping_charge: state.freightCharges,
            grand_total: Math.round(grandTotal * 100) / 100,

            paid_amount: state.markAsPaid ? state.paidAmount : 0,
            due_amount: Math.round(dueAmount * 100) / 100,

            payment_status: paymentStatus,
            payment_mode: state.markAsPaid ? state.paymentMode : null,
            notes: state.notes || null,
            invoice_document_path: state.invoiceDocumentPath,
            additional_document_path: state.additionalDocumentPath,
            is_draft: false,
            type: purchase.type,

            lines,
        };

        const updateUrl = app.purchases.update
            ? app.purchases.update.url(purchase.uuid)
            : `/app/purchases/${purchase.uuid}`;

        router.put(updateUrl, payload as unknown as Parameters<typeof router.put>[1], {
            preserveScroll: true,
            onError: (errs) => {
                if (errs.security_pin) {
                    setPinError(errs.security_pin as string);
                    setPinOpen(true);
                }
            },
            onFinish: () => setIsSubmitting(false),
            onSuccess: () => {
                setPinOpen(false);
                setIdempotencyKey(generateUuid());
            },
        });
    };

    return (
        <>
            <Head title={`Edit Purchase ${purchase.po_number}`} />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <PurchaseHeader onSubmit={() => requestSubmit()} isSubmitting={isSubmitting} locked />
                <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl px-6 py-4">
                    <div className="bg-card pt-4 border rounded-md border-border text-sm">
                        <VendorAndDocMeta locked vendorLocked={false} />
                        <Separator className="mt-6" />
                        <LineItemTable />
                        <PurchaseSummaryFooter onSubmit={() => requestSubmit()} isSubmitting={isSubmitting} triedSubmit={triedSubmit} errors={errors} isValid={isValid} locked />
                    <SecurityPinModal
                        open={pinOpen}
                        onOpenChange={setPinOpen}
                        onConfirm={(pin) => handleSubmit(pin)}
                        title="Confirm purchase edit"
                        description="Enter the store's 6-digit security PIN to save these changes."
                        error={pinError}
                        verifying={isSubmitting}
                        confirmLabel="Save changes"
                    />
                    </div>
                </div>
            </div>
        </>
    );
}

export default function PurchaseEdit({ purchase, store, deviceConditions }: PurchaseEditProps) {
    return (
        <>
            <Head title={`Edit Purchase — ${store.name}`} />
            <PurchaseProvider store={store} deviceConditions={deviceConditions} initialPoNumber={purchase.po_number}>
                <PurchaseEditInner purchase={purchase} />
            </PurchaseProvider>
        </>
    );
}

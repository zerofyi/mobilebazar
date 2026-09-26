import React, { createContext, useContext, useMemo, useReducer } from "react";

export type PartyType = "customer" | "supplier";
export type BillType = "pv" | "po";
export type TaxMovement = "intra" | "inter";
export type WarrantyMode = "D" | "A" | "E";
export type TaxMode = "I" | "E";
export type PaymentMode = "cash" | "upi" | "neft" | "cheque" | "card";

export interface Address {
    id: number; uuid: string; addressable_type: string; addressable_id: number;
    type: string; line1: string | null; line2: string | null; city: string | null;
    state: string | null; postal_code: string | null; country: string;
    village_or_area: string | null; post_office: string | null; police_station: string | null;
    district: string | null; lat: number | null; lng: number | null; is_default: boolean;
}

export interface StoreInfo {
    id: number; uuid: string; code: string; name: string; type: string;
    platform: string; franchise_agreement_id: string | null;
    image_asset_path: string | null; logo_asset_path: string | null; signature_asset_path: string | null;
    location: string | null; phone: string | null; email: string | null;
    gstin: string | null; is_active: boolean; is_public: boolean;
    is_gst_registered: boolean; is_iws_allowed: boolean;
    lat: number | null; lng: number | null; timezone: string; currency: string;
    user_id: number | null; address: Address | null;
}

export interface DeviceConditionOption {
    id: number; code: string; label: string; grade_multiplier: string;
}

export interface CatalogVariant {
    id: number; uuid: string; product_id: number; product_name: string;
    variant_name: string; sku: string; barcode: string | null; hsn_code: string | null;
    is_serialized: boolean; tax_pct: number; mrp: number;
    cost_price: number; selling_price: number; min_selling_price: number;
    attributes_text: string | null;
}

export interface ColumnVisibility {
    productBh: boolean; type: boolean; quality: boolean; warranty: boolean;
    imeis: boolean; serial: boolean; cost: boolean; disc: boolean;
    tax: boolean; wholesale: boolean; selling: boolean;
}

function defaultColumnVisibility(canSeeWholesale: boolean, isGstBilled: boolean): ColumnVisibility {
    return {
        productBh: true, type: true, quality: true, warranty: true,
        imeis: true, serial: false, cost: true, disc: false,
        tax: isGstBilled, wholesale: canSeeWholesale, selling: true,
    };
}

export interface LineRow {
    id: string; product_variant_id: number | null; manual_item_name: string;
    name: string; sku: string; hsn_code: string; is_serialized: boolean;
    imei1: string; imei2: string; serial: string; batteryHealth: string;
    condition: string; condition_id: number | null; quality: string;
    warrantyMode: WarrantyMode; warrantyValue: string; qty: number;
    cost: number; discPercent: number; taxMode: TaxMode; taxPercent: number;
    wholesale: number; selling: number;
}

interface PurchaseState {
    storeGstBillToggle: boolean; partyType: PartyType; selectedParty: Party | null;
    taxMovement: TaxMovement; poNumber: string; vendorInvoiceNo: string;
    orderDate: string; columnVisibility: ColumnVisibility; rows: LineRow[];
    additionalDiscount: number; freightCharges: number; autoRoundOff: boolean;
    markAsPaid: boolean; paidAmount: number; paymentMode: PaymentMode;
    notes: string; invoiceDocumentPath: string | null; additionalDocumentPath: string | null;
}

export interface DocumentFlags { billType: BillType; isGstBilled: boolean; }

export interface Party {
    id: number; uuid: string; name: string; care_of?: string | null;
    phone_primary?: string | null; phone_secondary?: string | null;
    aadhaar_number?: string | null; pan_number?: string | null;
    voter_number?: string | null; is_verified?: boolean;
    address_snapshot?: string | null; company_name?: string | null;
    phone?: string | null; email?: string | null; gstin?: string | null;
    current_balance?: number | string | null; address?: Address | null;
}

export interface CalculatedRow extends LineRow {
    _netRate: number; _taxAmt: number; _lineTotal: number;
    _baseCost: number; _landedCost: number; _isMarginLine: boolean;
}

interface PurchaseContextValue {
    state: PurchaseState; dispatch: React.Dispatch<PurchaseAction>;
    flags: DocumentFlags; vendorIsRegistered: boolean; calculatedRows: CalculatedRow[];
    marginLineCount: number; subtotal: number; totalTax: number;
    grandTotal: number; roundOff: number; dueAmount: number;
    store: StoreInfo; deviceConditions: DeviceConditionOption[];
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function usePurchase() {
    const ctx = useContext(PurchaseContext);
    if (!ctx) throw new Error("usePurchase must be used within PurchaseProvider");
    return ctx;
}

interface PurchaseProviderProps {
    children: React.ReactNode; store: StoreInfo;
    deviceConditions: DeviceConditionOption[]; initialPoNumber: string;
}

export function PurchaseProvider({ children, store, deviceConditions, initialPoNumber }: PurchaseProviderProps) {
    const [state, dispatch] = useReducer(purchaseReducer, {
        storeGstBillToggle: store.is_gst_registered,
        partyType: "customer", selectedParty: null, taxMovement: "intra",
        poNumber: initialPoNumber, vendorInvoiceNo: "",
        orderDate: new Date().toISOString().slice(0, 10),
        columnVisibility: defaultColumnVisibility(store.is_iws_allowed, store.is_gst_registered),
        rows: [], additionalDiscount: 0, freightCharges: 0, autoRoundOff: true,
        markAsPaid: false, paidAmount: 0, paymentMode: "cash", notes: "",
        invoiceDocumentPath: null, additionalDocumentPath: null,
    });

    const vendorIsRegistered = Boolean(state.selectedParty?.gstin?.trim());
    const flags = useMemo(() => evalDocumentFlags(store.is_gst_registered, state.storeGstBillToggle, vendorIsRegistered), [store.is_gst_registered, state.storeGstBillToggle, vendorIsRegistered]);

    const calculatedRows = useMemo<CalculatedRow[]>(() => state.rows.map((row) => {
        const c = evalLineCost(row, flags, vendorIsRegistered);
        return { ...row, _netRate: c.netRate, _taxAmt: c.taxAmt, _lineTotal: c.lineTotal, _baseCost: c.baseCost, _landedCost: c.landedCost, _isMarginLine: c.isMarginLine };
    }), [state.rows, flags, vendorIsRegistered]);

    const marginLineCount = useMemo(() => calculatedRows.filter((r) => r._isMarginLine).length, [calculatedRows]);

    // FIX: Using _baseCost explicitly ensures the Subtotal excludes evaluated tax,
    // making the preRound calculation perfectly additive.
    const subtotal = useMemo(() => calculatedRows.reduce((s, r) => s + r._baseCost * r.qty, 0), [calculatedRows]);
    const totalTax = useMemo(() => calculatedRows.reduce((s, r) => s + r._taxAmt * r.qty, 0), [calculatedRows]);

    const preRound = subtotal - state.additionalDiscount + totalTax + state.freightCharges;
    const grandTotal = state.autoRoundOff ? Math.round(preRound) : preRound;
    const roundOff = grandTotal - preRound;
    const dueAmount = state.markAsPaid ? Math.max(0, grandTotal - state.paidAmount) : grandTotal;

    const value = useMemo(() => ({ state, dispatch, flags, vendorIsRegistered, calculatedRows, marginLineCount, subtotal, totalTax, grandTotal, roundOff, dueAmount, store, deviceConditions }),
        [state, flags, vendorIsRegistered, calculatedRows, marginLineCount, subtotal, totalTax, grandTotal, roundOff, dueAmount, store, deviceConditions]);

    return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}

export function evalDocumentFlags(storeIsGstRegistered: boolean, gstBillToggle: boolean, vendorIsRegistered: boolean): DocumentFlags {
    if (!storeIsGstRegistered || !gstBillToggle) return { billType: "pv", isGstBilled: false };
    return { billType: vendorIsRegistered ? "po" : "pv", isGstBilled: true };
}

export function evalLineMargin(row: LineRow, flags: DocumentFlags, vendorIsRegistered: boolean): boolean {
    if (!flags.isGstBilled) return false;
    if (!vendorIsRegistered) return true;
    return row.condition.toUpperCase() !== "NEW";
}

export interface LineCost {
    netRate: number; taxAmt: number; baseCost: number; landedCost: number;
    lineTotal: number; isMarginLine: boolean; discountAmt: number;
}

export function evalLineCost(row: LineRow, flags: DocumentFlags, vendorIsRegistered: boolean): LineCost {
    const rawRate = row.cost;
    const discountAmt = (rawRate * row.discPercent) / 100;
    const netRate = rawRate - discountAmt;
    const isMarginLine = evalLineMargin(row, flags, vendorIsRegistered);
    let taxAmt = 0; let baseCost = netRate; let landedCost = netRate;

    const taxApplies = flags.isGstBilled && vendorIsRegistered && !isMarginLine && row.taxPercent > 0;
    if (taxApplies) {
        if (row.taxMode === "E") {
            taxAmt = (netRate * row.taxPercent) / 100; baseCost = netRate; landedCost = netRate + taxAmt;
        } else {
            baseCost = netRate / (1 + row.taxPercent / 100); taxAmt = netRate - baseCost; landedCost = netRate;
        }
    }
    return { netRate, taxAmt, baseCost, landedCost, lineTotal: landedCost * row.qty, isMarginLine, discountAmt };
}

export interface SubmitUnit {
    imei1: string | null; imei2: string | null; serial_number: string | null;
    device_condition_id: number | null; device_condition_code: string;
    overall_health: string | null; battery_health_pct: number | null;
    warranty_mode: WarrantyMode; warranty_value: string | null;
    unit_base_cost: number; unit_landed_cost: number; wholesale_price: number;
    selling_price: number; is_margin_scheme: boolean;
}

export interface SubmitLine {
    product_variant_id: number | null; manual_item_name: string | null;
    is_serialized: boolean; ordered_qty: number; unit_cost: number;
    tax_type: "inclusive" | "exclusive"; tax_pct: number; is_margin_scheme: boolean;
    base_cost: number; landed_cost: number; tax_amount: number;
    discount_amount: number; line_total: number; units: SubmitUnit[];
}

export function groupRowsForSubmit(rows: LineRow[], flags: DocumentFlags, vendorIsRegistered: boolean): SubmitLine[] {
    const orderKeys: string[] = [];
    const map = new Map<string, LineRow[]>();

    for (const row of rows) {
        const key = row.product_variant_id != null ? `v:${row.product_variant_id}` : `m:${row.id}`;
        if (!map.has(key)) { orderKeys.push(key); map.set(key, []); }
        map.get(key)!.push(row);
    }

    return orderKeys.map((key) => {
        const group = map.get(key)!;
        const first = group[0];
        const orderedQty = group.reduce((s, r) => s + r.qty, 0);
        const avgCost = group.reduce((s, r) => s + r.cost * r.qty, 0) / orderedQty;
        const costs = group.map((r) => evalLineCost(r, flags, vendorIsRegistered));

        const totalTax = costs.reduce((s, c, i) => s + c.taxAmt * group[i].qty, 0);
        const totalDisc = costs.reduce((s, c, i) => s + c.discountAmt * group[i].qty, 0);
        const totalLine = costs.reduce((s, c) => s + c.lineTotal, 0);
        const isMarginScheme = costs.every((c) => c.isMarginLine);

        return {
            product_variant_id: first.product_variant_id,
            manual_item_name: first.product_variant_id == null ? first.manual_item_name || first.name : null,
            is_serialized: first.is_serialized, ordered_qty: orderedQty, unit_cost: round2(avgCost),
            tax_type: first.taxMode === "I" ? "inclusive" : "exclusive",
            tax_pct: isMarginScheme ? 0 : first.taxPercent, is_margin_scheme: isMarginScheme,
            base_cost: round2(costs[0].baseCost), landed_cost: round2(costs[0].landedCost),
            tax_amount: round2(totalTax), discount_amount: round2(totalDisc), line_total: round2(totalLine),
            units: group.map((r) => {
                const c = evalLineCost(r, flags, vendorIsRegistered);
                const bh = parseInt(r.batteryHealth, 10);
                return {
                    imei1: r.imei1.trim() || null, imei2: r.imei2.trim() || null, serial_number: r.serial.trim() || null,
                    device_condition_id: r.condition_id, device_condition_code: r.condition,
                    overall_health: r.quality.trim() || null, battery_health_pct: Number.isFinite(bh) ? Math.min(100, Math.max(0, bh)) : null,
                    warranty_mode: r.warrantyMode, warranty_value: r.warrantyValue.trim() || null,
                    unit_base_cost: round2(c.baseCost), unit_landed_cost: round2(c.landedCost),
                    wholesale_price: r.wholesale, selling_price: r.selling, is_margin_scheme: c.isMarginLine,
                };
            }),
        };
    });
}

export function applyVariantToRow(row: LineRow, v: CatalogVariant): LineRow {
    return {
        ...row, product_variant_id: v.id, manual_item_name: "", name: `${v.product_name} (${v.variant_name})`,
        sku: v.sku, hsn_code: v.hsn_code ?? "", is_serialized: v.is_serialized, qty: v.is_serialized ? 1 : Math.max(1, row.qty),
        cost: v.cost_price, taxPercent: v.tax_pct, wholesale: v.cost_price > 0 ? v.cost_price : row.wholesale, selling: v.selling_price,
    };
}

export function clearVariantFromRow(row: LineRow): LineRow {
    return { ...row, product_variant_id: null, manual_item_name: row.manual_item_name || row.name, name: row.manual_item_name || row.name, sku: "", hsn_code: "" };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

export type PurchaseAction =
    | { type: "TOGGLE_GST"; payload: boolean }
    | { type: "SET_PARTY_TYPE"; payload: PartyType }
    | { type: "SET_PARTY"; payload: { party: Party | null; storeGstin?: string | null; storeState?: string | null } }
    | { type: "SET_TAX_MOVEMENT"; payload: TaxMovement }
    | { type: "SET_PO_NUMBER"; payload: string }
    | { type: "SET_VENDOR_INVOICE"; payload: string }
    | { type: "SET_ORDER_DATE"; payload: string }
    | { type: "SET_COLUMN_VISIBILITY"; payload: Partial<ColumnVisibility> }
    | { type: "SET_ROWS"; payload: LineRow[] }
    | { type: "UPDATE_ROW"; payload: { id: string; field: keyof LineRow; value: unknown } }
    | { type: "ADD_ROW"; payload: LineRow }
    | { type: "ADD_ROWS"; payload: LineRow[] }
    | { type: "APPLY_VARIANT"; payload: { id: string; variant: CatalogVariant } }
    | { type: "CLEAR_VARIANT"; payload: string }
    | { type: "REMOVE_ROW"; payload: string }
    | { type: "DUPLICATE_ROW"; payload: string }
    | { type: "SET_ADDITIONAL_DISCOUNT"; payload: number }
    | { type: "SET_FREIGHT"; payload: number }
    | { type: "SET_AUTO_ROUND_OFF"; payload: boolean }
    | { type: "SET_MARK_AS_PAID"; payload: boolean }
    | { type: "SET_PAID_AMOUNT"; payload: number }
    | { type: "SET_PAYMENT_MODE"; payload: PaymentMode }
    | { type: "SET_NOTES"; payload: string }
    | { type: "SET_INVOICE_DOC"; payload: string | null }
    | { type: "SET_ADDITIONAL_DOC"; payload: string | null };

function purchaseReducer(state: PurchaseState, action: PurchaseAction): PurchaseState {
    switch (action.type) {
        case "TOGGLE_GST": return { ...state, storeGstBillToggle: action.payload, columnVisibility: { ...state.columnVisibility, tax: action.payload } };
        case "SET_PARTY_TYPE": return { ...state, partyType: action.payload, selectedParty: null };
        case "SET_PARTY": {
            const { party, storeGstin, storeState } = action.payload;
            let movement = state.taxMovement;
            if (party) {
                const pGstin = party.gstin?.substring(0, 2);
                const sGstin = storeGstin?.substring(0, 2);
                if (pGstin && sGstin) movement = pGstin === sGstin ? "intra" : "inter";
                else if (party.address?.state && storeState) movement = party.address.state.trim().toLowerCase() === storeState.trim().toLowerCase() ? "intra" : "inter";
            }
            return { ...state, selectedParty: party, taxMovement: movement };
        }
        case "SET_TAX_MOVEMENT": return { ...state, taxMovement: action.payload };
        case "SET_PO_NUMBER": return { ...state, poNumber: action.payload };
        case "SET_VENDOR_INVOICE": return { ...state, vendorInvoiceNo: action.payload };
        case "SET_ORDER_DATE": return { ...state, orderDate: action.payload };
        case "SET_COLUMN_VISIBILITY": return { ...state, columnVisibility: { ...state.columnVisibility, ...action.payload } };
        case "SET_ROWS": return { ...state, rows: action.payload };
        case "UPDATE_ROW": return { ...state, rows: state.rows.map((r) => r.id === action.payload.id ? { ...r, [action.payload.field]: action.payload.value } : r) };
        case "ADD_ROW": return { ...state, rows: [...state.rows, action.payload] };
        case "ADD_ROWS": return { ...state, rows: [...state.rows, ...action.payload] };
        case "APPLY_VARIANT": return { ...state, rows: state.rows.map((r) => r.id === action.payload.id ? applyVariantToRow(r, action.payload.variant) : r) };
        case "CLEAR_VARIANT": return { ...state, rows: state.rows.map((r) => (r.id === action.payload ? clearVariantFromRow(r) : r)) };
        case "REMOVE_ROW": return { ...state, rows: state.rows.filter((r) => r.id !== action.payload) };
        case "DUPLICATE_ROW": {
            const idx = state.rows.findIndex((r) => r.id === action.payload);
            if (idx === -1) return state;
            const dup: LineRow = { ...state.rows[idx], id: crypto.randomUUID(), imei1: "", imei2: "", serial: "" };
            const newRows = [...state.rows]; newRows.splice(idx + 1, 0, dup);
            return { ...state, rows: newRows };
        }
        case "SET_ADDITIONAL_DISCOUNT": return { ...state, additionalDiscount: action.payload };
        case "SET_FREIGHT": return { ...state, freightCharges: action.payload };
        case "SET_AUTO_ROUND_OFF": return { ...state, autoRoundOff: action.payload };
        case "SET_MARK_AS_PAID": return { ...state, markAsPaid: action.payload };
        case "SET_PAID_AMOUNT": return { ...state, paidAmount: action.payload };
        case "SET_PAYMENT_MODE": return { ...state, paymentMode: action.payload };
        case "SET_NOTES": return { ...state, notes: action.payload };
        case "SET_INVOICE_DOC": return { ...state, invoiceDocumentPath: action.payload };
        case "SET_ADDITIONAL_DOC": return { ...state, additionalDocumentPath: action.payload };
        default: return state;
    }
}

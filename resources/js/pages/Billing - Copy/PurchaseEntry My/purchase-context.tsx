/**
 * PurchaseContext
 * ──────────────────────────────────────────────────────────────────────────
 * Single source of truth for the entire Purchase Entry page. All partials
 * read from and write to this context — no prop-drilling, no duplicated state.
 *
 * Architecture note on data loading:
 * Only small, infrequently-changing data (device conditions, store info, user
 * permissions) is passed as Inertia props at page render time.
 * Parties (customers/suppliers) and catalog variants are searched on demand
 * via dedicated JSON endpoints with debouncing — this keeps the initial render
 * payload small and the system scalable to 100+ stores.
 */

import React, { createContext, useCallback, useContext, useMemo, useReducer, useRef } from 'react';

// ─── Domain types ────────────────────────────────────────────────────────────

export type PartyType = 'customer' | 'supplier';
export type BillType = 'pv' | 'po';
export type TaxMovement = 'intra' | 'inter';
export type WarrantyMode = 'D' | 'A' | 'E'; // Duration | Activation date | Expiry date
export type PaymentMode = 'cash' | 'upi' | 'neft' | 'cheque' | 'card';
export type PaymentStatus = 'paid' | 'partial' | 'unpaid';

export interface StoreAddress {
    id: number;
    uuid: string;
    addressable_type: string;
    addressable_id: number;
    type: string;
    line1: string | null;
    line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    country: string;
    village_or_area: string | null;
    post_office: string | null;
    police_station: string | null;
    district: string | null;
    lat: number | null;
    lng: number | null;
    is_default: boolean;
    created_at: string;
    updated_at: string;
}

export interface StoreInfo {
    id: number;
    uuid: string;
    code: string;
    name: string;
    type: string;
    platform: string;
    franchise_agreement_id: number | null;
    image_asset_path: string | null;
    logo_asset_path: string | null;
    signature_asset_path: string | null;
    location: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    bank_name: string | null;
    bank_account_holder_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_upi_id: string | null;
    is_active: boolean;
    is_public: boolean;
    is_gst_registered: boolean;
    is_iws_allowed: boolean;
    lat: number | null;
    lng: number | null;
    timezone: string;
    currency: string;
    user_id: number;
    opened_at: string | null;
    closed_at: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    address: StoreAddress | null;
}

export interface DeviceConditionOption {
    id: number;
    code: string;
    label: string;
    grade_multiplier: string;
}

function defaultColumnVisibility(canSeeWholesale: boolean, isGstBilled: boolean): ColumnVisibility {
    return {
        productBh: true,
        type: true,
        quality: true,
        warranty: true,
        imeis: true,
        serial: false,
        cost: true,
        disc: false,
        tax: isGstBilled,
        wholesale: canSeeWholesale,
        selling: true,
    };
}

export interface ColumnVisibility {
    productBh: boolean;
    type: boolean;
    quality: boolean;
    warranty: boolean;
    imeis: boolean;
    serial: boolean;
    cost: boolean;
    disc: boolean;
    tax: boolean;
    wholesale: boolean;
    selling: boolean;
}

export interface LineRow {
    /** Local-only uuid — never sent to the backend */
    id: string;
    // Catalog linkage
    product_variant_id: number | null;
    manual_item_name: string;
    name: string;
    sku: string;
    hsn_code: string;
    is_serialized: boolean;
    // Per-unit identity (serialized only)
    imei1: string;
    imei2: string;
    serial: string;
    batteryHealth: string;
    condition: string;    // device_conditions.code
    condition_id: number | null; // device_conditions.id
    quality: string;
    warrantyMode: WarrantyMode;
    warrantyValue: string;
    // Pricing
    qty: number;
    cost: number;
    discPercent: number;
    taxPercent: number;
    wholesale: number;
    selling: number;
}

interface PurchaseState {
    // Header
    storeGstBillToggle: boolean;   // user override toggle
    // Vendor & doc
    partyType: PartyType;
    selectedParty: Party | null;
    taxMovement: TaxMovement;      // intra/inter — auto-detected, user-overridable
    poNumber: string;
    vendorInvoiceNo: string;
    orderDate: string;
    // Column settings (managed via header settings panel)
    columnVisibility: ColumnVisibility;
    // Line items
    rows: LineRow[];
    // Summary
    additionalDiscount: number;
    freightCharges: number;
    autoRoundOff: boolean;
    markAsPaid: boolean;
    paidAmount: number;
    paymentMode: PaymentMode;
    notes: string;
    invoiceDocumentPath: string | null;
    additionalDocumentPath: string | null;
}

export interface DocumentFlags {
    billType: BillType;
    isGstBilled: boolean;
    isMarginScheme: boolean;
}

interface PurchaseContextValue {
    state: PurchaseState;
    dispatch: React.Dispatch<PurchaseAction>;
    // Derived — recomputed only on relevant state changes
    flags: DocumentFlags;
    vendorIsRegistered: boolean;
    calculatedRows: Array<LineRow & { _netRate: number; _taxAmt: number; _lineTotal: number }>;
    subtotal: number;
    totalTax: number;
    grandTotal: number;
    roundOff: number;
    dueAmount: number;
    // Page-level props
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
}

const PurchaseContext = createContext<PurchaseContextValue | null>(null);

export function usePurchase(): PurchaseContextValue {
    const ctx = useContext(PurchaseContext);
    if (!ctx) throw new Error('usePurchase must be used within PurchaseProvider');
    return ctx;
}

interface PurchaseProviderProps {
    children: React.ReactNode;
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
    initialPoNumber: string;
}

export function PurchaseProvider({ children, store, deviceConditions, initialPoNumber }: PurchaseProviderProps) {
    const [state, dispatch] = useReducer(purchaseReducer, {
        storeGstBillToggle: store.is_gst_registered,
        partyType: 'customer',
        selectedParty: null,
        taxMovement: 'intra',
        poNumber: initialPoNumber,
        vendorInvoiceNo: '',
        orderDate: new Date().toISOString().slice(0, 10),
        columnVisibility: defaultColumnVisibility(store.is_iws_allowed, store.is_gst_registered),
        rows: [],
        additionalDiscount: 0,
        freightCharges: 0,
        autoRoundOff: true,
        markAsPaid: false,
        paidAmount: 0,
        paymentMode: 'cash',
        notes: '',
        invoiceDocumentPath: null,
        additionalDocumentPath: null,
    });

    const vendorIsRegistered = Boolean(state.selectedParty?.gstin);

    const flags = useMemo(
        () => evalDocumentFlags(store.is_gst_registered, state.storeGstBillToggle, vendorIsRegistered),
        [store.is_gst_registered, state.storeGstBillToggle, vendorIsRegistered],
    );

    const calculatedRows = useMemo(
        () =>
            state.rows.map((row) => {
                const c = evalLineCost(row, flags, vendorIsRegistered, row.condition);
                return { ...row, _netRate: c.netRate, _taxAmt: c.taxAmt, _lineTotal: c.lineTotal };
            }),
        [state.rows, flags, vendorIsRegistered],
    );

    const subtotal = useMemo(() => calculatedRows.reduce((s, r) => s + r._netRate * r.qty, 0), [calculatedRows]);
    const totalTax = useMemo(() => calculatedRows.reduce((s, r) => s + r._taxAmt * r.qty, 0), [calculatedRows]);

    const preRound = subtotal - state.additionalDiscount + totalTax + state.freightCharges;
    const grandTotal = state.autoRoundOff ? Math.round(preRound) : preRound;
    const roundOff = grandTotal - preRound;
    const dueAmount = state.markAsPaid ? Math.max(0, grandTotal - state.paidAmount) : grandTotal;

    const value = useMemo(
        () => ({ state, dispatch, flags, vendorIsRegistered, calculatedRows, subtotal, totalTax, grandTotal, roundOff, dueAmount, store, deviceConditions}),
        [state, flags, vendorIsRegistered, calculatedRows, subtotal, totalTax, grandTotal, roundOff, dueAmount],
    );

    return <PurchaseContext.Provider value={value}>{children}</PurchaseContext.Provider>;
}







export interface Party {
    id: number;
    uuid: string;
    name: string;
    care_of: string | null;
    phone_primary?: string;
    phone?: string;
    email: string | null;
    gstin: string | null;
    state_code: string | null;
    state_name: string | null;
    is_verified?: boolean;
    aadhaar_number?: string | null;
    pan_number?: string | null;
    voter_number?: string | null;
    address_snapshot: string | null;
    current_balance?: number;
}

export interface CatalogVariant {
    id: number;
    product_name: string;
    variant_name: string;
    sku: string;
    hsn_code: string;
    is_serialized: boolean;
    cost_price: number;
    selling_price: number;
    min_selling_price: number;
    tax_pct: number; // from product's tax_category
}




// ─── GST Engine (pure functions — no side-effects) ───────────────────────────


/** Evaluate document-level flags from store registration + vendor registration + GST toggle. */
export function evalDocumentFlags(
    storeIsGstRegistered: boolean,
    gstBillToggle: boolean,
    vendorIsRegistered: boolean,
): DocumentFlags {
    if (!storeIsGstRegistered || !gstBillToggle) {
        return { billType: 'pv', isGstBilled: false, isMarginScheme: false };
    }
    // Store is GST registered and user wants a GST bill
    return {
        billType: vendorIsRegistered ? 'po' : 'pv',
        isGstBilled: true,
        isMarginScheme: !vendorIsRegistered,
    };
}

/** Evaluate per-line cost. Tax is always 0 for 'pv'. For 'po' it applies on new items. */
export function evalLineCost(
    row: LineRow,
    flags: DocumentFlags,
    vendorIsRegistered: boolean,
    conditionCode: string,
): { netRate: number; taxAmt: number; baseCost: number; landedCost: number; lineTotal: number } {
    const rawRate = row.cost;
    const discAmt = (rawRate * row.discPercent) / 100;
    const netRate = rawRate - discAmt;
    let taxAmt = 0;

    if (flags.isGstBilled && vendorIsRegistered && conditionCode === 'new') {
        taxAmt = (netRate * row.taxPercent) / 100;
    }

    return {
        netRate,
        taxAmt,
        baseCost: netRate,
        landedCost: netRate + taxAmt,
        lineTotal: (netRate + taxAmt) * row.qty,
    };
}

// ─── Grouping (flat rows → one PO item per variant) ──────────────────────────

export interface SubmitUnit {
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    device_condition_id: number | null;
    device_condition_code: string;
    overall_health: string | null;
    warranty_mode: WarrantyMode;
    warranty_value: string | null;
    unit_cost: number;
    wholesale_price: number;
    selling_price: number;
}

export interface SubmitLine {
    product_variant_id: number | null;
    manual_item_name: string | null;
    is_serialized: boolean;
    ordered_qty: number;
    unit_cost: number; // weighted avg for mixed-price serialized groups
    discount_pct: number;
    tax_pct: number;
    base_cost: number;
    landed_cost: number;
    tax_amount: number;
    line_total: number;
    units: SubmitUnit[];
}

export function groupRowsForSubmit(rows: LineRow[], flags: DocumentFlags, vendorIsRegistered: boolean): SubmitLine[] {
    const orderKeys: string[] = [];
    const map = new Map<string, { rows: LineRow[] }>();

    for (const row of rows) {
        // ad-hoc items never group — each keeps its own line
        const key = row.product_variant_id != null ? `v:${row.product_variant_id}` : `m:${row.id}`;
        if (!map.has(key)) {
            orderKeys.push(key);
            map.set(key, { rows: [] });
        }
        map.get(key)!.rows.push(row);
    }

    return orderKeys.map((key) => {
        const { rows: groupRows } = map.get(key)!;
        const first = groupRows[0];
        const orderedQty = groupRows.reduce((s, r) => s + r.qty, 0);
        const avgCost = groupRows.reduce((s, r) => s + r.cost * r.qty, 0) / orderedQty;
        const costs = groupRows.map((r) => evalLineCost(r, flags, vendorIsRegistered, r.condition));
        const totalTax = costs.reduce((s, c, i) => s + c.taxAmt * groupRows[i].qty, 0);
        const totalLine = costs.reduce((s, c) => s + c.lineTotal, 0);

        return {
            product_variant_id: first.product_variant_id,
            manual_item_name: first.product_variant_id == null ? first.manual_item_name : null,
            is_serialized: first.is_serialized,
            ordered_qty: orderedQty,
            unit_cost: avgCost,
            discount_pct: first.discPercent,
            tax_pct: first.taxPercent,
            base_cost: costs[0].baseCost,
            landed_cost: costs[0].landedCost,
            tax_amount: totalTax,
            line_total: totalLine,
            units: groupRows.map((r) => ({
                imei1: r.imei1 || null,
                imei2: r.imei2 || null,
                serial_number: r.serial || null,
                device_condition_id: r.condition_id,
                device_condition_code: r.condition,
                overall_health: r.quality || null,
                warranty_mode: r.warrantyMode,
                warranty_value: r.warrantyValue || null,
                unit_cost: r.cost,
                wholesale_price: r.wholesale,
                selling_price: r.selling,
            })),
        };
    });
}

// ─── State / Reducer ─────────────────────────────────────────────────────────



type PurchaseAction =
    | { type: 'TOGGLE_GST'; payload: boolean }
    | { type: 'SET_PARTY_TYPE'; payload: PartyType }
    | { type: 'SET_PARTY'; payload: Party | null }
    | { type: 'SET_TAX_MOVEMENT'; payload: TaxMovement }
    | { type: 'SET_PO_NUMBER'; payload: string }
    | { type: 'SET_VENDOR_INVOICE'; payload: string }
    | { type: 'SET_ORDER_DATE'; payload: string }
    | { type: 'SET_COLUMN_VISIBILITY'; payload: Partial<ColumnVisibility> }
    | { type: 'SET_ROWS'; payload: LineRow[] }
    | { type: 'UPDATE_ROW'; payload: { id: string; field: keyof LineRow; value: unknown } }
    | { type: 'ADD_ROW'; payload: LineRow }
    | { type: 'ADD_ROWS'; payload: LineRow[] }
    | { type: 'REMOVE_ROW'; payload: string }
    | { type: 'DUPLICATE_ROW'; payload: string }
    | { type: 'SET_ADDITIONAL_DISCOUNT'; payload: number }
    | { type: 'SET_FREIGHT'; payload: number }
    | { type: 'SET_AUTO_ROUND_OFF'; payload: boolean }
    | { type: 'SET_MARK_AS_PAID'; payload: boolean }
    | { type: 'SET_PAID_AMOUNT'; payload: number }
    | { type: 'SET_PAYMENT_MODE'; payload: PaymentMode }
    | { type: 'SET_NOTES'; payload: string }
    | { type: 'SET_INVOICE_DOC'; payload: string | null }
    | { type: 'SET_ADDITIONAL_DOC'; payload: string | null };



function purchaseReducer(state: PurchaseState, action: PurchaseAction): PurchaseState {
    switch (action.type) {
        case 'TOGGLE_GST': {
            const isGstBilled = action.payload;

            return {
                ...state,
                storeGstBillToggle: isGstBilled,
                columnVisibility: {
                    ...state.columnVisibility,
                    tax: isGstBilled,
                },
            };
        }
        case 'SET_PARTY_TYPE':
            return { ...state, partyType: action.payload, selectedParty: null };
        case 'SET_PARTY': {
            const party = action.payload;
            // Auto-detect intra/inter from state codes — user can still override
            const movement = party?.state_code && party.state_code !== '' ? 'intra' : state.taxMovement;
            return { ...state, selectedParty: party, taxMovement: movement };
        }
        case 'SET_TAX_MOVEMENT':
            return { ...state, taxMovement: action.payload };
        case 'SET_PO_NUMBER':
            return { ...state, poNumber: action.payload };
        case 'SET_VENDOR_INVOICE':
            return { ...state, vendorInvoiceNo: action.payload };
        case 'SET_ORDER_DATE':
            return { ...state, orderDate: action.payload };
        case 'SET_COLUMN_VISIBILITY':
            return { ...state, columnVisibility: { ...state.columnVisibility, ...action.payload } };
        case 'SET_ROWS':
            return { ...state, rows: action.payload };
        case 'UPDATE_ROW':
            return {
                ...state,
                rows: state.rows.map((r) =>
                    r.id === action.payload.id ? { ...r, [action.payload.field]: action.payload.value } : r,
                ),
            };
        case 'ADD_ROW':
            return { ...state, rows: [...state.rows, action.payload] };
        case 'ADD_ROWS':
            return { ...state, rows: [...state.rows, ...action.payload] };
        case 'REMOVE_ROW':
            return { ...state, rows: state.rows.filter((r) => r.id !== action.payload) };
        case 'DUPLICATE_ROW': {
            const idx = state.rows.findIndex((r) => r.id === action.payload);
            if (idx === -1) return state;
            const dup: LineRow = { ...state.rows[idx], id: crypto.randomUUID(), imei1: '', imei2: '', serial: '' };
            const newRows = [...state.rows];
            newRows.splice(idx + 1, 0, dup);
            return { ...state, rows: newRows };
        }
        case 'SET_ADDITIONAL_DISCOUNT':
            return { ...state, additionalDiscount: action.payload };
        case 'SET_FREIGHT':
            return { ...state, freightCharges: action.payload };
        case 'SET_AUTO_ROUND_OFF':
            return { ...state, autoRoundOff: action.payload };
        case 'SET_MARK_AS_PAID':
            return { ...state, markAsPaid: action.payload };
        case 'SET_PAID_AMOUNT':
            return { ...state, paidAmount: action.payload };
        case 'SET_PAYMENT_MODE':
            return { ...state, paymentMode: action.payload };
        case 'SET_NOTES':
            return { ...state, notes: action.payload };
        case 'SET_INVOICE_DOC':
            return { ...state, invoiceDocumentPath: action.payload };
        case 'SET_ADDITIONAL_DOC':
            return { ...state, additionalDocumentPath: action.payload };
        default:
            return state;
    }
}




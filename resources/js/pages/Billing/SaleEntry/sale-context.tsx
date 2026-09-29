import React, { createContext, useContext, useMemo, useReducer } from "react";

/*
 * Sale POS context — single source of truth for the sale screen.
 *
 * The fiscal engine in this file (evalUnitFiscal / evalLineFiscal) is used for
 * BOTH live preview and the submit payload, so they cannot disagree. It mirrors
 * the backend SaleGstEvaluationService exactly:
 *
 *   per unit: discPerUnit = line.discount_amount / line.qty; net = unit_price - discPerUnit
 *   - !is_gst_billed || tax_pct <= 0          → tax = 0, taxable = net, total = net
 *   - margin scheme                           → m = max(0, net - landed_cost);
 *                                               tax = m*r/(100+r); taxable = net - tax; total = net
 *   - tax_type = 'exclusive'                  → taxable = net; tax = net*r/100; total = net + tax
 *   - tax_type = 'inclusive' (default)        → tax = net*r/(100+r); taxable = net - tax; total = net
 *
 *   header: subtotal = Σtaxable; tax_amount = Σtax;
 *           grand_total = subtotal + tax_amount - billDiscount + shippingCharge + roundOff
 *
 * Sale mode (retail | wholesale) switches the price source:
 *   retail    → serialized: stock_units.selling_price · bulk: variants.selling_price
 *   wholesale → serialized: stock_units.wholesale_price · bulk: variants.min_selling_price
 * Toggling re-prices every catalog line from the authoritative source (each
 * serialized row holds exactly one unit, so it takes that unit's exact
 * per-unit mode price). Manual items are never re-priced. The user can still
 * edit any line price afterwards — the backend honors submitted prices as
 * the user's choice.
 */

export type TaxMovement = "intra" | "inter";
export type PaymentMode = "cash" | "upi" | "neft" | "cheque" | "card" | "bank";
export type PartyType = "customer" | "supplier";
export type SaleMode = "retail" | "wholesale";

export interface StoreInfo {
    id: number; code: string; name: string;
    gstin: string | null; is_gst_registered: boolean; state_code: string | null;
}

export interface CategoryOption { id: number; name: string; }

export interface StockUnitMeta {
    id: number; imei1: string | null; imei2: string | null; serial_number: string | null;
    device_condition: string; overall_health: string | null;
    landed_cost: number; is_margin_scheme: boolean;
    selling_price: number | null; wholesale_price: number | null;
}

/** One row from GET /app/sales/stock/search (also the shape of initialProducts, minus units). */
export interface StockSearchResult {
    variant_id: number; product_name: string; variant_name: string;
    sku: string; barcode: string | null; hsn_code: string | null;
    is_serialized: boolean; mrp: number; selling_price: number;
    min_selling_price: number; tax_pct: number; tax_type: "inclusive";
    available_qty: number; img: string | null;
    landed_cost_preview: number; is_margin_scheme_preview: boolean;
    exact_unit?: StockUnitMeta | null;
    units?: StockUnitMeta[];
}

/** The sale counterparty — always a real master record (no walk-ins). */
export interface SaleParty {
    type: PartyType;
    id: number;
    name: string;
    phone: string | null;
    gstin: string | null;
}

export interface CartLine {
    key: string;
    product_variant_id: number | null;
    manual_item_name: string | null;
    product_name: string;
    sku: string;
    hsn_code: string | null;
    is_serialized: boolean;
    qty: number;
    unit_ids: number[];
    unit_metas: StockUnitMeta[];
    /** Available serialized units not yet in the cart (for + qty). */
    units_pool: StockUnitMeta[];
    /** Bulk cap from snapshot. */
    available_qty: number;
    unit_price: number;
    /** Variant retail price at add time — the "back to retail" anchor. */
    retail_price: number;
    min_selling_price: number;
    /** Line-level discount total (₹), spread evenly across units. */
    discount_amount: number;
    tax_type: "inclusive" | "exclusive";
    tax_pct: number;
    landed_cost_preview: number;
    is_margin_scheme_preview: boolean;
    img: string | null;
}

// ─── Fiscal engine ───────────────────────────────────────────────────────────

export function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface UnitFiscal {
    taxable: number; tax: number; total: number; margin: boolean;
}

export function evalUnitFiscal(args: {
    net: number; taxPct: number; taxType: "inclusive" | "exclusive";
    isGstBilled: boolean; isMargin: boolean; landedCost: number;
}): UnitFiscal {
    const { net, taxPct: r, taxType, isGstBilled, isMargin, landedCost } = args;
    const n = round2(net);
    if (!isGstBilled || r <= 0) {
        return { taxable: n, tax: 0, total: n, margin: false };
    }
    if (isMargin) {
        const m = Math.max(0, n - landedCost);
        const tax = round2((m * r) / (100 + r));
        return { taxable: round2(n - tax), tax, total: n, margin: true };
    }
    if (taxType === "exclusive") {
        const tax = round2((n * r) / 100);
        return { taxable: n, tax, total: round2(n + tax), margin: false };
    }
    const tax = round2((n * r) / (100 + r));
    return { taxable: round2(n - tax), tax, total: n, margin: false };
}

export interface ComputedLine extends CartLine {
    _perUnit: UnitFiscal[];
    _taxable: number; _tax: number; _lineTotal: number;
    _cgst: number; _sgst: number; _igst: number;
    _margin: boolean;
}

export function evalLineFiscal(line: CartLine, isGstBilled: boolean, movement: TaxMovement): ComputedLine {
    const qty = Math.max(1, line.qty);
    const discPerUnit = line.discount_amount / qty;
    let perUnit: UnitFiscal[];

    if (line.is_serialized) {
        perUnit = line.unit_metas.map((u) =>
            evalUnitFiscal({
                net: line.unit_price - discPerUnit,
                taxPct: line.tax_pct,
                taxType: line.tax_type,
                isGstBilled,
                isMargin: u.is_margin_scheme,
                landedCost: u.landed_cost,
            })
        );
        // Fallback: no metas yet (shouldn't happen) — use line preview.
        if (perUnit.length === 0) {
            perUnit = [evalUnitFiscal({
                net: line.unit_price - discPerUnit, taxPct: line.tax_pct, taxType: line.tax_type,
                isGstBilled, isMargin: line.is_margin_scheme_preview, landedCost: line.landed_cost_preview,
            })];
        }
    } else {
        const u = evalUnitFiscal({
            net: line.unit_price - discPerUnit, taxPct: line.tax_pct, taxType: line.tax_type,
            isGstBilled, isMargin: line.is_margin_scheme_preview, landedCost: line.landed_cost_preview,
        });
        perUnit = [u];
    }

    const mult = line.is_serialized ? 1 : qty;
    const taxable = round2(perUnit.reduce((s, u) => s + u.taxable * mult, 0));
    const tax = round2(perUnit.reduce((s, u) => s + u.tax * mult, 0));
    const lineTotal = round2(perUnit.reduce((s, u) => s + u.total * mult, 0));

    let cgst = 0, sgst = 0, igst = 0;
    if (isGstBilled && tax > 0) {
        if (movement === "intra") {
            cgst = round2(tax / 2);
            sgst = round2(tax - cgst);
        } else {
            igst = tax;
        }
    }

    return {
        ...line,
        _perUnit: perUnit,
        _taxable: taxable, _tax: tax, _lineTotal: lineTotal,
        _cgst: cgst, _sgst: sgst, _igst: igst,
        _margin: perUnit.some((u) => u.margin),
    };
}

// ─── Wholesale / retail price sources ────────────────────────────────────────

/** Bulk price for a variant under the given mode. */
export function bulkPriceFor(v: StockSearchResult, mode: SaleMode): number {
    return mode === "wholesale" ? v.min_selling_price : v.selling_price;
}

/** Serialized unit price under the given mode, with retail fallbacks. */
export function unitPriceFor(u: StockUnitMeta, variantPrice: number, mode: SaleMode): number {
    if (mode === "wholesale") return u.wholesale_price ?? u.selling_price ?? variantPrice;
    return u.selling_price ?? variantPrice;
}

/** Mode-aware price shown in search results / quick picks. */
export function displaySearchPrice(v: StockSearchResult, mode: SaleMode): number {
    if (!v.is_serialized) return bulkPriceFor(v, mode);
    if (mode === "wholesale") {
        const first = (v.units ?? [])[0] ?? v.exact_unit;
        return first ? unitPriceFor(first, v.selling_price, mode) : v.selling_price;
    }
    return v.selling_price;
}

// ─── State ───────────────────────────────────────────────────────────────────

interface SaleState {
    store: StoreInfo;
    idempotencyKey: string; // one key per page lifetime — reused across Save retries
    lines: CartLine[];
    party: SaleParty | null;
    saleMode: SaleMode;
    taxMovement: TaxMovement;
    isGstBilled: boolean;
    invoiceNumber: string;
    invoiceDate: string;
    billDiscount: number;
    shippingCharge: number;
    autoRoundOff: boolean;
    roundOffManual: number;
    paidAmount: number;
    paymentMode: PaymentMode;
    notes: string;
}

interface SaleContextValue {
    state: SaleState;
    dispatch: React.Dispatch<SaleAction>;
    store: StoreInfo;
    computedLines: ComputedLine[];
    lineCount: number;
    totalQty: number;
    marginLineCount: number;
    subtotal: number;
    taxAmount: number;
    cgst: number; sgst: number; igst: number;
    roundOff: number;
    grandTotal: number;
    dueAmount: number;
}

const SaleContext = createContext<SaleContextValue | null>(null);

export function useSale() {
    const ctx = useContext(SaleContext);
    if (!ctx) throw new Error("useSale must be used within SaleProvider");
    return ctx;
}

export function initialSaleState(store: StoreInfo, initialInvoiceNumber: string): SaleState {
    return {
        store,
        idempotencyKey: generateUuid(),
        lines: [],
        party: null,
        saleMode: "retail",
        taxMovement: "intra",
        isGstBilled: store.is_gst_registered,
        invoiceNumber: initialInvoiceNumber,
        invoiceDate: new Date().toISOString().slice(0, 10),
        billDiscount: 0,
        shippingCharge: 0,
        autoRoundOff: true,
        roundOffManual: 0,
        paidAmount: 0,
        paymentMode: "cash",
        notes: "",
    };
}

interface SaleProviderProps {
    children: React.ReactNode;
    store: StoreInfo;
    initialInvoiceNumber: string;
}

export function SaleProvider({ children, store, initialInvoiceNumber }: SaleProviderProps) {
    const [state, dispatch] = useReducer(saleReducer, undefined, () => initialSaleState(store, initialInvoiceNumber));

    const computedLines = useMemo(
        () => state.lines.map((l) => evalLineFiscal(l, state.isGstBilled, state.taxMovement)),
        [state.lines, state.isGstBilled, state.taxMovement]
    );

    const subtotal = useMemo(() => round2(computedLines.reduce((s, l) => s + l._taxable, 0)), [computedLines]);
    const taxAmount = useMemo(() => round2(computedLines.reduce((s, l) => s + l._tax, 0)), [computedLines]);
    const cgst = useMemo(() => round2(computedLines.reduce((s, l) => s + l._cgst, 0)), [computedLines]);
    const sgst = useMemo(() => round2(computedLines.reduce((s, l) => s + l._sgst, 0)), [computedLines]);
    const igst = useMemo(() => round2(computedLines.reduce((s, l) => s + l._igst, 0)), [computedLines]);

    const preRound = subtotal + taxAmount - Math.max(0, state.billDiscount) + Math.max(0, state.shippingCharge);
    const roundOff = state.autoRoundOff ? round2(Math.round(preRound) - preRound) : round2(state.roundOffManual);
    const grandTotal = round2(preRound + roundOff);
    const dueAmount = round2(Math.max(0, grandTotal - Math.max(0, state.paidAmount)));

    const lineCount = state.lines.length;
    const totalQty = useMemo(() => state.lines.reduce((s, l) => s + l.qty, 0), [state.lines]);
    const marginLineCount = useMemo(() => computedLines.filter((l) => l._margin).length, [computedLines]);

    const value = useMemo(
        () => ({ state, dispatch, store, computedLines, lineCount, totalQty, marginLineCount, subtotal, taxAmount, cgst, sgst, igst, roundOff, grandTotal, dueAmount }),
        [state, store, computedLines, lineCount, totalQty, marginLineCount, subtotal, taxAmount, cgst, sgst, igst, roundOff, grandTotal, dueAmount]
    );

    return <SaleContext.Provider value={value}>{children}</SaleContext.Provider>;
}

// ─── Cart construction helpers ───────────────────────────────────────────────

function newId(): string {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function displayName(v: StockSearchResult): string {
    return `${v.product_name}${v.variant_name ? ` (${v.variant_name})` : ""}`.trim();
}

function makeLineFromVariant(v: StockSearchResult, mode: SaleMode): CartLine {
    return {
        key: newId(),
        product_variant_id: v.variant_id,
        manual_item_name: null,
        product_name: displayName(v),
        sku: v.sku,
        hsn_code: v.hsn_code,
        is_serialized: v.is_serialized,
        qty: 0,
        unit_ids: [],
        unit_metas: [],
        units_pool: v.units ?? [],
        available_qty: v.available_qty,
        unit_price: v.is_serialized ? v.selling_price : bulkPriceFor(v, mode),
        retail_price: v.selling_price,
        min_selling_price: v.min_selling_price,
        discount_amount: 0,
        tax_type: v.tax_type ?? "inclusive",
        tax_pct: v.tax_pct,
        landed_cost_preview: v.landed_cost_preview,
        is_margin_scheme_preview: v.is_margin_scheme_preview,
        img: v.img,
    };
}

/** Units already in the cart (any line), so we never offer the same unit twice. */
function cartedUnitIds(lines: CartLine[]): Set<number> {
    const s = new Set<number>();
    for (const l of lines) for (const id of l.unit_ids) s.add(id);
    return s;
}

/**
 * One serialized unit = one cart row, always. A row's unit price is the
 * EXACT per-unit mode price (never averaged across units), so the posted
 * invoice keeps precise per-unit wholesale history.
 */
function makeLineFromExactUnit(unit: StockUnitMeta, v: StockSearchResult, mode: SaleMode): CartLine {
    const base = makeLineFromVariant(v, mode);
    return {
        ...base,
        qty: 1,
        unit_ids: [unit.id],
        unit_metas: [unit],
        units_pool: (v.units ?? []).filter((u) => u.id !== unit.id),
        unit_price: unitPriceFor(unit, v.selling_price, mode),
    };
}

/**
 * Clone a serialized row's template for another unit of the same variant
 * (the row "+" button). Price is the exact per-unit mode price.
 */
function cloneRowForUnit(line: CartLine, unit: StockUnitMeta, mode: SaleMode): CartLine {
    return {
        ...line,
        key: newId(),
        qty: 1,
        unit_ids: [unit.id],
        unit_metas: [unit],
        units_pool: line.units_pool.filter((u) => u.id !== unit.id),
        unit_price: unitPriceFor(unit, line.retail_price, mode),
        discount_amount: 0,
    };
}

/**
 * Return freed serialized units to a sibling row's pool (same variant), so
 * the "+" button can offer them again after a row is removed.
 */
function returnUnitsToSiblings(lines: CartLine[], variantId: number | null, units: StockUnitMeta[]): CartLine[] {
    const idx = lines.findIndex((l) => l.is_serialized && l.product_variant_id === variantId);
    if (idx < 0) return lines;
    const sib = lines[idx];
    const pool = [...sib.units_pool];
    for (const u of units) {
        if (!pool.some((x) => x.id === u.id)) pool.push(u);
    }
    const next = lines.slice();
    next[idx] = { ...sib, units_pool: pool };
    return next;
}

/**
 * Remove a serialized row and hand its unit back to the sibling pool.
 * (Shared by REMOVE_LINE, DEC_QTY and SET_QTY-to-zero.)
 */
function removeSerializedRow(lines: CartLine[], key: string): CartLine[] {
    const removed = lines.find((l) => l.key === key);
    let next = lines.filter((l) => l.key !== key);
    if (removed && removed.unit_metas.length > 0) {
        next = returnUnitsToSiblings(next, removed.product_variant_id, removed.unit_metas);
    }
    return syncSerializedPools(next);
}

/**
 * Keep every serialized row's "add another unit" pool consistent: the pool
 * is the union of all units known to sibling rows of the same variant,
 * minus the units already in the cart. Called after any serialized
 * add/remove so a removed unit becomes offerable again.
 */
function syncSerializedPools(lines: CartLine[]): CartLine[] {
    const carted = cartedUnitIds(lines);
    const universe = new Map<number | null, StockUnitMeta[]>();
    for (const l of lines) {
        if (!l.is_serialized) continue;
        const list = universe.get(l.product_variant_id) ?? [];
        for (const u of [...l.unit_metas, ...l.units_pool]) {
            if (!list.some((x) => x.id === u.id)) list.push(u);
        }
        universe.set(l.product_variant_id, list);
    }
    return lines.map((l) => {
        if (!l.is_serialized) return l;
        const pool = (universe.get(l.product_variant_id) ?? []).filter((u) => !carted.has(u.id));
        const same = pool.length === l.units_pool.length && pool.every((u, i) => u.id === l.units_pool[i]?.id);
        return same ? l : { ...l, units_pool: pool };
    });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export type SaleAction =
    | { type: "ADD_EXACT_UNIT"; payload: { unit: StockUnitMeta; variant: StockSearchResult } }
    | { type: "ADD_VARIANT"; payload: { variant: StockSearchResult } }
    | { type: "INC_QTY"; payload: string }
    | { type: "DEC_QTY"; payload: string }
    | { type: "SET_QTY"; payload: { key: string; qty: number } }
    | { type: "UPDATE_LINE"; payload: { key: string; patch: Partial<CartLine> } }
    | { type: "REMOVE_LINE"; payload: string }
    | { type: "ADD_MANUAL_ITEM"; payload: { name: string; price: number } }
    | { type: "SET_PARTY"; payload: { party: SaleParty; storeGstin?: string | null } }
    | { type: "CLEAR_PARTY" }
    | { type: "SET_SALE_MODE"; payload: { mode: SaleMode } }
    | { type: "SET_TAX_MOVEMENT"; payload: TaxMovement }
    | { type: "SET_GST_BILLED"; payload: boolean }
    | { type: "SET_BILL_DISCOUNT"; payload: number }
    | { type: "SET_SHIPPING_CHARGE"; payload: number }
    | { type: "SET_ROUND_OFF"; payload: { auto: boolean; manual: number } }
    | { type: "SET_PAID_AMOUNT"; payload: number }
    | { type: "SET_PAYMENT_MODE"; payload: PaymentMode }
    | { type: "SET_NOTES"; payload: string }
    | { type: "SET_INVOICE_DATE"; payload: string }
    | { type: "HYDRATE"; payload: SaleState }
    | { type: "CLEAR" };

/** Pure cart reducer — exported for unit testing the pricing/row rules. */
export function saleReducer(state: SaleState, action: SaleAction): SaleState {
    switch (action.type) {
        case "ADD_EXACT_UNIT": {
            const { unit, variant } = action.payload;
            if (cartedUnitIds(state.lines).has(unit.id)) return state;
            // One unit = one row — never merged, never price-averaged.
            const lines = [...state.lines, makeLineFromExactUnit(unit, variant, state.saleMode)];
            return { ...state, lines: syncSerializedPools(lines) };
        }
        case "ADD_VARIANT": {
            const v = action.payload.variant;
            const mode = state.saleMode;
            if (v.is_serialized) {
                const carted = cartedUnitIds(state.lines);
                const next = (v.units ?? []).find((u) => !carted.has(u.id));
                if (!next) return state; // no available units left — UI surfaces the message
                return saleReducer(state, { type: "ADD_EXACT_UNIT", payload: { unit: next, variant: v } });
            }
            const idx = state.lines.findIndex((l) => l.product_variant_id === v.variant_id && !l.is_serialized);
            if (idx >= 0) {
                const line = state.lines[idx];
                if (line.qty + 1 > line.available_qty) return state;
                const lines = state.lines.slice();
                lines[idx] = { ...line, qty: line.qty + 1 };
                return { ...state, lines };
            }
            if (v.available_qty < 1) return state;
            return { ...state, lines: [...state.lines, { ...makeLineFromVariant(v, mode), qty: 1 }] };
        }
        case "INC_QTY": {
            const idx = state.lines.findIndex((l) => l.key === action.payload);
            if (idx < 0) return state;
            const line = state.lines[idx];
            const lines = state.lines.slice();
            if (line.is_serialized) {
                // Serialized rows hold exactly one unit; "+" appends another
                // unit of the same variant as a NEW row (exact per-unit price).
                const carted = cartedUnitIds(state.lines);
                const next = line.units_pool.find((u) => !carted.has(u.id));
                if (!next) return state;
                const lines = state.lines.slice();
                lines.splice(idx + 1, 0, cloneRowForUnit(line, next, state.saleMode));
                return { ...state, lines: syncSerializedPools(lines) };
            } else {
                if (line.qty + 1 > line.available_qty) return state;
                lines[idx] = { ...line, qty: line.qty + 1 };
            }
            return { ...state, lines };
        }
        case "DEC_QTY": {
            const idx = state.lines.findIndex((l) => l.key === action.payload);
            if (idx < 0) return state;
            const line = state.lines[idx];
            if (line.is_serialized) {
                // One unit per row: "-" removes the whole row, freeing the
                // unit back into sibling rows' pools.
                return { ...state, lines: removeSerializedRow(state.lines, line.key) };
            }
            if (line.qty <= 1) {
                return { ...state, lines: state.lines.filter((l) => l.key !== line.key) };
            }
            const lines = state.lines.slice();
            lines[idx] = { ...line, qty: line.qty - 1 };
            return { ...state, lines };
        }
        case "SET_QTY": {
            const { key, qty } = action.payload;
            const idx = state.lines.findIndex((l) => l.key === key);
            if (idx < 0) return state;
            const line = state.lines[idx];
            const q = Math.max(0, Math.floor(qty));
            if (line.is_serialized) {
                // Serialized rows always hold exactly one unit; qty is fixed
                // at 1. Zero removes the row (frees the unit for siblings).
                if (q <= 0) {
                    return { ...state, lines: removeSerializedRow(state.lines, key) };
                }
                return state;
            }
            const capped = Math.min(q, line.available_qty);
            if (capped <= 0) return { ...state, lines: state.lines.filter((l) => l.key !== key) };
            const lines = state.lines.slice();
            lines[idx] = { ...line, qty: capped };
            return { ...state, lines };
        }
        case "UPDATE_LINE": {
            const { key, patch } = action.payload;
            return {
                ...state,
                lines: state.lines.map((l) => {
                    if (l.key !== key) return l;
                    const next = { ...l, ...patch };
                    if (next.unit_price < 0) next.unit_price = 0;
                    if (next.discount_amount < 0) next.discount_amount = 0;
                    if (!next.is_serialized && next.qty > next.available_qty) next.qty = next.available_qty;
                    return next;
                }),
            };
        }
        case "REMOVE_LINE": {
            const target = state.lines.find((l) => l.key === action.payload);
            // Freeing a serialized unit makes it offerable on sibling rows again.
            const lines = target?.is_serialized
                ? removeSerializedRow(state.lines, action.payload)
                : state.lines.filter((l) => l.key !== action.payload);
            return { ...state, lines };
        }
        case "ADD_MANUAL_ITEM": {
            const { name, price } = action.payload;
            if (!name.trim() || price < 0) return state;
            const line: CartLine = {
                key: newId(),
                product_variant_id: null,
                manual_item_name: name.trim(),
                product_name: name.trim(),
                sku: "",
                hsn_code: null,
                is_serialized: false,
                qty: 1,
                unit_ids: [],
                unit_metas: [],
                units_pool: [],
                available_qty: 999999,
                unit_price: price,
                retail_price: price,
                min_selling_price: 0,
                discount_amount: 0,
                tax_type: "inclusive",
                tax_pct: 0,
                landed_cost_preview: 0,
                is_margin_scheme_preview: false,
                img: null,
            };
            return { ...state, lines: [...state.lines, line] };
        }
        case "SET_PARTY": {
            const { party, storeGstin } = action.payload;
            let movement = state.taxMovement;
            const pGstin = party.gstin?.replace(/\s/g, "");
            const sGstin = storeGstin?.replace(/\s/g, "");
            if (pGstin && pGstin.length >= 2 && sGstin && sGstin.length >= 2) {
                movement = pGstin.substring(0, 2) === sGstin.substring(0, 2) ? "intra" : "inter";
            }
            return { ...state, party, taxMovement: movement };
        }
        case "CLEAR_PARTY":
            return { ...state, party: null };
        case "SET_SALE_MODE": {
            const mode = action.payload.mode;
            if (mode === state.saleMode) return state;
            return {
                ...state,
                saleMode: mode,
                lines: state.lines.map((l) => {
                    // Manual items keep their typed price across modes.
                    if (l.product_variant_id == null) return l;
                    if (l.is_serialized) {
                        // One unit per row: reprice to that unit's exact mode price.
                        const u = l.unit_metas[0];
                        if (!u) return l;
                        return { ...l, unit_price: unitPriceFor(u, l.retail_price, mode) };
                    }
                    return { ...l, unit_price: mode === "wholesale" ? l.min_selling_price : l.retail_price };
                }),
            };
        }
        case "SET_TAX_MOVEMENT":
            return { ...state, taxMovement: action.payload };
        case "SET_GST_BILLED":
            return { ...state, isGstBilled: action.payload };
        case "SET_BILL_DISCOUNT":
            return { ...state, billDiscount: Math.max(0, action.payload) };
        case "SET_SHIPPING_CHARGE":
            return { ...state, shippingCharge: Math.max(0, action.payload) };
        case "SET_ROUND_OFF":
            return { ...state, autoRoundOff: action.payload.auto, roundOffManual: action.payload.manual };
        case "SET_PAID_AMOUNT":
            return { ...state, paidAmount: Math.max(0, action.payload) };
        case "SET_PAYMENT_MODE":
            return { ...state, paymentMode: action.payload };
        case "SET_NOTES":
            return { ...state, notes: action.payload };
        case "SET_INVOICE_DATE":
            return { ...state, invoiceDate: action.payload };
        case "HYDRATE": {
            const p = action.payload;
            return {
                ...p,
                store: state.store,
                lines: p.lines ?? [],
                party: p.party ?? null,
                saleMode: p.saleMode === "wholesale" ? "wholesale" : "retail",
                invoiceNumber: state.invoiceNumber,
                idempotencyKey: p.idempotencyKey || generateUuid(),
            };
        }
        case "CLEAR": {
            const fresh = initialSaleState(state.store, state.invoiceNumber);
            // Keep the sale mode across carts — a wholesale counter stays wholesale.
            fresh.saleMode = state.saleMode;
            return fresh;
        }
        default:
            return state;
    }
}

// ─── Submit payload ──────────────────────────────────────────────────────────

export interface SubmitLine {
    product_variant_id: number | null;
    manual_item_name: string | null;
    is_serialized: boolean;
    qty: number;
    stock_unit_ids: number[];
    unit_price: number;
    discount_amount: number;
    tax_type: "inclusive" | "exclusive";
    tax_pct: number;
    line_total: number;
}

export interface SubmitPayload {
    idempotency_key: string;
    invoice_date: string;
    party_type: PartyType;
    party_id: number;
    invoice_type: SaleMode;
    is_gst_billed: boolean;
    is_intra_state: boolean;
    subtotal: number;
    tax_amount: number;
    discount_amount: number;
    shipping_charge: number;
    round_off: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    payment_status: "paid" | "partial" | "unpaid";
    payment_mode: PaymentMode;
    notes: string | null;
    lines: SubmitLine[];
}

export function buildSalePayload(
    state: SaleState,
    computedLines: ComputedLine[],
    subtotal: number,
    taxAmount: number,
    roundOff: number,
    grandTotal: number,
    dueAmount: number
): SubmitPayload {
    const paid = round2(Math.max(0, state.paidAmount));
    const paymentStatus: "paid" | "partial" | "unpaid" =
        dueAmount <= 0.009 ? "paid" : paid > 0 ? "partial" : "unpaid";

    if (!state.party) throw new Error("A party is required to complete the sale.");

    return {
        idempotency_key: state.idempotencyKey,
        invoice_date: state.invoiceDate,
        party_type: state.party.type,
        party_id: state.party.id,
        invoice_type: state.saleMode,
        is_gst_billed: state.isGstBilled,
        is_intra_state: state.taxMovement === "intra",
        subtotal: round2(subtotal),
        tax_amount: round2(taxAmount),
        discount_amount: round2(Math.max(0, state.billDiscount)),
        shipping_charge: round2(Math.max(0, state.shippingCharge)),
        round_off: round2(roundOff),
        grand_total: round2(grandTotal),
        paid_amount: paid,
        due_amount: round2(dueAmount),
        payment_status: paymentStatus,
        payment_mode: state.paymentMode,
        notes: state.notes.trim() || null,
        lines: computedLines.map((l) => ({
            product_variant_id: l.product_variant_id,
            manual_item_name: l.manual_item_name,
            is_serialized: l.is_serialized,
            qty: l.qty,
            stock_unit_ids: l.is_serialized ? [...l.unit_ids] : [],
            unit_price: round2(l.unit_price),
            discount_amount: round2(l.discount_amount),
            tax_type: l.tax_type,
            tax_pct: l.tax_pct,
            line_total: round2(l._lineTotal),
        })),
    };
}

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

export function inr(n: number, decimals = 2): string {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0.00";
    return v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

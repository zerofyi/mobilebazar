/**
 * build-purchase-payload.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Drop-in, framework-light purchase engine for the Purchase Entry page.
 *
 * What it does:
 *  1. Recomputes the document flags + PER-ROW margin scheme exactly like the
 *     backend (GstEvaluationService), so the UI preview matches what the
 *     server will persist. The server still recomputes everything — this is
 *     preview only.
 *  2. Groups rows into submit lines with a STRICT key (variant + condition +
 *     margin + tax mode + tax % + unit cost + discount %). Rows that differ
 *     in ANY persisted field are never merged.
 *  3. Builds the exact JSON the store endpoint expects (see SUBMIT_CONTRACT.md).
 *  4. Posts with a version-proof Inertia typing cast — this fixes:
 *       "Type 'SubmitLine[]' is not assignable to type 'FormDataConvertible'"
 *
 * Row input is intentionally a minimal structural interface: map your own
 * row shape (LineRow, RowItem, …) onto PurchaseRowInput at the call site.
 */

import { router } from '@inertiajs/react';

// ─── Input ───────────────────────────────────────────────────────────────────

export type TaxMode = 'I' | 'E'; // I = inclusive, E = exclusive
export type WarrantyMode = 'D' | 'A' | 'E';

export interface PurchaseRowInput {
    /** local-only key, never sent */
    id: string;
    product_variant_id: number | null;
    manual_item_name: string;
    manual_hsn?: string | null;
    is_serialized: boolean;
    // identity (serialized rows)
    imei1: string;
    imei2: string;
    serial: string;
    batteryHealth: string; // '' or '0'–'100'
    condition: string; // device_conditions.code, e.g. 'NEW' | 'USED'
    quality: string; // overall health label
    warrantyMode: WarrantyMode;
    warrantyValue: string;
    // pricing
    qty: number;
    cost: number;
    discPercent: number;
    taxMode: TaxMode;
    taxPercent: number;
    wholesale: number;
    selling: number;
}

export interface PurchaseHeaderInput {
    partyType: 'customer' | 'supplier';
    partyId: number | null;
    vendorInvoiceNo: string;
    orderDate: string; // YYYY-MM-DD
    storeIsGstRegistered: boolean;
    gstToggle: boolean;
    vendorIsRegistered: boolean; // party.gstin non-empty
    taxMovement: 'intra' | 'inter';
    additionalDiscount: number;
    shippingCharge: number;
    autoRoundOff: boolean;
    paidAmount: number;
    paymentMode: 'cash' | 'upi' | 'neft' | 'cheque' | 'card';
    notes: string;
    invoiceDocumentPath: string | null;
    additionalDocumentPath: string | null;
}

// ─── Output (matches SUBMIT_CONTRACT.md) ─────────────────────────────────────

export interface SubmitUnit {
    imei1: string | null;
    imei2: string | null;
    serial_number: string | null;
    condition_code: string;
    battery_health_pct: number | null;
    overall_health: string | null;
    warranty_mode: WarrantyMode;
    warranty_value: string;
    unit_cost: number;
    discount_pct: number;
    wholesale_price: number | null;
    selling_price: number | null;
}

export interface SubmitLine {
    product_variant_id: number | null;
    manual_item_name: string | null;
    manual_hsn: string | null;
    is_serialized: boolean;
    tax_type: 'inclusive' | 'exclusive';
    tax_pct: number;
    // serialized lines: units[] carries everything; qty fields ignored
    units: SubmitUnit[];
    // bulk lines only:
    ordered_qty: number | null;
    unit_cost: number | null;
    discount_pct: number | null;
    wholesale_price: number | null;
    selling_price: number | null;
}

export interface PurchasePayload {
    idempotency_key: string;
    party_type: 'customer' | 'supplier';
    party_id: number;
    vendor_invoice_no: string | null;
    order_date: string;
    tax_movement: 'intra' | 'inter';
    gst_toggle: boolean;
    additional_discount: number;
    shipping_charge: number;
    auto_round_off: boolean;
    paid_amount: number;
    payment_mode: string;
    notes: string | null;
    invoice_document_path: string | null;
    additional_document_path: string | null;
    lines: SubmitLine[];
}

// ─── 1. Flag + margin engine (mirrors the backend) ───────────────────────────

export interface DocumentFlags {
    billType: 'po' | 'pv';
    isGstBilled: boolean;
    storeGstOn: boolean;
}

const NEW_CONDITION_CODES = ['NEW'];

export function evalDocumentFlags(
    storeIsGstRegistered: boolean,
    gstToggle: boolean,
    vendorIsRegistered: boolean,
): DocumentFlags {
    const storeGstOn = storeIsGstRegistered && gstToggle;
    if (!storeGstOn) return { billType: 'pv', isGstBilled: false, storeGstOn: false };
    return {
        billType: vendorIsRegistered ? 'po' : 'pv',
        isGstBilled: true,
        storeGstOn: true,
    };
}

/** Margin scheme is PER ROW. Never derive it from the bill type alone. */
export function evalLineMargin(storeGstOn: boolean, vendorIsRegistered: boolean, conditionCode: string): boolean {
    if (!storeGstOn) return false;
    if (!vendorIsRegistered) return true;
    return !NEW_CONDITION_CODES.includes(conditionCode.trim().toUpperCase());
}

export interface UnitMoney {
    netRate: number;
    baseCost: number;
    landedCost: number;
    taxAmt: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function evalUnitMoney(
    cost: number,
    discPct: number,
    taxMode: TaxMode,
    taxPct: number,
    taxable: boolean,
): UnitMoney {
    const netRate = r2(cost - (cost * discPct) / 100);
    if (!taxable || taxPct <= 0) {
        return { netRate, baseCost: netRate, landedCost: netRate, taxAmt: 0 };
    }
    if (taxMode === 'I') {
        const landedCost = netRate;
        const baseCost = r2(landedCost / (1 + taxPct / 100));
        return { netRate, baseCost, landedCost, taxAmt: r2(landedCost - baseCost) };
    }
    const baseCost = netRate;
    const taxAmt = r2((baseCost * taxPct) / 100);
    return { netRate, baseCost, landedCost: r2(baseCost + taxAmt), taxAmt };
}

// ─── 2. Strict grouping ──────────────────────────────────────────────────────
// Group key covers EVERYTHING persisted at item level. Two rows merge only if
// they are interchangeable for GST, margin, valuation and inventory.

function groupKey(row: PurchaseRowInput, margin: boolean): string {
    if (row.product_variant_id == null) return `manual:${row.id}`; // ad-hoc rows never group
    return [
        `v:${row.product_variant_id}`,
        `s:${row.is_serialized ? 1 : 0}`,
        `c:${row.condition.trim().toUpperCase()}`,
        `m:${margin ? 1 : 0}`,
        `t:${row.taxMode}`,
        `p:${row.taxPercent}`,
        `u:${row.cost}`,
        `d:${row.discPercent}`,
    ].join('|');
}

const nullIfBlank = (s: string): string | null => (s.trim() === '' ? null : s.trim());
const numOrNull = (n: number): number | null => (Number.isFinite(n) && n > 0 ? n : null);
const batteryOrNull = (s: string): number | null => {
    const n = parseInt(s, 10);
    return s.trim() !== '' && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
};

export function groupRowsForSubmit(rows: PurchaseRowInput[], flags: DocumentFlags, vendorIsRegistered: boolean): SubmitLine[] {
    const order: string[] = [];
    const groups = new Map<string, PurchaseRowInput[]>();

    for (const row of rows) {
        const key = groupKey(row, evalLineMargin(flags.storeGstOn, vendorIsRegistered, row.condition));
        if (!groups.has(key)) {
            order.push(key);
            groups.set(key, []);
        }
        groups.get(key)!.push(row);
    }

    return order.map((key) => {
        const group = groups.get(key)!;
        const first = group[0];

        if (first.is_serialized) {
            return {
                product_variant_id: first.product_variant_id,
                manual_item_name: first.product_variant_id == null ? first.manual_item_name : null,
                manual_hsn: first.product_variant_id == null ? (first.manual_hsn ?? null) : null,
                is_serialized: true,
                tax_type: first.taxMode === 'I' ? 'inclusive' : 'exclusive',
                tax_pct: first.taxPercent,
                units: group.map(
                    (r): SubmitUnit => ({
                        imei1: nullIfBlank(r.imei1),
                        imei2: nullIfBlank(r.imei2),
                        serial_number: nullIfBlank(r.serial),
                        condition_code: r.condition.trim().toUpperCase(),
                        battery_health_pct: batteryOrNull(r.batteryHealth),
                        overall_health: nullIfBlank(r.quality),
                        warranty_mode: r.warrantyMode,
                        warranty_value: r.warrantyValue.trim(),
                        unit_cost: r.cost,
                        discount_pct: r.discPercent,
                        wholesale_price: numOrNull(r.wholesale),
                        selling_price: numOrNull(r.selling),
                    }),
                ),
                ordered_qty: null,
                unit_cost: null,
                discount_pct: null,
                wholesale_price: null,
                selling_price: null,
            };
        }

        const ordered_qty = group.reduce((s, r) => s + r.qty, 0);
        return {
            product_variant_id: first.product_variant_id,
            manual_item_name: first.product_variant_id == null ? first.manual_item_name : null,
            manual_hsn: first.product_variant_id == null ? (first.manual_hsn ?? null) : null,
            is_serialized: false,
            tax_type: first.taxMode === 'I' ? 'inclusive' : 'exclusive',
            tax_pct: first.taxPercent,
            units: [],
            ordered_qty,
            // group key guarantees identical cost/discount inside the group
            unit_cost: first.cost,
            discount_pct: first.discPercent,
            wholesale_price: numOrNull(first.wholesale),
            selling_price: numOrNull(first.selling),
        };
    });
}

// ─── 3. Payload + submit ─────────────────────────────────────────────────────

export function buildPurchasePayload(
    header: PurchaseHeaderInput,
    rows: PurchaseRowInput[],
    idempotencyKey: string = crypto.randomUUID(),
): PurchasePayload {
    if (header.partyId == null) throw new Error('Select a vendor before submitting.');
    if (rows.length === 0) throw new Error('Add at least one line item.');

    const flags = evalDocumentFlags(header.storeIsGstRegistered, header.gstToggle, header.vendorIsRegistered);

    // Client-side identifier hygiene (server re-validates + DB enforces).
    const seen = new Set<string>();
    for (const r of rows) {
        if (!r.is_serialized) continue;
        for (const id of [r.imei1, r.imei2, r.serial]) {
            const v = id.trim();
            if (v === '') continue;
            if (seen.has(v)) throw new Error(`Duplicate identifier in this purchase: ${v}`);
            seen.add(v);
        }
        if (r.imei1.trim() === '' && r.serial.trim() === '') {
            throw new Error('Every serialized unit needs IMEI 1 or a serial number.');
        }
    }

    return {
        idempotency_key: idempotencyKey,
        party_type: header.partyType,
        party_id: header.partyId,
        vendor_invoice_no: header.vendorInvoiceNo.trim() || null,
        order_date: header.orderDate,
        tax_movement: header.taxMovement,
        gst_toggle: header.gstToggle,
        additional_discount: header.additionalDiscount,
        shipping_charge: header.shippingCharge,
        auto_round_off: header.autoRoundOff,
        paid_amount: header.paidAmount,
        payment_mode: header.paymentMode,
        notes: header.notes.trim() || null,
        invoice_document_path: header.invoiceDocumentPath,
        additional_document_path: header.additionalDocumentPath,
        lines: groupRowsForSubmit(rows, flags, header.vendorIsRegistered),
    };
}

export interface SubmitOptions {
    onSuccess?: (purchase: Record<string, unknown>, replayed: boolean) => void;
    // Inertia validation errors are Record<string, string> (one message per field).
    onValidationError?: (errors: Record<string, string>) => void;
    onError?: (message: string) => void;
    preserveScroll?: boolean;
}

/**
 * Posts the payload with a typing-safe cast.
 *
 * Why the cast: Inertia's RequestPayload is Record<string, FormDataConvertible>
 * and nested arrays (lines[].units[]) are not FormDataConvertible, so passing
 * the typed payload directly is a compile error. Deriving the parameter type
 * from router.post itself keeps this correct across @inertiajs/react v1/v2.
 */
export function submitPurchase(url: string, payload: PurchasePayload, options: SubmitOptions = {}): void {
    type PostData = Parameters<typeof router.post>[1];

    router.post(url, payload as unknown as PostData, {
        preserveScroll: options.preserveScroll ?? true,
        onSuccess: (page) => {
            const props = page.props as unknown as {
                purchase?: Record<string, unknown>;
                replayed?: boolean;
            };
            options.onSuccess?.(props.purchase ?? {}, props.replayed ?? false);
        },
        onError: (errors) => {
            // A non-empty errors object means Laravel validation failed (422).
            if (errors && Object.keys(errors).length > 0) {
                options.onValidationError?.(errors);
            } else {
                options.onError?.('Could not save the purchase. Please try again.');
            }
        },
    });
}

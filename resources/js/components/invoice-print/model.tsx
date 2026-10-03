import type { ReactNode } from "react";
import type { PrintHsnRow, PrintInvoice, PrintInvoiceItem, PrintStore } from "./types";

/* ─── Formatting ──────────────────────────────────────────────────────────── */

export function fmt(n: number): string {
    return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 9.00 → "9", 9.50 → "9.5" */
export function trimRate(n: number): string {
    return String(Number(n.toFixed(2)));
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
    if (n < 20) return ONES[n];
    const o = n % 10;
    return TENS[Math.floor(n / 10)] + (o ? ` ${ONES[o]}` : "");
}

function threeDigits(n: number): string {
    const h = Math.floor(n / 100);
    const r = n % 100;
    return (h ? `${ONES[h]} Hundred${r ? " " : ""}` : "") + (r ? twoDigits(r) : "");
}

function intToWords(n: number): string {
    if (n === 0) return "Zero";
    const parts: string[] = [];
    const crore = Math.floor(n / 10000000);
    const lakh = Math.floor((n % 10000000) / 100000);
    const thousand = Math.floor((n % 100000) / 1000);
    const rest = n % 1000;
    if (crore) parts.push(`${threeDigits(crore)} Crore`);
    if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
    if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
    if (rest) parts.push(threeDigits(rest));
    return parts.join(" ");
}

export function amountInWords(amount: number): string {
    const abs = Math.abs(amount);
    let rupees = Math.floor(abs);
    let paise = Math.round((abs - rupees) * 100);
    if (paise === 100) { rupees += 1; paise = 0; } // 9.999 → 10.00, never "Paise One Hundred"
    let words = `Rupees ${intToWords(rupees)}`;
    if (paise > 0) words += ` and Paise ${twoDigits(paise)}`;
    return `${words} Only`;
}

/* ─── GST state codes (first 2 digits of GSTIN) ───────────────────────────── */

const GST_STATE_CODES: Record<string, string> = {
    "01": "JAMMU AND KASHMIR", "02": "HIMACHAL PRADESH", "03": "PUNJAB",
    "04": "CHANDIGARH", "05": "UTTARAKHAND", "06": "HARYANA", "07": "DELHI",
    "08": "RAJASTHAN", "09": "UTTAR PRADESH", "10": "BIHAR", "11": "SIKKIM",
    "12": "ARUNACHAL PRADESH", "13": "NAGALAND", "14": "MANIPUR",
    "15": "MIZORAM", "16": "TRIPURA", "17": "MEGHALAYA", "18": "ASSAM",
    "19": "WEST BENGAL", "20": "JHARKHAND", "21": "ODISHA",
    "22": "CHHATTISGARH", "23": "MADHYA PRADESH", "24": "GUJARAT",
    "26": "DADRA AND NAGAR HAVELI AND DAMAN AND DIU", "27": "MAHARASHTRA",
    "28": "ANDHRA PRADESH", "29": "KARNATAKA", "30": "GOA",
    "31": "LAKSHADWEEP", "32": "KERALA", "33": "TAMIL NADU",
    "34": "PUDUCHERRY", "35": "ANDAMAN AND NICOBAR ISLANDS", "36": "TELANGANA",
    "37": "ANDHRA PRADESH", "38": "LADAKH",
};

export function stateFromGstin(gstin: string | null | undefined): string | null {
    if (!gstin || gstin.length < 2) return null;
    const code = gstin.slice(0, 2);
    const name = GST_STATE_CODES[code];
    return name ? `${code}-${name}` : null;
}

/* ─── Model ───────────────────────────────────────────────────────────────── */

export interface Column {
    key: "idx" | "item" | "hsn" | "tax" | "qty" | "rate" | "disc" | "taxable" | "cgst" | "sgst" | "igst" | "amount";
    label: string;
    align: "left" | "right" | "center";
    width?: string;
    cell: (it: PrintInvoiceItem, index: number) => ReactNode;
}

export interface MetaField { label: string; value: string }
export interface SummaryRow { label: string; amount: number }

export interface HsnModel {
    rows: (PrintHsnRow & { rate: number })[];
    /** false on margin invoices — tax must not be shown explicitly. */
    taxCols: boolean;
    totalTaxable: number;
    totalTax: number;
    totalQty: number;
    totalValue: number;
}

export interface InvoiceModel {
    intra: boolean;
    showTaxCols: boolean;
    isBillOfSupply: boolean;
    isMarginInvoice: boolean;
    columns: Column[];
    qtyIdx: number;
    qtyTotal: number;
    summary: SummaryRow[];
    meta: MetaField[];
    notices: string[];
    hsn: HsnModel | null;
    placeOfSupply: string;
    partyState: string | null;
    hasBank: boolean;
    copyLabel: string;
}

export interface TemplateProps {
    invoice: PrintInvoice;
    store: PrintStore;
    m: InvoiceModel;
}

const Incl = () => (
    <span className="italic opacity-60" title="Tax included in price — margin scheme">incl.</span>
);

export function buildModel(invoice: PrintInvoice, store: PrintStore): InvoiceModel {
    const intra = invoice.is_intra_state;
    const hideTax = invoice.hide_tax;

    /* ── GST engine — display rules unchanged ────────────────────────────── */
    // On a margin invoice the tax is embedded in the price and must never
    // appear explicitly, so margin lines are excluded from every tax total.
    const taxableItems = hideTax ? invoice.items.filter((i) => !i.is_margin_scheme) : invoice.items;
    const sum = (pick: (i: PrintInvoiceItem) => number) => taxableItems.reduce((s, i) => s + pick(i), 0);
    const cgstTotal = sum((i) => i.cgst_amount);
    const sgstTotal = sum((i) => i.sgst_amount);
    const igstTotal = sum((i) => i.igst_amount);
    const taxableTotal = sum((i) => i.taxable_value);

    const anyMargin = invoice.items.some((i) => i.is_margin_scheme);
    const allMargin = invoice.items.length > 0 && invoice.items.every((i) => i.is_margin_scheme);
    const isBillOfSupply = !invoice.is_gst_billed;
    const isMarginInvoice = hideTax && anyMargin;
    // Tax columns are dropped on a fully-margin invoice; on a mixed invoice
    // they stay and margin lines read "incl.".
    const showTaxCols = invoice.is_gst_billed && !(hideTax && allMargin);
    const marginLine = (it: PrintInvoiceItem) => hideTax && it.is_margin_scheme;

    // "@ X%" only when every taxable line shares a rate, so the label can
    // never misstate a mixed-rate invoice.
    const rates = [...new Set(taxableItems.map((i) => i.tax_pct))];
    const uniformRate = rates.length === 1 ? rates[0] : null;
    const rateLabel = (r: number | null) => (r !== null ? ` @ ${trimRate(r)}%` : "");

    const hasItemDiscount = invoice.items.some((i) => i.discount_amount > 0);
    const qtyTotal = invoice.items.reduce((s, i) => s + Number(i.qty), 0);

    /* ── Columns ─────────────────────────────────────────────────────────── */
    const columns: Column[] = [
        { key: "idx", label: "#", align: "left", width: "2rem", cell: (_, i) => i + 1 },
        {
            key: "item", label: "Item", align: "left",
            cell: (it) => (
                <>
                    <p className="font-semibold">{it.product_name}</p>
                    {it.imeis.length > 0 && (
                        <p className="font-mono text-[0.92em] opacity-70">IMEI: {it.imeis.join(", ")}</p>
                    )}
                    {it.is_margin_scheme && <p className="text-[0.92em] italic opacity-70">Margin scheme</p>}
                    {it.warranty && <p className="text-[0.92em] opacity-70">Warranty: {it.warranty}</p>}
                </>
            ),
        },
        { key: "hsn", label: "HSN/SAC", align: "left", width: "4.75rem", cell: (it) => it.hsn_code ?? "—" },
    ];
    if (showTaxCols) {
        columns.push({
            key: "tax", label: "Tax", align: "right", width: "3rem",
            cell: (it) => (marginLine(it) ? <Incl /> : `${trimRate(it.tax_pct)}%`),
        });
    }
    columns.push(
        {
            key: "qty", label: "Qty", align: "right", width: "3.75rem",
            cell: (it) => `${it.qty}${it.unit ? ` ${it.unit}` : ""}`,
        },
        { key: "rate", label: "Rate/ Item", align: "right", width: "5rem", cell: (it) => fmt(it.unit_price) },
    );
    if (hasItemDiscount) {
        columns.push({ key: "disc", label: "Disc.", align: "right", width: "4.5rem", cell: (it) => fmt(it.discount_amount) });
    }
    // The taxable-value column is dropped when there is no tax to show: on a
    // Bill of Supply it only repeats the amount, and on a margin invoice it
    // could leak the margin the rule says must stay off the receipt.
    if (showTaxCols) {
        columns.push({
            key: "taxable", label: "Taxable Amt", align: "right", width: "5.5rem",
            cell: (it) => (marginLine(it) ? "—" : fmt(it.taxable_value)),
        });
    }
    if (showTaxCols && intra) {
        columns.push(
            { key: "cgst", label: "CGST", align: "right", width: "4.75rem", cell: (it) => (marginLine(it) ? <Incl /> : fmt(it.cgst_amount)) },
            { key: "sgst", label: "SGST", align: "right", width: "4.75rem", cell: (it) => (marginLine(it) ? <Incl /> : fmt(it.sgst_amount)) },
        );
    }
    if (showTaxCols && !intra) {
        columns.push({ key: "igst", label: "IGST", align: "right", width: "4.75rem", cell: (it) => (marginLine(it) ? <Incl /> : fmt(it.igst_amount)) });
    }
    columns.push({ key: "amount", label: "Amount", align: "right", width: "5.5rem", cell: (it) => <span className="font-semibold">{fmt(it.line_total)}</span> });

    /* ── Summary rows (rendered identically by every template) ───────────── */
    const summary: SummaryRow[] = [];
    const hasExtras = invoice.discount_amount > 0 || invoice.shipping_charge > 0 || invoice.round_off !== 0;
    if (showTaxCols) summary.push({ label: "Taxable Amount", amount: taxableTotal });
    else if (hasExtras) summary.push({ label: "Sub Total", amount: invoice.subtotal });
    if (invoice.discount_amount > 0) summary.push({ label: "Discount", amount: -invoice.discount_amount });
    if (invoice.shipping_charge > 0) summary.push({ label: "Shipping", amount: invoice.shipping_charge });
    if (showTaxCols && intra) {
        summary.push({ label: `CGST${rateLabel(uniformRate !== null ? uniformRate / 2 : null)}`, amount: cgstTotal });
        summary.push({ label: `SGST${rateLabel(uniformRate !== null ? uniformRate / 2 : null)}`, amount: sgstTotal });
    }
    if (showTaxCols && !intra) summary.push({ label: `IGST${rateLabel(uniformRate)}`, amount: igstTotal });
    if (isBillOfSupply && invoice.tax_amount !== 0) summary.push({ label: "Tax", amount: invoice.tax_amount });
    if (invoice.round_off !== 0) summary.push({ label: "Round Off", amount: invoice.round_off });

    /* ── Place of supply ─────────────────────────────────────────────────── */
    const partyState = invoice.party_state ?? stateFromGstin(invoice.party_gstin);
    const placeOfSupply =
        invoice.place_of_supply ??
        (intra
            ? store.state || stateFromGstin(store.gstin) || "Intra-State"
            : stateFromGstin(invoice.party_gstin) || "Inter-State");

    /* ── Header meta ─────────────────────────────────────────────────────── */
    const meta: MetaField[] = [
        { label: "Invoice #", value: invoice.invoice_number },
        { label: "Invoice Date", value: invoice.invoice_date },
    ];
    if (invoice.due_date) meta.push({ label: "Due Date", value: invoice.due_date });
    meta.push(
        { label: "Place of Supply", value: placeOfSupply },
        { label: "Type", value: invoice.invoice_type === "wholesale" ? "Wholesale" : "Retail" },
    );
    if (invoice.is_gst_billed && invoice.buyer_kind === "B2B") {
        meta.push({ label: "Reverse Charge", value: invoice.reverse_charge ? "Yes" : "No" });
    }
    if (invoice.eway_bill_no) meta.push({ label: "E-Way Bill #", value: invoice.eway_bill_no });
    if (invoice.vehicle_no) meta.push({ label: "Vehicle #", value: invoice.vehicle_no });

    /* ── Legal endorsements ──────────────────────────────────────────────── */
    const notices: string[] = [];
    if (isBillOfSupply) {
        notices.push("Bill of Supply — no GST has been charged on this supply.");
    }
    if (isMarginInvoice) {
        notices.push(
            allMargin
                ? "Margin Scheme (Rule 32(5), CGST Rules, 2017): tax is included in the price and is not shown separately. Input tax credit is not available on this invoice."
                : "Items marked “Margin scheme” are supplied under Rule 32(5), CGST Rules, 2017: tax is included in their price, and no input tax credit is available on those items.",
        );
    }

    /* ── HSN summary — S2/S4/S5 mandatory (B2B), S3 optional, never S1 ───── */
    const hsn: HsnModel | null =
        invoice.show_hsn_summary && invoice.hsn_summary.length > 0
            ? {
                rows: invoice.hsn_summary.map((h) => ({
                    ...h,
                    rate: h.taxable_value ? (h.tax_amount / h.taxable_value) * 100 : 0,
                })),
                taxCols: !hideTax,
                totalTaxable: invoice.hsn_summary.reduce((s, h) => s + h.taxable_value, 0),
                totalTax: invoice.hsn_summary.reduce((s, h) => s + h.tax_amount, 0),
                totalQty: invoice.hsn_summary.reduce((s, h) => s + Number(h.qty), 0),
                totalValue: invoice.hsn_summary.reduce((s, h) => s + h.line_total, 0),
            }
            : null;

    return {
        intra,
        showTaxCols,
        isBillOfSupply,
        isMarginInvoice,
        columns,
        qtyIdx: columns.findIndex((c) => c.key === "qty"),
        qtyTotal,
        summary,
        meta,
        notices,
        hsn,
        placeOfSupply,
        partyState,
        hasBank: Boolean(store.bank_name || store.bank_account_number || store.bank_ifsc || store.bank_upi_id || store.upi_qr_url),
        copyLabel: invoice.copy_label || "ORIGINAL FOR RECIPIENT",
    };
}

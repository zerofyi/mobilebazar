/* ─── Props serialized by SaleEntryController@print ───────────────────────────
 * Everything added on top of the original contract is OPTIONAL, so the current
 * controller keeps working. Fill the extras when you have them and every
 * template picks them up automatically.
 * ─────────────────────────────────────────────────────────────────────────── */

export type TemplateKey = "classic" | "modern" | "corporate" | "minimal" | "receipt";

export interface PrintInvoiceItem {
    product_name: string;
    hsn_code: string | null;
    qty: number;
    unit_price: number;
    discount_amount: number;
    taxable_value: number;
    tax_pct: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    line_total: number;
    is_margin_scheme: boolean;
    warranty: string | null;
    imeis: string[];
    /** e.g. "NOS", "PCS", "KG". Printed after the quantity when present. */
    unit?: string | null;
}

export interface PrintHsnRow {
    hsn_code: string;
    qty: number;
    taxable_value: number;
    tax_amount: number;
    line_total: number;
}

export interface PrintInvoice {
    invoice_number: string;
    invoice_date: string;
    invoice_type: string;
    is_intra_state: boolean;
    is_gst_billed: boolean;
    party_name: string;
    party_phone: string | null;
    party_gstin: string | null;
    party_type: "customer" | "supplier" | null;
    payment_mode: string;
    payment_status: string;
    subtotal: number;
    discount_amount: number;
    shipping_charge: number;
    tax_amount: number;
    round_off: number;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    notes: string | null;
    /** S1–S5 document classification (SaleGstEvaluationService::documentType). */
    document_code: string;
    document_label: string;
    buyer_kind: "B2C" | "B2B";
    itc_eligible: boolean;
    show_hsn_summary: boolean;
    /** Margin-scheme invoices must NOT show tax explicitly on the receipt. */
    hide_tax: boolean;
    items: PrintInvoiceItem[];
    hsn_summary: PrintHsnRow[];

    /* ── optional extras ── */
    party_address?: string | null;
    /** e.g. "19-WEST BENGAL". Falls back to the GSTIN's state code. */
    party_state?: string | null;
    shipping_address?: string | null;
    due_date?: string | null;
    /** Overrides the derived place of supply (needed for B2C inter-state delivery). */
    place_of_supply?: string | null;
    reverse_charge?: boolean;
    /** "ORIGINAL FOR RECIPIENT" (default) / "DUPLICATE FOR TRANSPORTER" / "TRIPLICATE FOR SUPPLIER". */
    copy_label?: string | null;
    /** E-invoice (IRP) details. */
    irn?: string | null;
    ack_no?: string | null;
    ack_date?: string | null;
    /** Signed QR as an image URL or data: URI (render it server-side). */
    irn_qr?: string | null;
    eway_bill_no?: string | null;
    vehicle_no?: string | null;
}

export interface PrintStore {
    name: string;
    address: string | null;
    state: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
    bank_name: string | null;
    bank_account_holder_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_upi_id: string | null;

    /* ── optional extras ── */
    pan?: string | null;
    logo_url?: string | null;
    signature_url?: string | null;
    /** Payment QR image (URL or data: URI). */
    upi_qr_url?: string | null;
    /** Accent colour for the "modern" template, e.g. "#1d4ed8". */
    brand_color?: string | null;
    /** Which design to print. Falls back to "classic". */
    invoice_template?: TemplateKey | null;
    /** Overrides the default terms & conditions. */
    terms?: string[] | null;
}

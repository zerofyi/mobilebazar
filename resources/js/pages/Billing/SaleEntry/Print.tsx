import { Head } from "@inertiajs/react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Props (serialized by SaleEntryController@print) ─────────────────────── */

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
}

export interface PrintStore {
    name: string;
    address: string | null;
    phone: string | null;
    email: string | null;
    gstin: string | null;
}

interface Props {
    invoice: PrintInvoice;
    store: PrintStore;
}

/* ─── Amount in words (Indian numbering) ──────────────────────────────────── */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
    "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
    if (n < 20) return ONES[n];
    const t = Math.floor(n / 10);
    const o = n % 10;
    return TENS[t] + (o ? ` ${ONES[o]}` : "");
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
    const rupees = Math.floor(Math.abs(amount));
    const paise = Math.round((Math.abs(amount) - rupees) * 100);
    let words = `Rupees ${intToWords(rupees)}`;
    if (paise > 0) words += ` and Paise ${twoDigits(paise)}`;
    return `${words} Only`;
}

function fmt(n: number): string {
    return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function SalePrint({ invoice, store }: Props) {
    const intra = invoice.is_intra_state;
    // Displayed tax totals exclude margin-scheme lines: on a margin invoice the
    // tax is embedded in the price and must never appear explicitly.
    const taxableItems = invoice.hide_tax ? invoice.items.filter((i) => !i.is_margin_scheme) : invoice.items;
    const cgstTotal = taxableItems.reduce((s, i) => s + i.cgst_amount, 0);
    const sgstTotal = taxableItems.reduce((s, i) => s + i.sgst_amount, 0);
    const igstTotal = taxableItems.reduce((s, i) => s + i.igst_amount, 0);
    const allMargin = invoice.items.length > 0 && invoice.items.every((i) => i.is_margin_scheme);
    // Tax columns are dropped entirely on a fully-margin invoice; on a mixed
    // invoice they stay and margin lines read "incl.".
    const showTaxCols = invoice.is_gst_billed && !(invoice.hide_tax && allMargin);
    const taxCell = (it: PrintInvoiceItem, amount: number) =>
        invoice.hide_tax && it.is_margin_scheme ? (
            <span className="italic text-neutral-500" title="Tax included in price — margin scheme">incl.</span>
        ) : (
            fmt(amount)
        );

    return (
        <>
            <Head title={`Invoice ${invoice.invoice_number}`} />
            <div className="min-h-screen bg-muted/40 p-4 print:bg-white print:p-0">
                <div className="mx-auto mb-4 flex max-w-4xl justify-end print:hidden">
                    <Button onClick={() => window.print()}>
                        <Printer className="size-4 mr-2" /> Print
                    </Button>
                </div>

                <div className="mx-auto max-w-4xl border border-black bg-white text-black text-[13px] print:border-black">
                    {/* Store header */}
                    <div className="border-b-2 border-black p-4 text-center">
                        <h1 className="text-2xl font-bold">{store.name}</h1>
                        {store.address && <p className="mt-0.5 text-xs">{store.address}</p>}
                        <p className="mt-0.5 text-xs">
                            {store.phone && <span>Ph: {store.phone} </span>}
                            {store.email && <span>· Email: {store.email} </span>}
                        </p>
                        {store.gstin && <p className="mt-0.5 text-xs font-semibold">GSTIN: {store.gstin}</p>}
                    </div>

                    <div className="border-b border-black py-1 text-center text-sm font-bold tracking-widest uppercase">
                        {invoice.document_label}
                    </div>

                    {/* Meta + party */}
                    <div className="grid grid-cols-2 border-b border-black text-xs">
                        <div className="border-r border-black p-3">
                            <p><span className="font-semibold">Invoice No:</span> {invoice.invoice_number}</p>
                            <p className="mt-1"><span className="font-semibold">Date:</span> {invoice.invoice_date}</p>
                            <p className="mt-1"><span className="font-semibold">Type:</span> {invoice.invoice_type === "wholesale" ? "Wholesale" : "Retail"}</p>
                            <p className="mt-1"><span className="font-semibold">Payment:</span> {invoice.payment_mode} ({invoice.payment_status})</p>
                        </div>
                        <div className="p-3">
                            <p className="font-semibold">Billed To ({invoice.party_type === "supplier" ? "Party" : "Customer"}):</p>
                            <p className="mt-0.5 font-medium">{invoice.party_name}</p>
                            {invoice.party_phone && <p>Ph: {invoice.party_phone}</p>}
                            {invoice.party_gstin && <p>GSTIN: {invoice.party_gstin}</p>}
                        </div>
                    </div>

                    {/* Items */}
                    <table className="w-full border-b border-black text-xs">
                        <thead>
                            <tr className="border-b border-black bg-neutral-100 print:bg-neutral-100">
                                <th className="border-r border-black px-1.5 py-1.5 text-left w-8">#</th>
                                <th className="border-r border-black px-1.5 py-1.5 text-left">Description</th>
                                <th className="border-r border-black px-1.5 py-1.5 w-16">HSN</th>
                                <th className="border-r border-black px-1.5 py-1.5 text-right w-12">Qty</th>
                                <th className="border-r border-black px-1.5 py-1.5 text-right w-20">Rate</th>
                                <th className="border-r border-black px-1.5 py-1.5 text-right w-20">Taxable</th>
                                {showTaxCols && intra && (
                                    <>
                                        <th className="border-r border-black px-1.5 py-1.5 text-right w-20">CGST</th>
                                        <th className="border-r border-black px-1.5 py-1.5 text-right w-20">SGST</th>
                                    </>
                                )}
                                {showTaxCols && !intra && (
                                    <th className="border-r border-black px-1.5 py-1.5 text-right w-20">IGST</th>
                                )}
                                <th className="px-1.5 py-1.5 text-right w-24">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoice.items.map((it, i) => (
                                <tr key={i} className="border-b border-neutral-300 align-top">
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5">{i + 1}</td>
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5">
                                        <p className="font-medium">{it.product_name}</p>
                                        {it.imeis.length > 0 && (
                                            <p className="font-mono text-[11px] text-neutral-600">IMEI: {it.imeis.join(", ")}</p>
                                        )}
                                        {it.is_margin_scheme && <p className="text-[11px] italic text-neutral-600">Margin scheme</p>}
                                        {it.warranty && <p className="text-[11px] text-neutral-600">Warranty: {it.warranty}</p>}
                                    </td>
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5">{it.hsn_code ?? "—"}</td>
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{it.qty}</td>
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(it.unit_price)}</td>
                                    <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(it.taxable_value)}</td>
                                    {showTaxCols && intra && (
                                        <>
                                            <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{taxCell(it, it.cgst_amount)}</td>
                                            <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{taxCell(it, it.sgst_amount)}</td>
                                        </>
                                    )}
                                    {showTaxCols && !intra && (
                                        <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{taxCell(it, it.igst_amount)}</td>
                                    )}
                                    <td className="px-1.5 py-1.5 text-right font-medium">{fmt(it.line_total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* HSN-wise summary — S2/S4/S5 (mandatory for B2B), optional S3, never S1.
                        Tax columns are omitted on margin invoices (hide_tax). */}
                    {invoice.show_hsn_summary && invoice.hsn_summary.length > 0 && (
                        <table className="w-full border-b border-black text-xs">
                            <thead>
                                <tr className="border-b border-black bg-neutral-100 print:bg-neutral-100">
                                    <th className="border-r border-black px-1.5 py-1.5 text-left">HSN</th>
                                    <th className="border-r border-black px-1.5 py-1.5 text-right w-16">Qty</th>
                                    <th className="border-r border-black px-1.5 py-1.5 text-right w-24">Taxable Value</th>
                                    {!invoice.hide_tax && intra && (
                                        <>
                                            <th className="border-r border-black px-1.5 py-1.5 text-right w-20">CGST</th>
                                            <th className="border-r border-black px-1.5 py-1.5 text-right w-20">SGST</th>
                                        </>
                                    )}
                                    {!invoice.hide_tax && !intra && (
                                        <th className="border-r border-black px-1.5 py-1.5 text-right w-20">IGST</th>
                                    )}
                                    <th className="px-1.5 py-1.5 text-right w-24">Total Value</th>
                                </tr>
                            </thead>
                            <tbody>
                                {invoice.hsn_summary.map((h, i) => (
                                    <tr key={i} className="border-b border-neutral-300">
                                        <td className="border-r border-neutral-300 px-1.5 py-1.5">{h.hsn_code}</td>
                                        <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{h.qty}</td>
                                        <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(h.taxable_value)}</td>
                                        {!invoice.hide_tax && intra && (
                                            <>
                                                <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(h.tax_amount / 2)}</td>
                                                <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(h.tax_amount / 2)}</td>
                                            </>
                                        )}
                                        {!invoice.hide_tax && !intra && (
                                            <td className="border-r border-neutral-300 px-1.5 py-1.5 text-right">{fmt(h.tax_amount)}</td>
                                        )}
                                        <td className="px-1.5 py-1.5 text-right font-medium">{fmt(h.line_total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Totals */}
                    <div className="grid grid-cols-2 text-xs">
                        <div className="border-r border-black p-3">
                            <p className="font-semibold">Amount in words:</p>
                            <p className="mt-1 italic">{amountInWords(invoice.grand_total)}</p>
                            {invoice.notes && (
                                <>
                                    <p className="mt-3 font-semibold">Notes:</p>
                                    <p className="mt-0.5 whitespace-pre-wrap">{invoice.notes}</p>
                                </>
                            )}
                        </div>
                        <div className="p-3">
                            <div className="flex justify-between py-0.5"><span>Subtotal</span><span>{fmt(invoice.subtotal)}</span></div>
                            {invoice.discount_amount > 0 && (
                                <div className="flex justify-between py-0.5"><span>Discount</span><span>− {fmt(invoice.discount_amount)}</span></div>
                            )}
                            {invoice.shipping_charge > 0 && (
                                <div className="flex justify-between py-0.5"><span>Shipping</span><span>+ {fmt(invoice.shipping_charge)}</span></div>
                            )}
                            {showTaxCols && intra && (
                                <>
                                    <div className="flex justify-between py-0.5"><span>CGST</span><span>{fmt(cgstTotal)}</span></div>
                                    <div className="flex justify-between py-0.5"><span>SGST</span><span>{fmt(sgstTotal)}</span></div>
                                </>
                            )}
                            {showTaxCols && !intra && (
                                <div className="flex justify-between py-0.5"><span>IGST</span><span>{fmt(igstTotal)}</span></div>
                            )}
                            {!invoice.is_gst_billed && (
                                <div className="flex justify-between py-0.5"><span>Tax</span><span>{fmt(invoice.tax_amount)}</span></div>
                            )}
                            {invoice.round_off !== 0 && (
                                <div className="flex justify-between py-0.5"><span>Round off</span><span>{fmt(invoice.round_off)}</span></div>
                            )}
                            <div className="mt-1 flex justify-between border-t border-black pt-1 text-sm font-bold">
                                <span>Grand Total</span><span>₹ {fmt(invoice.grand_total)}</span>
                            </div>
                            <div className="mt-1 flex justify-between py-0.5"><span>Paid</span><span>{fmt(invoice.paid_amount)}</span></div>
                            <div className="flex justify-between py-0.5 font-semibold"><span>Due</span><span>{fmt(invoice.due_amount)}</span></div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="grid grid-cols-2 border-t border-black p-3 text-[11px] text-neutral-600">
                        <div>
                            <p className="font-semibold text-black">Terms:</p>
                            <p>1. Goods once sold will not be taken back.</p>
                            <p>2. Warranty as per manufacturer / device condition at sale.</p>
                        </div>
                        <div className="text-right">
                            <p className="font-semibold text-black">For {store.name}</p>
                            <div className="h-12" />
                            <p>Authorised Signatory</p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

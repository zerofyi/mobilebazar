import type { TemplateProps } from "./model";
import { amountInWords, fmt, trimRate } from "./model";
import { Logo, Notices, PrintStyles } from "./parts";

/** Design 5 — Receipt: 80 mm thermal roll for counter sales (S1, S2, S3). */
const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

export default function Receipt({ invoice, store, m }: TemplateProps) {
    const hideLineTax = invoice.hide_tax;

    return (
        <>
            <PrintStyles size="80mm auto" margin="2mm" />
            <div
                className="mx-auto w-[80mm] bg-white p-3 text-[11px] leading-snug tabular-nums text-black print:w-[76mm] print:p-0"
                style={{ fontFamily: '"Courier New", ui-monospace, monospace' }}
            >
                <header className="text-center">
                    <div className="flex justify-center"><Logo store={store} className="mb-1 h-10 w-auto object-contain grayscale" /></div>
                    <p className="text-[14px] font-bold">{store.name}</p>
                    {store.address && <p className="whitespace-pre-line">{store.address}</p>}
                    {store.phone && <p>Ph: {store.phone}</p>}
                    {store.gstin && <p>GSTIN: {store.gstin}</p>}
                </header>

                <Rule />
                <p className="text-center text-[12px] font-bold uppercase">{invoice.document_label}</p>
                <div className="mt-1 flex justify-between"><span>No: {invoice.invoice_number}</span><span>{invoice.invoice_date}</span></div>
                <p>To: {invoice.party_name}</p>
                {invoice.party_phone && <p>Ph: {invoice.party_phone}</p>}
                {invoice.party_gstin && <p>GSTIN: {invoice.party_gstin}</p>}
                {invoice.is_gst_billed && <p>POS: {m.placeOfSupply}</p>}
                <Rule />

                {/* Items */}
                <div className="flex justify-between font-bold"><span>Item</span><span>Amount</span></div>
                {invoice.items.map((it, i) => (
                    <div key={i} className="no-break mt-1">
                        <p className="font-semibold">{i + 1}. {it.product_name}</p>
                        {it.imeis.length > 0 && <p className="break-all pl-3 text-[10px]">IMEI: {it.imeis.join(", ")}</p>}
                        {it.warranty && <p className="pl-3 text-[10px]">Warranty: {it.warranty}</p>}
                        <div className="flex justify-between pl-3">
                            <span>
                                {it.qty}{it.unit ? ` ${it.unit}` : ""} x {fmt(it.unit_price)}
                                {m.showTaxCols && !(hideLineTax && it.is_margin_scheme) && ` (${trimRate(it.tax_pct)}%)`}
                            </span>
                            <span className="font-semibold">{fmt(it.line_total)}</span>
                        </div>
                        {it.hsn_code && m.showTaxCols && <p className="pl-3 text-[10px]">HSN: {it.hsn_code}</p>}
                        {it.is_margin_scheme && <p className="pl-3 text-[10px] italic">Margin scheme</p>}
                    </div>
                ))}
                <Rule />

                {/* Summary — same rows (and margin-tax suppression) as the A4 designs */}
                <div className="flex justify-between"><span>Total Qty</span><span>{m.qtyTotal}</span></div>
                {m.summary.map((r) => (
                    <div key={r.label} className="flex justify-between"><span>{r.label}</span><span>{fmt(r.amount)}</span></div>
                ))}
                <div className="mt-1 flex justify-between border-y border-black py-1 text-[14px] font-bold">
                    <span>TOTAL</span><span>₹ {fmt(invoice.grand_total)}</span>
                </div>
                <p className="mt-1 text-[10px]">{amountInWords(invoice.grand_total)}</p>

                {/* HSN summary (compact) */}
                {m.hsn && (
                    <>
                        <Rule />
                        <div className="flex justify-between font-bold">
                            <span>HSN</span>
                            <span>{m.hsn.taxCols ? "Taxable" : "Value"}</span>
                            {m.hsn.taxCols && <span>Tax</span>}
                        </div>
                        {m.hsn.rows.map((r, i) => (
                            <div key={i} className="flex justify-between">
                                <span>{r.hsn_code}</span>
                                <span>{fmt(m.hsn!.taxCols ? r.taxable_value : r.line_total)}</span>
                                {m.hsn!.taxCols && <span>{fmt(r.tax_amount)}</span>}
                            </div>
                        ))}
                    </>
                )}

                <Rule />
                <div className="no-break">
                    {invoice.due_amount <= 0 ? (
                        <p className="text-center font-bold">PAID — ₹ {fmt(invoice.paid_amount)} via {invoice.payment_mode}</p>
                    ) : (
                        <>
                            <p>Paid: ₹ {fmt(invoice.paid_amount)} via {invoice.payment_mode}</p>
                            <p className="text-[13px] font-bold">BALANCE DUE: ₹ {fmt(invoice.due_amount)}</p>
                        </>
                    )}
                </div>

                <Notices m={m} className="mt-2 space-y-1 text-[10px] italic" />

                <Rule />
                <footer className="text-center">
                    <p className="whitespace-pre-wrap">{invoice.notes ?? "Thank you! Visit again."}</p>
                    <p className="mt-1 text-[10px]">Goods once sold cannot be taken back or exchanged.</p>
                </footer>
            </div>
        </>
    );
}

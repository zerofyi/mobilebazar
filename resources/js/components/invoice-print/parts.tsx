import { amountInWords, fmt, trimRate } from "./model";
import type { InvoiceModel } from "./model";
import type { PrintInvoice, PrintStore } from "./types";

/* ─── Print CSS ───────────────────────────────────────────────────────────── */

export function PrintStyles({ size, margin }: { size: string; margin: string }) {
    return (
        <style>{`
            @page { size: ${size}; margin: ${margin}; }
            @media print {
                :root, html, html.dark, body, #app {
                    background: #fff !important;
                    color: #000 !important;
                    color-scheme: light !important;
                }
                footer{ display: none !important; }
                * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                thead { display: table-header-group; }
                tr, .no-break { break-inside: avoid; }
            }
        `}</style>
    );
}

/* ─── Themeable tables ────────────────────────────────────────────────────── */

export interface TableTheme {
    table: string;
    headRow: string;
    th: string;
    bodyRow: string;
    td: string;
    /** In-table summary rows (only used when withSummary). */
    sum: string;
    total: string;
    /** Applied to every cell except the last in a row (vertical rules). */
    sep: string;
}

const alignClass = (a: "left" | "right" | "center") =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

export function ItemsTable({
    invoice, m, t, withSummary = true,
}: { invoice: PrintInvoice; m: InvoiceModel; t: TableTheme; withSummary?: boolean }) {
    const cols = m.columns;
    const last = cols.length - 1;
    const cell = (i: number, base: string, extra = "") => [base, extra, i < last ? t.sep : ""].filter(Boolean).join(" ");

    return (
        <table className={`w-full tabular-nums ${t.table}`}>
            <thead>
                <tr className={t.headRow}>
                    {cols.map((c, i) => (
                        <th key={c.key} style={{ width: c.width }} className={cell(i, t.th, alignClass(c.align))}>
                            {c.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {invoice.items.map((it, r) => (
                    <tr key={r} className={`${t.bodyRow} align-top`}>
                        {cols.map((c, i) => (
                            <td key={c.key} className={cell(i, t.td, alignClass(c.align))}>{c.cell(it, r)}</td>
                        ))}
                    </tr>
                ))}

                {withSummary && (
                    <>
                        {m.summary.map((row) => (
                            <tr key={row.label} className={t.sum}>
                                <td colSpan={last} className={cell(0, t.td, "text-right italic")}>{row.label}</td>
                                <td className={`${t.td} text-right`}>{fmt(row.amount)}</td>
                            </tr>
                        ))}
                        <tr className={t.total}>
                            <td colSpan={m.qtyIdx} className={cell(0, t.td, "text-right")}>Total</td>
                            <td className={cell(0, t.td, "text-right")}>
                                {m.qtyTotal.toLocaleString("en-IN", { maximumFractionDigits: 3 })}
                            </td>
                            <td colSpan={cols.length - m.qtyIdx - 2} className={cell(0, t.td)} />
                            <td className={`${t.td} text-right`}>₹ {fmt(invoice.grand_total)}</td>
                        </tr>
                    </>
                )}
            </tbody>
        </table>
    );
}

export function HsnTable({ m, t }: { m: InvoiceModel; t: TableTheme }) {
    const h = m.hsn;
    if (!h) return null;
    const tax = h.taxCols;
    const rs = tax ? 2 : 1;
    const th = (extra = "") => `${t.th} ${extra}`;
    const sep = t.sep;

    return (
        <table className={`w-full tabular-nums ${t.table}`}>
            <thead>
                <tr className={t.headRow}>
                    <th rowSpan={rs} className={th(`text-left align-bottom ${sep}`)}>HSN/SAC</th>
                    {!tax && <th rowSpan={rs} className={th(`text-right align-bottom ${sep}`)}>Qty</th>}
                    <th rowSpan={rs} className={th(`text-right align-bottom ${sep}`)}>{tax ? "Taxable Value" : "Value"}</th>
                    {tax && m.intra && (
                        <>
                            <th colSpan={2} className={th(`text-center ${sep}`)}>Central Tax</th>
                            <th colSpan={2} className={th(`text-center ${sep}`)}>State Tax</th>
                        </>
                    )}
                    {tax && !m.intra && <th colSpan={2} className={th(`text-center ${sep}`)}>Integrated Tax</th>}
                    {tax && <th rowSpan={rs} className={th("text-right align-bottom")}>Total Tax Amount</th>}
                </tr>
                {tax && (
                    <tr className={t.headRow}>
                        {(m.intra ? [0, 1] : [0]).map((k) => (
                            <th key={k} colSpan={2} className="p-0">
                                <div className="flex">
                                    <span className={`${t.th} w-1/2 text-center ${sep}`}>Rate</span>
                                    <span className={`${t.th} w-1/2 text-right ${sep}`}>Amount</span>
                                </div>
                            </th>
                        ))}
                    </tr>
                )}
            </thead>
            <tbody>
                {h.rows.map((r, i) => (
                    <tr key={i} className={t.bodyRow}>
                        <td className={`${t.td} ${sep}`}>{r.hsn_code}</td>
                        {!tax && <td className={`${t.td} text-right ${sep}`}>{r.qty}</td>}
                        <td className={`${t.td} text-right ${sep}`}>{fmt(tax ? r.taxable_value : r.line_total)}</td>
                        {tax && m.intra && (
                            <>
                                <td className={`${t.td} text-center ${sep}`}>{trimRate(r.rate / 2)}%</td>
                                <td className={`${t.td} text-right ${sep}`}>{fmt(r.tax_amount / 2)}</td>
                                <td className={`${t.td} text-center ${sep}`}>{trimRate(r.rate / 2)}%</td>
                                <td className={`${t.td} text-right ${sep}`}>{fmt(r.tax_amount / 2)}</td>
                            </>
                        )}
                        {tax && !m.intra && (
                            <>
                                <td className={`${t.td} text-center ${sep}`}>{trimRate(r.rate)}%</td>
                                <td className={`${t.td} text-right ${sep}`}>{fmt(r.tax_amount)}</td>
                            </>
                        )}
                        {tax && <td className={`${t.td} text-right font-semibold`}>{fmt(r.tax_amount)}</td>}
                    </tr>
                ))}
                <tr className={`${t.total} font-bold`}>
                    <td className={`${t.td} text-right ${sep}`}>TOTAL</td>
                    {!tax && <td className={`${t.td} text-right ${sep}`}>{h.totalQty}</td>}
                    <td className={`${t.td} text-right ${sep}`}>{fmt(tax ? h.totalTaxable : h.totalValue)}</td>
                    {tax && m.intra && (
                        <>
                            <td className={`${t.td} ${sep}`} />
                            <td className={`${t.td} text-right ${sep}`}>{fmt(h.totalTax / 2)}</td>
                            <td className={`${t.td} ${sep}`} />
                            <td className={`${t.td} text-right ${sep}`}>{fmt(h.totalTax / 2)}</td>
                        </>
                    )}
                    {tax && !m.intra && (
                        <>
                            <td className={`${t.td} ${sep}`} />
                            <td className={`${t.td} text-right ${sep}`}>{fmt(h.totalTax)}</td>
                        </>
                    )}
                    {tax && <td className={`${t.td} text-right`}>{fmt(h.totalTax)}</td>}
                </tr>
            </tbody>
        </table>
    );
}

/* ─── Totals stack (for templates that keep totals outside the table) ─────── */

export function TotalsBox({
    invoice, m, cls,
}: {
    invoice: PrintInvoice;
    m: InvoiceModel;
    cls: { wrap: string; row: string; grand: string };
}) {
    return (
        <div className={`tabular-nums ${cls.wrap}`}>
            <div className={cls.row}>
                <span>Total Qty</span>
                <span>{m.qtyTotal.toLocaleString("en-IN", { maximumFractionDigits: 3 })}</span>
            </div>
            {m.summary.map((r) => (
                <div key={r.label} className={cls.row}>
                    <span>{r.label}</span>
                    <span>{fmt(r.amount)}</span>
                </div>
            ))}
            <div className={cls.grand}>
                <span>Total</span>
                <span>₹ {fmt(invoice.grand_total)}</span>
            </div>
        </div>
    );
}

/* ─── Small blocks ────────────────────────────────────────────────────────── */

export function AmountWords({ amount, className = "" }: { amount: number; className?: string }) {
    return (
        <p className={className}>
            Amount Chargeable (in words): <span className="font-semibold">{amountInWords(amount)}</span>
        </p>
    );
}

export function Notices({ m, className = "" }: { m: InvoiceModel; className?: string }) {
    if (m.notices.length === 0) return null;
    return (
        <div className={`no-break ${className}`}>
            {m.notices.map((n) => <p key={n}>{n}</p>)}
        </div>
    );
}

/** Seller details beneath the store name. */
export function SellerDetails({ store, className = "" }: { store: PrintStore; className?: string }) {
    return (
        <div className={className}>
            {store.address && <p className="whitespace-pre-line">{store.address}</p>}
            {store.gstin && <p><span className="font-semibold">GSTIN:</span> {store.gstin}</p>}
            {store.pan && <p><span className="font-semibold">PAN:</span> {store.pan}</p>}
            {(store.phone || store.email) && (
                <p>
                    {store.phone && <>Mobile: {store.phone}</>}
                    {store.phone && store.email && "  |  "}
                    {store.email && <>Email: {store.email}</>}
                </p>
            )}
        </div>
    );
}

/** Buyer details beneath the "Bill To" caption. */
export function PartyDetails({ invoice, m, nameClass = "font-bold", className = "" }: {
    invoice: PrintInvoice; m: InvoiceModel; nameClass?: string; className?: string;
}) {
    return (
        <div className={className}>
            <p className={nameClass}>{invoice.party_name}</p>
            {invoice.party_address && <p className="whitespace-pre-line">{invoice.party_address}</p>}
            {invoice.party_phone && <p>Ph: {invoice.party_phone}</p>}
            {invoice.party_gstin && <p><span className="font-semibold">GSTIN:</span> {invoice.party_gstin}</p>}
            {invoice.party_gstin && m.partyState && <p><span className="font-semibold">State:</span> {m.partyState}</p>}
        </div>
    );
}

export function Logo({ store, className = "h-14 w-auto object-contain" }: { store: PrintStore; className?: string }) {
    if (!store.logo_url) return null;
    return <img src={store.logo_url} alt={`${store.name} logo`} className={className} />;
}

export function PaymentLine({ invoice, className = "" }: { invoice: PrintInvoice; className?: string }) {
    return (
        <div className={`no-break ${className}`}>
            {invoice.due_amount <= 0 ? (
                <>
                    <p className="font-extrabold">✓ Amount Paid</p>
                    <p className="mt-0.5 font-semibold">₹ {fmt(invoice.paid_amount)} Paid via {invoice.payment_mode}</p>
                </>
            ) : (
                <>
                    <p>
                        Paid: ₹ {fmt(invoice.paid_amount)} via {invoice.payment_mode}{" "}
                        <span className="opacity-60">({invoice.payment_status})</span>
                    </p>
                    <p className="mt-0.5 text-[1.15em] font-extrabold">Balance Due: ₹ {fmt(invoice.due_amount)}</p>
                </>
            )}
        </div>
    );
}

export function BankBlock({ store, className = "", titleClass = "font-extrabold" }: {
    store: PrintStore; className?: string; titleClass?: string;
}) {
    return (
        <div className={`no-break ${className}`}>
            <p className={titleClass}>Bank Details</p>
            <div className="mt-1 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                    {store.bank_name && <p><span className="font-semibold">Bank:</span> {store.bank_name}</p>}
                    {store.bank_account_holder_name && <p><span className="font-semibold">A/c Holder:</span> {store.bank_account_holder_name}</p>}
                    {store.bank_account_number && <p><span className="font-semibold">Account #:</span> {store.bank_account_number}</p>}
                    {store.bank_ifsc && <p><span className="font-semibold">IFSC:</span> {store.bank_ifsc}</p>}
                    {store.bank_upi_id && <p><span className="font-semibold">UPI ID:</span> {store.bank_upi_id}</p>}
                </div>
                {store.upi_qr_url && <img src={store.upi_qr_url} alt="Pay using UPI" className="size-20 shrink-0" />}
            </div>
        </div>
    );
}

export function Signature({ store, className = "" }: { store: PrintStore; className?: string }) {
    return (
        <div className={`no-break text-right ${className}`}>
            <p>For <span className="font-extrabold">{store.name}</span></p>
            <div className="flex h-16 items-center justify-end" aria-hidden>
                {store.signature_url && <img src={store.signature_url} alt="" className="max-h-14 w-auto object-contain" />}
            </div>
            <p className="font-semibold">Authorised Signatory</p>
        </div>
    );
}

const DEFAULT_TERMS = [
    "Goods once sold cannot be taken back or exchanged.",
    "Warranty as per manufacturer terms; used/refurbished items carry only the warranty stated on this invoice.",
    "Subject to local jurisdiction.",
];

export function Terms({ store, className = "" }: { store: PrintStore; className?: string }) {
    const list = store.terms && store.terms.length > 0 ? store.terms : DEFAULT_TERMS;
    return (
        <ol className={`list-decimal space-y-0.5 pl-4 ${className}`}>
            {list.map((t, i) => <li key={i}>{t}</li>)}
        </ol>
    );
}

/** IRN, acknowledgement and signed QR for e-invoiced documents. */
export function EInvoiceBlock({ invoice, className = "", qrClass = "size-24" }: {
    invoice: PrintInvoice; className?: string; qrClass?: string;
}) {
    if (!invoice.irn) return null;
    return (
        <div className={`no-break flex items-start gap-3 ${className}`}>
            <div className="min-w-0 flex-1 break-all text-[0.85em]">
                <p><span className="font-semibold">IRN:</span> {invoice.irn}</p>
                {invoice.ack_no && <p><span className="font-semibold">Ack No:</span> {invoice.ack_no}</p>}
                {invoice.ack_date && <p><span className="font-semibold">Ack Date:</span> {invoice.ack_date}</p>}
            </div>
            {invoice.irn_qr && <img src={invoice.irn_qr} alt="E-invoice QR" className={`${qrClass} shrink-0`} />}
        </div>
    );
}

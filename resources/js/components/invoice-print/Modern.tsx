import type { CSSProperties } from "react";
import type { TemplateProps } from "./model";
import {
    AmountWords, BankBlock, EInvoiceBlock, HsnTable, ItemsTable, Logo, Notices, PartyDetails,
    PaymentLine, PrintStyles, SellerDetails, Signature, Terms, TotalsBox, type TableTheme,
} from "./parts";

/** Design 2 — Modern: brand-colour header block, tinted cards, zebra rows. Set store.brand_color. */
export default function Modern({ invoice, store, m }: TemplateProps) {
    const ac = /^#[0-9a-fA-F]{3,8}$/.test(store.brand_color ?? "") ? (store.brand_color as string) : "#1e3a8a";
    const tint = `color-mix(in srgb, ${ac} 7%, white)`;
    const line = `color-mix(in srgb, ${ac} 22%, white)`;

    const theme: TableTheme = {
        table: "",
        headRow: "text-white",
        th: "px-2 py-2 font-semibold",
        bodyRow: "even:bg-[var(--tint)] border-b border-[var(--line)]",
        td: "px-2 py-1.5",
        sum: "",
        total: "",
        sep: "",
    };
    const vars = { "--ac": ac, "--tint": tint, "--line": line } as CSSProperties;

    return (
        <>
            <PrintStyles size="A4" margin="8mm" />
            <div
                style={vars}
                className="mx-auto max-w-[210mm] bg-white p-6 text-[12px] leading-snug text-neutral-900 print:max-w-none print:p-0"
            >
                {/* Header */}
                <header className="flex items-stretch justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                        <Logo store={store} className="h-16 w-16 shrink-0 object-contain" />
                        <div className="min-w-0">
                            <p className="text-[22px] font-bold leading-tight tracking-tight" style={{ color: ac }}>{store.name}</p>
                            <SellerDetails store={store} className="mt-1 space-y-0.5 text-neutral-700" />
                        </div>
                    </div>
                    <div className="w-60 shrink-0 rounded-md px-4 py-3 text-white" style={{ background: ac }}>
                        <p className="text-lg font-semibold leading-tight">{invoice.document_label}</p>
                        <p className="mt-1 text-[11px] opacity-80">{m.copyLabel}</p>
                        <p className="mt-2 text-[15px] font-bold">{invoice.invoice_number}</p>
                        <p className="text-[11px] opacity-90">{invoice.invoice_date}</p>
                    </div>
                </header>

                {/* Cards */}
                <section className="mt-5 grid grid-cols-3 gap-3">
                    <div className="rounded-md p-3" style={{ background: tint, border: `1px solid ${line}` }}>
                        <p className="mb-1 text-[11px] font-semibold" style={{ color: ac }}>Billed to</p>
                        <PartyDetails invoice={invoice} m={m} nameClass="text-[13px] font-bold" className="space-y-0.5" />
                    </div>
                    <div className="rounded-md p-3" style={{ background: tint, border: `1px solid ${line}` }}>
                        <p className="mb-1 text-[11px] font-semibold" style={{ color: ac }}>
                            {invoice.shipping_address ? "Ship to" : "Payment"}
                        </p>
                        {invoice.shipping_address ? (
                            <p className="whitespace-pre-line">{invoice.shipping_address}</p>
                        ) : (
                            <div className="space-y-0.5">
                                <p>Mode: <span className="font-semibold">{invoice.payment_mode}</span></p>
                                <p>Status: <span className="font-semibold">{invoice.payment_status}</span></p>
                            </div>
                        )}
                    </div>
                    <dl className="rounded-md p-3" style={{ background: tint, border: `1px solid ${line}` }}>
                        {m.meta.filter((f) => f.label !== "Invoice #" && f.label !== "Invoice Date").map((f) => (
                            <div key={f.label} className="flex justify-between gap-2 py-0.5">
                                <dt className="text-neutral-600">{f.label}</dt>
                                <dd className="text-right font-semibold">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <EInvoiceBlock invoice={invoice} className="mt-3 rounded-md border border-dashed border-neutral-300 p-2" />

                {/* Items */}
                <section className="mt-5 overflow-hidden rounded-md" style={{ border: `1px solid ${line}` }}>
                    <div className="[&_thead_tr]:bg-[var(--ac)]">
                        <ItemsTable invoice={invoice} m={m} t={theme} withSummary={false} />
                    </div>
                </section>

                {/* Totals */}
                <section className="mt-4 grid grid-cols-5 gap-6">
                    <div className="col-span-3 space-y-3">
                        <AmountWords amount={invoice.grand_total} />
                        <Notices m={m} className="space-y-0.5 rounded-md bg-[var(--tint)] p-2 italic" />
                        <PaymentLine invoice={invoice} />
                    </div>
                    <TotalsBox
                        invoice={invoice}
                        m={m}
                        cls={{
                            wrap: "col-span-2 self-start",
                            row: "flex justify-between border-b border-[var(--line)] py-1 text-neutral-700",
                            grand: "mt-1 flex justify-between rounded-md bg-[var(--ac)] px-3 py-2 text-[14px] font-bold text-white",
                        }}
                    />
                </section>

                {m.hsn && (
                    <section className="mt-5 overflow-hidden rounded-md" style={{ border: `1px solid ${line}` }}>
                        <div className="[&_thead_tr]:bg-[var(--tint)] [&_thead_tr]:font-semibold">
                            <HsnTable m={m} t={{ ...theme, headRow: "", th: "px-2 py-1.5 font-semibold", total: "font-bold" }} />
                        </div>
                    </section>
                )}

                {/* Footer */}
                <footer className="mt-5 grid grid-cols-3 gap-6 border-t pt-4" style={{ borderColor: line }}>
                    <div className="space-y-3">
                        {m.hasBank && <BankBlock store={store} titleClass="font-semibold" />}
                        <div>
                            <p className="font-semibold">Notes</p>
                            <p className="whitespace-pre-wrap">{invoice.notes ?? "Thank you for your business."}</p>
                        </div>
                    </div>
                    <div>
                        <p className="font-semibold">Terms &amp; conditions</p>
                        <Terms store={store} className="mt-1 text-[11px] text-neutral-700" />
                    </div>
                    <Signature store={store} />
                </footer>
                <p className="mt-4 text-center text-[10px] text-neutral-500">This is a computer-generated invoice.</p>
            </div>
        </>
    );
}

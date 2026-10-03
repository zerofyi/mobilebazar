import type { TemplateProps } from "./model";
import {
    AmountWords, BankBlock, EInvoiceBlock, HsnTable, ItemsTable, Logo, Notices, PartyDetails,
    PaymentLine, PrintStyles, SellerDetails, Signature, Terms, TotalsBox, type TableTheme,
} from "./parts";

/** Design 4 — Minimal: no boxes, hairlines only, very little ink. Good for retail counters. */
const theme: TableTheme = {
    table: "text-[11.5px]",
    headRow: "border-b border-neutral-900 text-left text-[10.5px] font-medium text-neutral-500",
    th: "py-2 pr-2 last:pr-0",
    bodyRow: "border-b border-neutral-200",
    td: "py-2 pr-2 last:pr-0",
    sum: "",
    total: "",
    sep: "",
};

export default function Minimal({ invoice, store, m }: TemplateProps) {
    return (
        <>
            <PrintStyles size="A4" margin="12mm" />
            <div className="mx-auto max-w-[210mm] bg-white p-8 text-[12px] leading-relaxed text-neutral-900 print:max-w-none print:p-0">
                <header className="flex items-start justify-between gap-6">
                    <div>
                        <Logo store={store} className="mb-2 h-10 w-auto object-contain" />
                        <p className="text-[15px] font-semibold">{store.name}</p>
                        <SellerDetails store={store} className="text-[11px] text-neutral-600" />
                    </div>
                    <div className="text-right">
                        <h1 className="text-[28px] font-light leading-none tracking-tight">{invoice.document_label}</h1>
                        <p className="mt-2 font-mono text-[13px] font-medium">{invoice.invoice_number}</p>
                        <p className="text-[11px] text-neutral-600">{invoice.invoice_date}</p>
                        <p className="mt-1 text-[10px] text-neutral-400">{m.copyLabel}</p>
                    </div>
                </header>

                <section className="mt-8 grid grid-cols-3 gap-8 text-[11.5px]">
                    <div>
                        <p className="mb-1 text-[10.5px] text-neutral-500">Billed to</p>
                        <PartyDetails invoice={invoice} m={m} nameClass="text-[13px] font-semibold" />
                    </div>
                    <div>
                        <p className="mb-1 text-[10.5px] text-neutral-500">
                            {invoice.shipping_address ? "Shipped to" : "Payment"}
                        </p>
                        {invoice.shipping_address ? (
                            <p className="whitespace-pre-line">{invoice.shipping_address}</p>
                        ) : (
                            <>
                                <p>{invoice.payment_mode}</p>
                                <p className="text-neutral-600">{invoice.payment_status}</p>
                            </>
                        )}
                    </div>
                    <dl className="space-y-0.5">
                        {m.meta.filter((f) => f.label !== "Invoice #" && f.label !== "Invoice Date").map((f) => (
                            <div key={f.label} className="flex justify-between gap-3">
                                <dt className="text-neutral-500">{f.label}</dt>
                                <dd className="text-right font-medium">{f.value}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                <EInvoiceBlock invoice={invoice} className="mt-4 text-neutral-600" />

                <div className="mt-8">
                    <ItemsTable invoice={invoice} m={m} t={theme} withSummary={false} />
                </div>

                <section className="mt-4 grid grid-cols-5 gap-10">
                    <div className="col-span-3 space-y-3 text-[11.5px]">
                        <AmountWords amount={invoice.grand_total} />
                        <Notices m={m} className="space-y-0.5 text-neutral-600" />
                        <PaymentLine invoice={invoice} />
                    </div>
                    <TotalsBox
                        invoice={invoice}
                        m={m}
                        cls={{
                            wrap: "col-span-2 self-start text-[11.5px]",
                            row: "flex justify-between py-0.5 text-neutral-600",
                            grand: "mt-2 flex justify-between border-t border-neutral-900 pt-2 text-[16px] font-semibold",
                        }}
                    />
                </section>

                {m.hsn && (
                    <div className="mt-8">
                        <p className="mb-1 text-[10.5px] text-neutral-500">HSN / SAC summary</p>
                        <HsnTable m={m} t={{ ...theme, th: "py-1.5 pr-2 last:pr-0", total: "font-semibold" }} />
                    </div>
                )}

                <footer className="mt-10 grid grid-cols-3 gap-8 border-t border-neutral-200 pt-4 text-[11px] text-neutral-700">
                    <div className="space-y-3">
                        {m.hasBank && <BankBlock store={store} titleClass="font-medium text-neutral-900" />}
                        {invoice.notes && <p className="whitespace-pre-wrap">{invoice.notes}</p>}
                    </div>
                    <div>
                        <p className="font-medium text-neutral-900">Terms</p>
                        <Terms store={store} className="mt-1" />
                    </div>
                    <Signature store={store} />
                </footer>
                <p className="mt-6 text-[10px] text-neutral-400">This is a computer-generated invoice.</p>
            </div>
        </>
    );
}

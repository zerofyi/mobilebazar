import type { TemplateProps } from "./model";
import {
    AmountWords, BankBlock, EInvoiceBlock, HsnTable, ItemsTable, Logo, Notices, PartyDetails,
    PaymentLine, PrintStyles, SellerDetails, Signature, Terms, TotalsBox, type TableTheme,
} from "./parts";

/** Design 3 — Corporate: serif letterhead, double rule, hairline table. For B2B / wholesale. */
const theme: TableTheme = {
    table: "border-y-2 border-[#14213d]",
    headRow: "border-b border-[#14213d] text-[11px] font-semibold",
    th: "px-1.5 py-2",
    bodyRow: "border-b border-neutral-300",
    td: "px-1.5 py-1.5",
    sum: "",
    total: "",
    sep: "",
};

const serif = { fontFamily: 'Georgia, "Times New Roman", serif' };

export default function Corporate({ invoice, store, m }: TemplateProps) {
    return (
        <>
            <PrintStyles size="A4" margin="10mm" />
            <div
                style={serif}
                className="mx-auto max-w-[210mm] bg-white p-8 text-[12px] leading-[1.45] text-neutral-900 print:max-w-none print:p-0"
            >
                {/* Letterhead */}
                <header className="text-center">
                    <div className="flex items-center justify-center gap-3">
                        <Logo store={store} className="h-12 w-12 object-contain" />
                        <p className="text-[26px] font-bold tracking-wide text-[#14213d]">{store.name}</p>
                    </div>
                    <SellerDetails store={store} className="mt-1 text-[11px] text-neutral-700" />
                    <div className="mt-3 border-y border-[#14213d] py-[2px]">
                        <div className="border-y border-[#14213d]" />
                    </div>
                </header>

                {/* Title */}
                <div className="mt-4 flex items-baseline justify-between">
                    <h1 className="text-[20px] font-bold text-[#14213d]">{invoice.document_label}</h1>
                    <span className="text-[10px] italic text-neutral-600">{m.copyLabel}</span>
                </div>

                {/* Meta strip */}
                <dl className="mt-2 grid grid-cols-4 gap-x-4 gap-y-2 border-b border-neutral-300 pb-3">
                    {m.meta.map((f) => (
                        <div key={f.label}>
                            <dt className="text-[10px] italic text-neutral-600">{f.label}</dt>
                            <dd className="font-bold">{f.value}</dd>
                        </div>
                    ))}
                </dl>

                <EInvoiceBlock invoice={invoice} className="mt-3 border-b border-neutral-300 pb-3" />

                {/* Parties */}
                <section className="mt-3 grid grid-cols-2 divide-x divide-neutral-300">
                    <div className="pr-4">
                        <p className="mb-1 text-[10px] italic text-neutral-600">Billed to</p>
                        <PartyDetails invoice={invoice} m={m} nameClass="text-[14px] font-bold" />
                    </div>
                    <div className="pl-4">
                        <p className="mb-1 text-[10px] italic text-neutral-600">
                            {invoice.shipping_address ? "Shipped to" : "Payment"}
                        </p>
                        {invoice.shipping_address ? (
                            <p className="whitespace-pre-line">{invoice.shipping_address}</p>
                        ) : (
                            <>
                                <p>Mode: <span className="font-semibold">{invoice.payment_mode}</span></p>
                                <p>Status: <span className="font-semibold">{invoice.payment_status}</span></p>
                            </>
                        )}
                    </div>
                </section>

                <div className="mt-4">
                    <ItemsTable invoice={invoice} m={m} t={theme} withSummary={false} />
                </div>

                {/* Totals + words */}
                <section className="mt-3 grid grid-cols-5 gap-8">
                    <div className="col-span-3 space-y-3">
                        <AmountWords amount={invoice.grand_total} className="italic" />
                        <Notices m={m} className="space-y-0.5 border-l-2 border-[#14213d] pl-3 text-[11px] italic" />
                        <PaymentLine invoice={invoice} />
                    </div>
                    <TotalsBox
                        invoice={invoice}
                        m={m}
                        cls={{
                            wrap: "col-span-2 self-start",
                            row: "flex justify-between py-0.5",
                            grand: "mt-1 flex justify-between border-y-2 border-[#14213d] py-1.5 text-[15px] font-bold text-[#14213d]",
                        }}
                    />
                </section>

                {m.hsn && (
                    <div className="mt-5">
                        <p className="mb-1 text-[10px] italic text-neutral-600">HSN / SAC summary</p>
                        <HsnTable m={m} t={{ ...theme, th: "px-1.5 py-1.5", total: "font-bold" }} />
                    </div>
                )}

                {/* Footer */}
                <footer className="mt-6 grid grid-cols-5 gap-8 border-t border-neutral-300 pt-4">
                    <div className="col-span-3 space-y-3">
                        {m.hasBank && <BankBlock store={store} titleClass="font-bold text-[#14213d]" />}
                        <div className="text-[11px]">
                            <p className="font-bold text-[#14213d]">Declaration &amp; terms</p>
                            <p className="mb-1 whitespace-pre-wrap">{invoice.notes ?? "We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct."}</p>
                            <Terms store={store} />
                        </div>
                    </div>
                    <div className="col-span-2 self-end">
                        <Signature store={store} />
                    </div>
                </footer>
                <p className="mt-4 text-center text-[10px] italic text-neutral-500">This is a computer-generated invoice.</p>
            </div>
        </>
    );
}

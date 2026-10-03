import type { TemplateProps } from "./model";
import {
    AmountWords, BankBlock, EInvoiceBlock, HsnTable, ItemsTable, Logo, Notices, PartyDetails,
    PaymentLine, PrintStyles, SellerDetails, Signature, Terms, type TableTheme,
} from "./parts";

/** Design 1 — Classic: full black grid, the familiar Tally / Swipe GST layout. */
const theme: TableTheme = {
    table: "border-b-2 border-black",
    headRow: "border-b border-black bg-neutral-100 font-bold",
    th: "px-1.5 py-1.5",
    bodyRow: "border-b border-neutral-300",
    td: "px-1.5 py-1.5",
    sum: "border-b border-neutral-300",
    total: "border-t border-black font-extrabold",
    sep: "border-r border-neutral-400",
};

export default function Classic({ invoice, store, m }: TemplateProps) {
    return (
        <>
            <PrintStyles size="A4" margin="8mm" />
            <div className="mx-auto max-w-[210mm] border-2 border-black bg-white text-[12px] leading-snug text-black print:max-w-none">
                {/* Title bar */}
                <div className="flex items-center justify-between border-b-2 border-black px-4 py-2">
                    <span className="w-44" aria-hidden />
                    <h1 className="text-xl font-extrabold uppercase tracking-[0.25em]">{invoice.document_label}</h1>
                    <span className="w-44 text-right text-[10px] font-semibold tracking-wider text-neutral-600">
                        {m.copyLabel}
                    </span>
                </div>

                {/* Seller + meta */}
                <div className="grid grid-cols-5 border-b-2 border-black">
                    <div className="col-span-3 flex gap-3 border-r border-black p-3">
                        <Logo store={store} className="h-16 w-16 shrink-0 object-contain" />
                        <div>
                            <p className="text-base font-extrabold">{store.name}</p>
                            <SellerDetails store={store} className="mt-0.5 space-y-0.5" />
                            <EInvoiceBlock invoice={invoice} className="mt-2 border-t border-neutral-300 pt-2" />
                        </div>
                    </div>
                    <div className="col-span-2 grid auto-rows-min grid-cols-2 text-[11px]">
                        {m.meta.map((f, i) => (
                            <div
                                key={f.label}
                                className={`border-b border-black p-2 ${i % 2 === 0 ? "border-r" : ""}`}
                            >
                                <p className="font-semibold">{f.label}:</p>
                                <p className="break-words text-[13px] font-extrabold">{f.value}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Bill-to + ship-to / payment */}
                <div className="grid grid-cols-5 border-b-2 border-black">
                    <div className="col-span-3 border-r border-black p-3">
                        <p className="font-semibold text-neutral-700">Bill To:</p>
                        <PartyDetails invoice={invoice} m={m} nameClass="mt-0.5 text-[13px] font-extrabold" className="space-y-0.5" />
                    </div>
                    <div className="col-span-2 space-y-2 p-3 text-[11px]">
                        {invoice.shipping_address && (
                            <div>
                                <p className="font-semibold">Ship To:</p>
                                <p className="whitespace-pre-line">{invoice.shipping_address}</p>
                            </div>
                        )}
                        <div>
                            <p><span className="font-semibold">Payment Mode:</span> {invoice.payment_mode}</p>
                            <p><span className="font-semibold">Payment Status:</span> {invoice.payment_status}</p>
                        </div>
                    </div>
                </div>

                <ItemsTable invoice={invoice} m={m} t={theme} />

                <div className="flex items-center justify-between gap-4 border-b border-black px-3 py-1.5">
                    <AmountWords amount={invoice.grand_total} />
                    <p className="shrink-0 font-bold italic">E &amp; O.E</p>
                </div>

                <HsnTable m={m} t={theme} />

                <Notices m={m} className="space-y-0.5 border-b border-black px-3 py-2 font-semibold italic" />

                <PaymentLine invoice={invoice} className="border-b border-black px-3 py-2 text-right" />

                <div className={`grid ${m.hasBank ? "grid-cols-2" : "grid-cols-1"} border-b border-black`}>
                    {m.hasBank && <BankBlock store={store} className="border-r border-black p-3" />}
                    <Signature store={store} className="p-3" />
                </div>

                <div className="grid grid-cols-2">
                    <div className="border-r border-black p-3">
                        <p className="font-extrabold">Notes:</p>
                        <p className="mt-1 whitespace-pre-wrap">{invoice.notes ?? "Thank you for the business."}</p>
                    </div>
                    <div className="p-3">
                        <p className="font-extrabold">Terms and Conditions:</p>
                        <Terms store={store} className="mt-1" />
                    </div>
                </div>
            </div>
            <p className="mx-auto mt-2 max-w-[210mm] text-[11px] text-neutral-500">This is a computer-generated invoice.</p>
        </>
    );
}

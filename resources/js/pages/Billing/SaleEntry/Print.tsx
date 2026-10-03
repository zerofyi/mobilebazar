import { Head } from "@inertiajs/react";
import { Printer } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { TEMPLATES, buildModel } from "@/components/invoice-print";
import type { PrintInvoice, PrintStore, TemplateKey } from "@/components/invoice-print";

/* Re-exported so existing imports from this page keep working. */
export type { PrintHsnRow, PrintInvoice, PrintInvoiceItem, PrintStore } from "@/components/invoice-print";
export { amountInWords } from "@/components/invoice-print";

interface Props {
    invoice: PrintInvoice;
    store: PrintStore;
}

export default function SalePrint({ invoice, store }: Props) {
    // Store setting wins; ?template=modern lets you preview a design without saving.
    const requested =
        (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("template") : null) ??
        store.invoice_template ??
        "classic";
    const key = (requested in TEMPLATES ? requested : "classic") as TemplateKey;
    const Template = TEMPLATES[key];

    const m = useMemo(() => buildModel(invoice, store), [invoice, store]);

    return (
        <>
            <Head title={`Invoice ${invoice.invoice_number}`} />
            <div className="min-h-screen bg-neutral-200 p-4 print:min-h-0 print:bg-white print:p-0">
                <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
                    <Button onClick={() => window.print()}>
                        <Printer className="mr-2 size-4" /> Print
                    </Button>
                </div>
                <Template invoice={invoice} store={store} m={m} />
            </div>
        </>
    );
}

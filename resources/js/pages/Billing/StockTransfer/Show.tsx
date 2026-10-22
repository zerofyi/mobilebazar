import { Head, Link } from "@inertiajs/react";
import { ArrowLeftRight, ArrowRight, ExternalLink, FileMinus2, FilePlus2 } from "lucide-react";
import { dashboard } from "@/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

interface StoreRef { id: number; name: string; code: string | null }

interface DocSummary {
    uuid: string;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
    payment_status: string;
    is_own: boolean;
}

interface Props {
    transfer: {
        uuid: string;
        transfer_number: string;
        status: string;
        direction: "outgoing" | "incoming";
        from_store: StoreRef | null;
        to_store: StoreRef | null;
        created_by: string | null;
        created_at: string | null;
        dispatched_at: string | null;
        received_at: string | null;
        sale: (DocSummary & {
            invoice_number: string;
            invoice_date: string | null;
            has_credit_note: boolean;
        }) | null;
        purchase: (DocSummary & {
            po_number: string;
            bill_type: string;
            order_date: string | null;
            has_debit_note: boolean;
        }) | null;
    };
}

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function MoneyRows({ doc }: { doc: DocSummary }) {
    return (
        <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
                <dt className="text-muted-foreground">Grand total</dt>
                <dd className="font-semibold tabular-nums"><FormatAmount amount={doc.grand_total} /></dd>
            </div>
            <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums"><FormatAmount amount={doc.paid_amount} /></dd>
            </div>
            <div className="flex justify-between">
                <dt className="text-muted-foreground">Due</dt>
                <dd className={`tabular-nums ${doc.due_amount > 0.009 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                    <FormatAmount amount={doc.due_amount} />
                </dd>
            </div>
            <div className="flex justify-between">
                <dt className="text-muted-foreground">Payment status</dt>
                <dd><Badge variant="outline" className="text-[10px] capitalize">{doc.payment_status}</Badge></dd>
            </div>
        </dl>
    );
}

export default function Show({ transfer }: Props) {
    useFlashToast();
    const { sale, purchase } = transfer;

    return (
        <>
            <Head title={`Transfer ${transfer.transfer_number}`} />
            <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
                <div className="mb-5">
                    <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
                        <ArrowLeftRight className="size-5 text-primary" />
                        <span className="font-mono">{transfer.transfer_number}</span>
                        <Badge variant="outline" className="capitalize">{transfer.status}</Badge>
                        <Badge
                            variant="outline"
                            className={transfer.direction === "outgoing"
                                ? "text-amber-700 dark:text-amber-400"
                                : "text-emerald-700 dark:text-emerald-400"}
                        >
                            {transfer.direction === "outgoing" ? "Outgoing" : "Incoming"}
                        </Badge>
                    </h1>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">{transfer.from_store?.name ?? "—"}</span>
                        <ArrowRight className="size-4" />
                        <span className="font-medium text-foreground">{transfer.to_store?.name ?? "—"}</span>
                        <span className="mx-1">·</span>
                        <span>{fmtDate(transfer.created_at)}</span>
                        {transfer.created_by && (
                            <>
                                <span className="mx-1">·</span>
                                <span>by {transfer.created_by}</span>
                            </>
                        )}
                    </div>
                    <p className="mt-2 max-w-2xl text-xs text-muted-foreground">
                        This transfer is a bridge between the two documents below — items and prices live on them,
                        not here. Transfer documents cannot be edited or deleted; returns go through a credit note
                        (sale side) or a debit note (purchase side).
                    </p>
                </div>

                <div className="grid items-start gap-4 md:grid-cols-2">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center justify-between text-sm">
                                <span>Sale — {transfer.from_store?.name ?? "Source store"}</span>
                                {sale?.has_credit_note && (
                                    <Badge variant="outline" className="gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                                        <FileMinus2 className="size-3" /> Credit note issued
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {sale ? (
                                <>
                                    <div className="mb-3 flex items-baseline justify-between">
                                        <span className="font-mono text-base font-semibold">{sale.invoice_number}</span>
                                        <span className="text-xs text-muted-foreground">{fmtDate(sale.invoice_date)}</span>
                                    </div>
                                    <MoneyRows doc={sale} />
                                    <div className="mt-4">
                                        {sale.is_own ? (
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/app/sales/${sale.uuid}`}>
                                                    <ExternalLink className="mr-1.5 size-3.5" /> Open sale
                                                </Link>
                                            </Button>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                This invoice belongs to {transfer.from_store?.name ?? "the source store"}.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">No sale linked.</p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center justify-between text-sm">
                                <span>Purchase — {transfer.to_store?.name ?? "Target store"}</span>
                                {purchase?.has_debit_note && (
                                    <Badge variant="outline" className="gap-1 text-[10px] text-amber-700 dark:text-amber-400">
                                        <FilePlus2 className="size-3" /> Debit note issued
                                    </Badge>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {purchase ? (
                                <>
                                    <div className="mb-3 flex items-baseline justify-between">
                                        <span className="font-mono text-base font-semibold">{purchase.po_number}</span>
                                        <span className="text-xs text-muted-foreground">
                                            {purchase.bill_type.toUpperCase()} · {fmtDate(purchase.order_date)}
                                        </span>
                                    </div>
                                    <MoneyRows doc={purchase} />
                                    <div className="mt-4">
                                        {purchase.is_own ? (
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={`/app/purchases/${purchase.uuid}`}>
                                                    <ExternalLink className="mr-1.5 size-3.5" /> Open purchase
                                                </Link>
                                            </Button>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                This purchase belongs to {transfer.to_store?.name ?? "the target store"}.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">No purchase linked.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                <div className="mt-5">
                    <Button variant="outline" asChild>
                        <Link href="/app/transfers">Back to transfers</Link>
                    </Button>
                </div>
            </div>
        </>
    );
}

Show.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Stock Transfers", href: "/app/transfers" },
    ],
};

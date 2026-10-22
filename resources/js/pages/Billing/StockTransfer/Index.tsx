import { Head, Link, router } from "@inertiajs/react";
import { ArrowLeftRight, ArrowRight, Eye, Plus } from "lucide-react";
import { dashboard } from "@/routes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { FormatAmount } from "@/components/special/format-amount";
import { useFlashToast } from "@/hooks/use-flash-toast";

interface StoreRef { id: number; name: string; code: string | null }

interface TransferRow {
    uuid: string;
    transfer_number: string;
    status: string;
    direction: "outgoing" | "incoming";
    from_store: StoreRef | null;
    to_store: StoreRef | null;
    created_at: string | null;
    sale: { uuid: string; invoice_number: string; grand_total: number; payment_status: string } | null;
    purchase: { uuid: string; po_number: string } | null;
}

interface Props {
    transfers: {
        data: TransferRow[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    canCreate: boolean;
}

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? "—"
        : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Index({ transfers, canCreate }: Props) {
    useFlashToast();

    return (
        <>
            <Head title="Stock Transfers" />
            <div className="mx-auto max-w-6xl px-4 py-6 lg:px-6">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="flex items-center gap-2 text-xl font-semibold">
                            <ArrowLeftRight className="size-5 text-primary" /> Stock Transfers
                        </h1>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Every transfer is a sale in one store and a purchase in the other — this page is the bridge record.
                        </p>
                    </div>
                    {canCreate && (
                        <Button asChild>
                            <Link href="/app/transfers/create">
                                <Plus className="mr-1.5 size-4" /> New Transfer
                            </Link>
                        </Button>
                    )}
                </div>

                <Card>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Transfer</TableHead>
                                    <TableHead>Route</TableHead>
                                    <TableHead>Sale (source)</TableHead>
                                    <TableHead>Purchase (target)</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {transfers.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                                            No stock transfers yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    transfers.data.map((t) => (
                                        <TableRow key={t.uuid}>
                                            <TableCell>
                                                <p className="font-mono text-xs font-semibold">{t.transfer_number}</p>
                                                <p className="text-[11px] text-muted-foreground">{fmtDate(t.created_at)}</p>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-1.5 text-xs">
                                                    <span className="font-medium">{t.from_store?.name ?? "—"}</span>
                                                    <ArrowRight className="size-3.5 text-muted-foreground" />
                                                    <span className="font-medium">{t.to_store?.name ?? "—"}</span>
                                                </div>
                                                <Badge
                                                    variant="outline"
                                                    className={t.direction === "outgoing"
                                                        ? "mt-1 text-[10px] text-amber-700 dark:text-amber-400"
                                                        : "mt-1 text-[10px] text-emerald-700 dark:text-emerald-400"}
                                                >
                                                    {t.direction === "outgoing" ? "Outgoing" : "Incoming"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {t.sale ? (
                                                    <>
                                                        <p className="font-mono text-xs">{t.sale.invoice_number}</p>
                                                        <p className="text-[11px] capitalize text-muted-foreground">{t.sale.payment_status}</p>
                                                    </>
                                                ) : "—"}
                                            </TableCell>
                                            <TableCell>
                                                {t.purchase ? <p className="font-mono text-xs">{t.purchase.po_number}</p> : "—"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {t.sale ? <FormatAmount amount={t.sale.grand_total} /> : "—"}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button variant="ghost" size="sm" asChild>
                                                    <Link href={`/app/transfers/${t.uuid}`}>
                                                        <Eye className="mr-1 size-3.5" /> View
                                                    </Link>
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {transfers.last_page > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-1">
                        {transfers.links.map((link, i) => (
                            <Button
                                key={i}
                                variant={link.active ? "default" : "outline"}
                                size="sm"
                                disabled={!link.url}
                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                            >
                                <span dangerouslySetInnerHTML={{ __html: link.label }} />
                            </Button>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Stock Transfers", href: "/app/transfers" },
    ],
};

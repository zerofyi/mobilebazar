import { Head, Link } from "@inertiajs/react";
import { Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FormatAmount } from "@/components/special/format-amount";

interface CNRow {
    uuid: string;
    credit_note_number: string;
    credit_note_date: string;
    grand_total: number;
    reason: string;
    status: string;
    invoice: { invoice_number: string } | null;
    customer: { name: string } | null;
}

export default function Index({ notes }: { notes: { data: CNRow[]; links: any[] } }) {
    return (
        <>
            <Head title="Credit notes" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center gap-2">
                    <Undo2 className="size-5" />
                    <h1 className="text-lg font-semibold">Credit notes <span className="text-sm font-normal text-muted-foreground">(sales returns)</span></h1>
                </div>
                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Issued ({notes.data.length})</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Number</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Sale</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Reason</TableHead>
                                    <TableHead className="text-right">Refund</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {notes.data.map((n) => (
                                    <TableRow key={n.uuid}>
                                        <TableCell>
                                            <Link className="underline font-medium" href={`/app/credit-notes/${n.uuid}`}>
                                                {n.credit_note_number}
                                            </Link>
                                        </TableCell>
                                        <TableCell>{n.credit_note_date}</TableCell>
                                        <TableCell>{n.invoice?.invoice_number ?? "—"}</TableCell>
                                        <TableCell>{n.customer?.name ?? "—"}</TableCell>
                                        <TableCell className="max-w-48 truncate" title={n.reason}>{n.reason}</TableCell>
                                        <TableCell className="text-right tabular-nums">₹<FormatAmount amount={n.grand_total} /></TableCell>
                                        <TableCell><Badge className="capitalize">{n.status}</Badge></TableCell>
                                    </TableRow>
                                ))}
                                {notes.data.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                                            No credit notes yet. Open a sale and choose Return.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: "/app/dashboard" },
        { title: "Credit Notes", href: "/app/credit-notes" },
    ],
};

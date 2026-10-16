import { Head, Link } from "@inertiajs/react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { FormatAmount } from "@/components/special/format-amount";

interface CNItem {
    product_name: string;
    quantity: number;
    unit_price: number;
    tax_amount: number;
    line_total: number;
}

export default function Show({
    note,
}: {
    note: {
        uuid: string;
        credit_note_number: string;
        credit_note_date: string;
        subtotal: number;
        tax_amount: number;
        grand_total: number;
        reason: string;
        status: string;
        notes: string | null;
        created_by: string | null;
        invoice: { uuid: string; invoice_number: string } | null;
        customer: { name: string; phone: string | null } | null;
        items: CNItem[];
    };
}) {
    return (
        <>
            <Head title={note.credit_note_number} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-lg font-semibold">{note.credit_note_number}</h1>
                        <p className="text-sm text-muted-foreground">
                            {note.credit_note_date}
                            {note.invoice && (
                                <> · against <Link className="underline" href={`/app/sales/${note.invoice.uuid}`}>{note.invoice.invoice_number}</Link></>
                            )}
                        </p>
                    </div>
                    <Badge className="capitalize">{note.status}</Badge>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Customer</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <p className="font-medium">{note.customer?.name ?? "—"}</p>
                            {note.customer?.phone && <p className="text-muted-foreground">{note.customer.phone}</p>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Reason</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <p>{note.reason}</p>
                            {note.notes && <p className="mt-1 text-muted-foreground">{note.notes}</p>}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Totals</CardTitle></CardHeader>
                        <CardContent className="text-sm">
                            <dl className="space-y-1">
                                <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">₹<FormatAmount amount={note.subtotal} /></dd></div>
                                <div className="flex justify-between"><dt className="text-muted-foreground">Tax reversed</dt><dd className="tabular-nums">₹<FormatAmount amount={note.tax_amount} /></dd></div>
                                <Separator />
                                <div className="flex justify-between text-base font-bold"><dt>Refund</dt><dd className="tabular-nums text-primary">₹<FormatAmount amount={note.grand_total} /></dd></div>
                                {note.created_by && <div className="flex justify-between"><dt className="text-muted-foreground">Issued by</dt><dd>{note.created_by}</dd></div>}
                            </dl>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Returned items ({note.items.length})</CardTitle></CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Unit price</TableHead>
                                    <TableHead className="text-right">Tax</TableHead>
                                    <TableHead className="text-right">Refund</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {note.items.map((i, k) => (
                                    <TableRow key={k}>
                                        <TableCell>{i.product_name}</TableCell>
                                        <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
                                        <TableCell className="text-right tabular-nums">₹<FormatAmount amount={i.unit_price} /></TableCell>
                                        <TableCell className="text-right tabular-nums">₹<FormatAmount amount={i.tax_amount} /></TableCell>
                                        <TableCell className="text-right tabular-nums">₹<FormatAmount amount={i.line_total} /></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </>
    );
}

Show.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: "/app/dashboard" },
        { title: "Credit Notes", href: "/app/credit-notes" },
    ],
};

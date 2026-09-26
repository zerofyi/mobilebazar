import { Head, Link } from '@inertiajs/react';
import { ArrowLeft, Printer, FileText, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FormatAmount } from '@/components/special/format-amount';

export default function Show({ purchase }: { purchase: any }) {
    return (
        <>
            <Head title={`Purchase ${purchase.po_number}`} />
            <div className="flex h-full flex-1 flex-col gap-6 p-4">

                <div className="flex items-center justify-between border-b pb-4">
                    <div className="flex items-center gap-4">
                        <Link href="/app/purchases">
                            <Button variant="outline" size="icon" className="size-8"><ArrowLeft className="size-4" /></Button>
                        </Link>
                        <div>
                            <h2 className="text-xl font-bold flex items-center gap-2">
                                {purchase.po_number}
                                <Badge variant="outline">{purchase.status}</Badge>
                            </h2>
                            <p className="text-xs text-muted-foreground">Order Date: {purchase.order_date}</p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm">
                        <Printer className="size-4 mr-2" /> Print PDF
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="py-3"><CardTitle className="text-sm">Vendor Details</CardTitle></CardHeader>
                        <CardContent className="text-sm space-y-1">
                            <p className="font-semibold">{purchase.vendor?.name || 'Walk-in Vendor'}</p>
                            <p className="text-muted-foreground">{purchase.vendor?.phone}</p>
                            {purchase.vendor_invoice_no && (
                                <p className="mt-2 text-xs">Vendor Bill No: <span className="font-mono">{purchase.vendor_invoice_no}</span></p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="py-3"><CardTitle className="text-sm">Financial Summary</CardTitle></CardHeader>
                        <CardContent className="text-sm grid grid-cols-2 gap-2">
                            <p className="text-muted-foreground">Subtotal:</p>
                            <p className="text-right font-mono">₹<FormatAmount amount={purchase.subtotal} /></p>
                            <p className="text-muted-foreground">Tax Amount:</p>
                            <p className="text-right font-mono">₹<FormatAmount amount={purchase.tax_amount} /></p>
                            <p className="font-semibold pt-2 border-t">Grand Total:</p>
                            <p className="text-right font-mono font-bold pt-2 border-t">₹<FormatAmount amount={purchase.grand_total} /></p>
                            <p className="text-muted-foreground mt-2">Due Amount:</p>
                            <p className="text-right font-mono text-destructive mt-2">₹<FormatAmount amount={purchase.due_amount} /></p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="py-3"><CardTitle className="text-sm">Line Items</CardTitle></CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Item</TableHead>
                                    <TableHead className="text-right">Qty</TableHead>
                                    <TableHead className="text-right">Unit Rate</TableHead>
                                    <TableHead className="text-center">Tax %</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {purchase.items.map((item: any) => (
                                    <TableRow key={item.id}>
                                        <TableCell>
                                            <p className="font-medium text-xs">{item.manual_item_name}</p>
                                            {item.is_margin_scheme ? <Badge variant="secondary" className="text-[9px] mt-1">Margin Scheme</Badge> : null}
                                        </TableCell>
                                        <TableCell className="text-right text-xs">{item.ordered_qty}</TableCell>
                                        <TableCell className="text-right font-mono text-xs">₹<FormatAmount amount={item.unit_cost} /></TableCell>
                                        <TableCell className="text-center text-xs">{item.tax_pct}%</TableCell>
                                        <TableCell className="text-right font-mono text-xs font-semibold">₹<FormatAmount amount={item.line_total} /></TableCell>
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

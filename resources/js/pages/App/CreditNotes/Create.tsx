import React, { useState } from "react";
import { todayLocal } from "@/lib/local-date";
import { Head, router } from "@inertiajs/react";
import { ArrowLeft, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useFlashToast } from "@/hooks/use-flash-toast";
import SecurityPinModal from "@/components/SecurityPinModal";

interface ReturnLine {
    id: number;
    product_name: string;
    variant_name: string | null;
    sku: string | null;
    imei1: string | null;
    serial_number: string | null;
    unit_status: string | null;
    quantity: number;
    returned_quantity: number;
    unit_price: number;
    line_total: number;
}

export default function Create({
    invoice,
    lines,
}: {
    invoice: { uuid: string; invoice_number: string; invoice_date: string; grand_total: number; discount_amount: number; party_name: string };
    lines: ReturnLine[];
}) {
    useFlashToast();
    const [selected, setSelected] = useState<Record<number, number>>({});
    const [reason, setReason] = useState("");
    const [refundMode, setRefundMode] = useState<"cash" | "adjust">("adjust");
    const [date, setDate] = useState(todayLocal());
    const [notes, setNotes] = useState("");
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const idempotencyKey = React.useMemo(
        () => Math.random().toString(36).slice(2) + Date.now().toString(36),
        []
    );

    const toggle = (line: ReturnLine, on: boolean) => {
        setSelected((s) => {
            const next = { ...s };
            if (on) next[line.id] = Math.min(line.quantity - line.returned_quantity, line.quantity - line.returned_quantity);
            else delete next[line.id];
            return next;
        });
    };

    const setQty = (line: ReturnLine, q: number) => {
        const max = line.quantity - line.returned_quantity;
        setSelected((s) => ({ ...s, [line.id]: Math.max(1, Math.min(max, q || 1)) }));
    };

    const entries = Object.entries(selected);
    // Preview matches the server: refunds are scaled by the share of the
    // line totals actually paid after the bill-level discount.
    const linesTotal = lines.reduce((s, l) => s + l.line_total, 0);
    const billFactor = linesTotal > 0.005
        ? Math.max(0, Math.min(1, (linesTotal - (invoice.discount_amount || 0)) / linesTotal))
        : 1;
    const refundTotal = entries.reduce((sum, [id, q]) => {
        const line = lines.find((l) => l.id === Number(id));
        if (!line) return sum;
        return sum + (line.line_total / line.quantity) * q * billFactor;
    }, 0);

    const canSubmit = entries.length > 0 && reason.trim().length > 0;

    const confirm = (securityPin: string) => {
        setSubmitting(true);
        const payload = {
            security_pin: securityPin,
            idempotency_key: idempotencyKey,
            items: entries.map(([id, q]) => ({ invoice_item_id: Number(id), quantity: q })),
            reason: reason.trim(),
            refund_mode: refundMode,
            credit_note_date: date,
            notes: notes.trim() || undefined,
        };
        router.post(
            `/app/sales/${invoice.uuid}/returns`,
            payload as unknown as Parameters<typeof router.post>[1],
            {
                onError: (errs) => {
                    if (errs.security_pin) {
                        setPinError(errs.security_pin as string);
                        setPinOpen(true);
                    }
                },
                onFinish: () => setSubmitting(false),
                onSuccess: () => setPinOpen(false),
            }
        );
    };

    return (
        <>
            <Head title={`Return — ${invoice.invoice_number}`} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" onClick={() => window.history.back()}>
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div>
                        <h1 className="text-lg font-semibold flex items-center gap-2">
                            <Undo2 className="size-5" /> Sales return
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {invoice.invoice_number} · {invoice.party_name} ·{" "}
                            {invoice.invoice_date}
                        </p>
                    </div>
                </div>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm">Select items to return</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {lines.map((line) => {
                            const max = line.quantity - line.returned_quantity;
                            const soldOut = max <= 0;
                            const unitBlocked = !!line.unit_status && line.unit_status !== "sold";
                            const checked = selected[line.id] != null;
                            return (
                                <div
                                    key={line.id}
                                    className={`flex items-center gap-3 rounded-lg border p-3 ${soldOut || unitBlocked ? "opacity-50" : ""}`}
                                >
                                    <Checkbox
                                        checked={checked}
                                        disabled={soldOut || unitBlocked}
                                        onCheckedChange={(c) => toggle(line, !!c)}
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {line.product_name}
                                            {line.variant_name && <span className="text-muted-foreground"> · {line.variant_name}</span>}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {line.imei1 && <>IMEI {line.imei1} · </>}
                                            {line.serial_number && <>S/N {line.serial_number} · </>}
                                            Qty {line.quantity}
                                            {line.returned_quantity > 0 && <> · already returned {line.returned_quantity}</>}
                                        </p>
                                        {unitBlocked && (
                                            <Badge variant="destructive" className="mt-1 text-[10px]">
                                                Unit {line.unit_status} — cannot return
                                            </Badge>
                                        )}
                                    </div>
                                    {checked && !soldOut && !unitBlocked && (
                                        <div className="flex items-center gap-1.5">
                                            <Label className="text-xs text-muted-foreground">Qty</Label>
                                            <Input
                                                type="number"
                                                min={1}
                                                max={max}
                                                value={selected[line.id]}
                                                onChange={(e) => setQty(line, parseInt(e.target.value) || 1)}
                                                className="h-8 w-16 text-right"
                                            />
                                            <span className="text-xs text-muted-foreground">/ {max}</span>
                                        </div>
                                    )}
                                    <span className="text-sm tabular-nums text-muted-foreground w-24 text-right">
                                        ₹{line.line_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Return details</CardTitle></CardHeader>
                        <CardContent className="space-y-3">
                            <div className="space-y-1">
                                <Label>Reason *</Label>
                                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Defective piece, customer changed mind" maxLength={255} />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <Label>Return date</Label>
                                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <Label>Refund</Label>
                                    <Select value={refundMode} onValueChange={(v) => setRefundMode(v as "cash" | "adjust")}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="adjust">Adjust against dues</SelectItem>
                                            <SelectItem value="cash">Cash refund now</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label>Notes</Label>
                                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2"><CardTitle className="text-sm">Summary</CardTitle></CardHeader>
                        <CardContent className="space-y-2">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Items returning</span>
                                <span className="tabular-nums">{entries.reduce((s, [, q]) => s + q, 0)}</span>
                            </div>
                            <div className="flex justify-between text-base font-bold">
                                <span>Refund total</span>
                                <span className="tabular-nums text-primary">
                                    ₹{refundTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {refundMode === "cash"
                                    ? "Cash will be paid out now and the sale's revenue, tax and stock are reversed."
                                    : "The amount will be adjusted against the customer's dues and the sale's revenue, tax and stock are reversed."}
                            </p>
                            <Button
                                className="w-full"
                                disabled={!canSubmit || submitting}
                                onClick={() => {
                                    setPinError(null);
                                    setPinOpen(true);
                                }}
                            >
                                {submitting ? "Issuing…" : "Issue credit note"}
                            </Button>
                        </CardContent>
                    </Card>
                </div>
            </div>

            <SecurityPinModal
                open={pinOpen}
                onOpenChange={(o) => !o && setPinOpen(false)}
                onConfirm={confirm}
                error={pinError}
                title="Confirm sales return"
                description={`Enter the store's 6-digit security PIN to issue this credit note (${entries.reduce((s, [, q]) => s + q, 0)} items, ≈ ₹${refundTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}).`}
                confirmLabel="Issue credit note"
            />
        </>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: "/app/dashboard" },
        { title: "Credit Notes", href: "/app/credit-notes" },
    ],
};

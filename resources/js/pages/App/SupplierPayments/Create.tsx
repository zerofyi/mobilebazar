import React, { useMemo, useState } from "react";
import { Head, Link, router } from "@inertiajs/react";
import { dashboard } from "@/routes";
import {
    Wallet, Search, ArrowLeft, Landmark, Banknote, CreditCard, QrCode,
    CircleAlert, CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { FormatAmount } from "@/components/special/format-amount";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OutstandingPo {
    uuid: string;
    po_number: string;
    vendor_name: string | null;
    order_date: string | null;
    due_date: string | null;
    grand_total: number;
    paid_amount: number;
    due_amount: number;
}

interface Props {
    outstandingPos: OutstandingPo[];
    preloaded: string | null;
    preselect: string[];
}

const PAYMENT_MODES = [
    { value: "cash", label: "Cash" },
    { value: "bank", label: "Bank Transfer" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "neft", label: "NEFT" },
    { value: "rtgs", label: "RTGS" },
    { value: "imps", label: "IMPS" },
    { value: "cheque", label: "Cheque" },
] as const;

// Wayfinder regenerates these route helpers at build time; bracket access mirrors
// the existing `app.loans['invoice-lookup']` pattern for hyphenated names.
// Plain URL helpers (wayfinder-free): stable under the /app prefix.
const spRoutes: Record<string, { url: (...args: string[]) => string }> = {
    index: { url: () => '/app/supplier-payments' },
    create: { url: () => '/app/supplier-payments/create' },
    store: { url: () => '/app/supplier-payments' },
};

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "";
}

function fmtDate(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function ModeIcon({ mode, className }: { mode: string; className?: string }) {
    const Icon = mode === "cash" ? Banknote : mode === "upi" ? QrCode : mode === "card" ? CreditCard : Landmark;
    return <Icon className={className} />;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function SupplierPaymentCreate({ outstandingPos, preloaded, preselect }: Props) {
    const initialSelected = useMemo(
        () => (preloaded ? [preloaded] : preselect ?? []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        []
    );

    const [selected, setSelected] = useState<string[]>(initialSelected);
    const [poQuery, setPoQuery] = useState("");
    const [autoAllocate, setAutoAllocate] = useState(true);
    const [totalAmount, setTotalAmount] = useState("");
    const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({});
    const [paymentMode, setPaymentMode] = useState<string>("bank");
    const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
    const [txnReference, setTxnReference] = useState("");
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);
    // One idempotency key per page visit: a retry after a lost response
    // replays on the server instead of paying the supplier twice.
    const [idemKey] = useState(() => crypto.randomUUID());
    const [errors, setErrors] = useState<Record<string, string[]>>({});
    const [serverError, setServerError] = useState<string | null>(null);
    const [amountTouched, setAmountTouched] = useState(false);

    const filteredPos = useMemo(() => {
        const q = poQuery.trim().toLowerCase();
        if (!q) return outstandingPos;
        return outstandingPos.filter(
            (po) =>
                po.po_number.toLowerCase().includes(q) ||
                (po.vendor_name ?? "").toLowerCase().includes(q)
        );
    }, [outstandingPos, poQuery]);

    const selectedPos = useMemo(
        () => outstandingPos.filter((po) => selected.includes(po.uuid)),
        [outstandingPos, selected]
    );

    const selectedDueTotal = useMemo(
        () => selectedPos.reduce((s, po) => s + Number(po.due_amount), 0),
        [selectedPos]
    );

    // Amount follows the selection until the user edits it by hand.
    const effectiveAmount = amountTouched && totalAmount !== "" ? totalAmount : selectedDueTotal.toFixed(2);

    const manualSum = useMemo(
        () => selected.reduce((s, uuid) => s + (parseFloat(manualAmounts[uuid] ?? "") || 0), 0),
        [selected, manualAmounts]
    );

    const togglePo = (uuid: string) => {
        setSelected((prev) => (prev.includes(uuid) ? prev.filter((u) => u !== uuid) : [...prev, uuid]));
        setErrors({});
        setServerError(null);
    };

    const clientErrors: string[] = [];
    const amountNum = parseFloat(effectiveAmount) || 0;
    if (selected.length === 0) clientErrors.push("Select at least one purchase order.");
    if (amountNum <= 0) clientErrors.push("Enter an amount greater than zero.");
    if (amountNum > selectedDueTotal + 0.005) clientErrors.push("Amount exceeds the total due on the selected orders.");
    if (!autoAllocate) {
        if (Math.abs(manualSum - amountNum) > 0.005) clientErrors.push("Per-order amounts must add up to the total amount.");
        for (const po of selectedPos) {
            const m = parseFloat(manualAmounts[po.uuid] ?? "") || 0;
            if (m > Number(po.due_amount) + 0.005) clientErrors.push(`${po.po_number}: allocation exceeds its due of ₹${Number(po.due_amount).toFixed(2)}.`);
        }
    }
    if (!paidAt) clientErrors.push("Payment date is required.");

    const flatErrors = Object.values(errors).flat();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (submitting || clientErrors.length > 0) return;
        setSubmitting(true);
        setErrors({});
        setServerError(null);

        const payload: Record<string, unknown> = {
            purchase_order_ids: selected,
            amount: amountNum,
            payment_mode: paymentMode,
            paid_at: paidAt,
            txn_reference: txnReference.trim() || null,
            notes: notes.trim() || null,
            idempotency_key: idemKey,
        };
        if (!autoAllocate) {
            payload.allocations = selected.map((uuid) => ({
                purchase_order_id: uuid,
                amount: parseFloat(manualAmounts[uuid] ?? "") || 0,
            }));
        }

        try {
            const res = await fetch(spRoutes.store.url(), {
                method: "POST",
                headers: {
                    Accept: "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                    "X-CSRF-TOKEN": getCsrfToken(),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            });
            const json = await res.json().catch(() => ({}));
            if (res.status === 422) {
                setErrors(json.errors ?? {});
                setServerError(json.message ?? "Validation failed.");
                return;
            }
            if (!res.ok) throw new Error(json?.message || `Request failed (${res.status}).`);
            router.visit(spRoutes.index.url());
        } catch (err) {
            setServerError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <>
            <Head title="Record Supplier Payment" />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header */}
                <div className="flex items-center gap-3 border-b border-border pb-4">
                    <Link href={spRoutes.index.url()}>
                        <Button variant="ghost" size="icon"><ArrowLeft className="size-4" /></Button>
                    </Link>
                    <div>
                        <h1 className="text-xl font-semibold tracking-tight">Record Supplier Payment</h1>
                        <p className="text-sm text-muted-foreground">
                            Pay one or more purchase orders. Each order gets its own payment entry and journal posting.
                        </p>
                    </div>
                </div>

                {(serverError || flatErrors.length > 0 || clientErrors.length > 0) && (
                    <Alert variant="destructive">
                        <CircleAlert className="size-4" />
                        <AlertDescription>
                            <ul className="list-disc pl-4 space-y-0.5">
                                {serverError && <li>{serverError}</li>}
                                {flatErrors.map((m, i) => <li key={`s-${i}`}>{m}</li>)}
                                {clientErrors.map((m, i) => <li key={`c-${i}`}>{m}</li>)}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-5">

                    {/* PO selector */}
                    <Card className="lg:col-span-3">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Purchase Orders with Dues</CardTitle>
                            <CardDescription>
                                {selected.length > 0
                                    ? `${selected.length} selected · total due ₹${selectedDueTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
                                    : "Tick the orders this payment covers."}
                            </CardDescription>
                            <div className="relative pt-1">
                                <Search className="absolute left-2.5 top-3.5 size-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search PO number or vendor…"
                                    value={poQuery}
                                    onChange={(e) => setPoQuery(e.target.value)}
                                    className="pl-8"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="max-h-105 overflow-y-auto rounded-md border border-border divide-y">
                                {filteredPos.length === 0 && (
                                    <div className="p-6 text-center text-sm text-muted-foreground">
                                        {outstandingPos.length === 0
                                            ? "No purchase orders have outstanding dues."
                                            : "No orders match your search."}
                                    </div>
                                )}
                                {filteredPos.map((po) => {
                                    const checked = selected.includes(po.uuid);
                                    return (
                                        <button
                                            type="button"
                                            key={po.uuid}
                                            onClick={() => togglePo(po.uuid)}
                                            className={cn(
                                                "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                                                checked && "bg-primary/5"
                                            )}
                                        >
                                            {checked
                                                ? <CheckSquare className="size-4 shrink-0 text-primary" />
                                                : <Square className="size-4 shrink-0 text-muted-foreground" />}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">{po.po_number}</span>
                                                    {po.due_date && new Date(po.due_date) < new Date(new Date().toDateString()) && (
                                                        <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                                            Overdue
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="truncate text-xs text-muted-foreground">
                                                    {po.vendor_name ?? "—"} · due {fmtDate(po.due_date)}
                                                </div>
                                            </div>
                                            <div className="text-right text-sm">
                                                <div className="font-semibold">₹<FormatAmount amount={po.due_amount} /></div>
                                                <div className="text-xs text-muted-foreground">of ₹<FormatAmount amount={po.grand_total} /></div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Payment details */}
                    <Card className="lg:col-span-2">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-base">Payment Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="amount">Amount (₹)</Label>
                                <Input
                                    id="amount"
                                    type="number"
                                    min="0.01"
                                    step="0.01"
                                    value={effectiveAmount}
                                    onChange={(e) => { setTotalAmount(e.target.value); setAmountTouched(true); }}
                                    placeholder="0.00"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Defaults to the total due on the selected orders.
                                </p>
                            </div>

                            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                                <div>
                                    <div className="text-sm font-medium">Auto-allocate</div>
                                    <div className="text-xs text-muted-foreground">Oldest due first</div>
                                </div>
                                <Switch checked={autoAllocate} onCheckedChange={setAutoAllocate} />
                            </div>

                            {!autoAllocate && selectedPos.length > 0 && (
                                <div className="space-y-2 rounded-md border border-border p-3">
                                    <div className="text-xs font-medium text-muted-foreground">
                                        Split across orders (must total ₹{amountNum.toFixed(2)})
                                    </div>
                                    {selectedPos.map((po) => (
                                        <div key={po.uuid} className="flex items-center gap-2">
                                            <span className="flex-1 truncate text-sm">{po.po_number}</span>
                                            <Input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                className="w-32"
                                                placeholder={Number(po.due_amount).toFixed(2)}
                                                value={manualAmounts[po.uuid] ?? ""}
                                                onChange={(e) => setManualAmounts((m) => ({ ...m, [po.uuid]: e.target.value }))}
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <Separator />

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Mode</Label>
                                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PAYMENT_MODES.map((m) => (
                                                <SelectItem key={m.value} value={m.value}>
                                                    <span className="flex items-center gap-2">
                                                        <ModeIcon mode={m.value} className="size-3.5" />{m.label}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="paid_at">Paid on</Label>
                                    <Input
                                        id="paid_at"
                                        type="date"
                                        value={paidAt}
                                        max={new Date().toISOString().slice(0, 10)}
                                        onChange={(e) => setPaidAt(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="txn_reference">Transaction reference</Label>
                                <Input
                                    id="txn_reference"
                                    value={txnReference}
                                    onChange={(e) => setTxnReference(e.target.value)}
                                    placeholder="UTR / cheque no. / txn id"
                                    maxLength={100}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="notes">Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Optional note (recorded in the journal narration)"
                                    rows={2}
                                    maxLength={1000}
                                />
                            </div>

                            <Button
                                type="submit"
                                className="w-full gap-1.5"
                                disabled={submitting || clientErrors.length > 0}
                            >
                                <Wallet className="size-4" />
                                {submitting ? "Recording…" : `Record Payment of ₹${amountNum.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`}
                            </Button>

                            {selected.length > 0 && (
                                <p className="text-center text-xs text-muted-foreground">
                                    Posts {selected.length === 1 ? "a" : selected.length} journal{" "}
                                    {selected.length === 1 ? "entry" : "entries"}: Dr 2010 AP / Cr{" "}
                                    {paymentMode === "cash" ? "1010 Cash" : paymentMode === "upi" ? "1025 UPI" : paymentMode === "card" ? "1026 Card" : "1020 Bank"}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                </form>
            </div>
        </>
    );
}

SupplierPaymentCreate.layout = {
    breadcrumbs: [
        { title: "Dashboard", href: dashboard() },
        { title: "Supplier Payments", href: spRoutes.index.url() },
        { title: "Record Payment", href: spRoutes.create.url() },
    ],
};

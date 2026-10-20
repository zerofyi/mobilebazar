import { useState } from "react";
import { router } from "@inertiajs/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import SecurityPinModal from "@/components/SecurityPinModal";

const MODES = [
    { value: "cash", label: "Cash" },
    { value: "upi", label: "UPI" },
    { value: "card", label: "Card" },
    { value: "bank", label: "Bank" },
    { value: "neft", label: "NEFT" },
    { value: "cheque", label: "Cheque" },
];

/**
 * Collect a payment against a partial/unpaid sale.
 * Two steps: amount+mode first, then the store security PIN.
 */
export default function CollectPaymentModal({
    open,
    onClose,
    invoiceUuid,
    invoiceNumber,
    dueAmount,
}: {
    open: boolean;
    onClose: () => void;
    invoiceUuid: string;
    invoiceNumber: string;
    dueAmount: number;
}) {
    const [mode, setMode] = useState("cash");
    const [amount, setAmount] = useState<string>(dueAmount.toFixed(2));
    const [reference, setReference] = useState("");
    const [pinOpen, setPinOpen] = useState(false);
    const [pinError, setPinError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const proceed = () => {
        const amt = parseFloat(amount) || 0;
        if (amt <= 0) {
            setFormError("Enter an amount greater than zero.");
            return;
        }
        if (amt - dueAmount > 0.011) {
            setFormError(`Amount cannot exceed the due of ₹${dueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`);
            return;
        }
        setFormError(null);
        setPinError(null);
        setPinOpen(true);
    };

    const confirm = (securityPin: string) => {
        setSubmitting(true);
        const payload = {
            security_pin: securityPin,
            mode,
            amount: parseFloat(amount) || 0,
            reference: reference.trim() || undefined,
        };
        router.post(
            `/app/sales/${invoiceUuid}/collect`,
            payload as unknown as Parameters<typeof router.post>[1],
            {
                onError: (errs) => {
                    if (errs.security_pin) {
                        setPinError(errs.security_pin as string);
                        setPinOpen(true);
                    } else if (errs.amount) {
                        setPinOpen(false);
                        setFormError(errs.amount as string);
                    }
                },
                onFinish: () => setSubmitting(false),
                onSuccess: () => {
                    setPinOpen(false);
                    onClose();
                },
            }
        );
    };

    return (
        <>
            <Dialog open={open && !pinOpen} onOpenChange={(o) => !o && onClose()}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Collect payment</DialogTitle>
                        <DialogDescription>
                            Record a payment against {invoiceNumber}. Due: ₹
                            {dueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 py-1">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label>Mode</Label>
                                <Select value={mode} onValueChange={setMode}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {MODES.map((m) => (
                                            <SelectItem key={m.value} value={m.value}>
                                                {m.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <Label>Amount ₹</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    onFocus={(e) => e.target.select()}
                                    className="text-right tabular-nums"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <Label>Reference <span className="text-muted-foreground font-normal">(UTR / cheque no — optional)</span></Label>
                            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR number" maxLength={100} />
                        </div>
                        {formError && <p className="text-xs text-destructive">{formError}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button onClick={proceed} disabled={submitting}>
                            {submitting ? (
                                <>
                                    <Loader2 className="mr-2 size-4 animate-spin" />
                                    Collecting…
                                </>
                            ) : (
                                "Continue"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            <SecurityPinModal
                open={pinOpen}
                onOpenChange={(o) => !o && setPinOpen(false)}
                onConfirm={confirm}
                error={pinError}
                title="Confirm collection"
                description={`Enter the store's 6-digit security PIN to record ₹${(parseFloat(amount) || 0).toLocaleString("en-IN")} via ${mode.toUpperCase()} against ${invoiceNumber}.`}
                confirmLabel="Record payment"
            />
        </>
    );
}

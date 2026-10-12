import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface SecurityPinModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (pin: string) => void;
    title?: string;
    description?: string;
    error?: string | null;
    verifying?: boolean;
    confirmLabel?: string;
}

const PIN_LENGTH = 6;

export default function SecurityPinModal({
    open,
    onOpenChange,
    onConfirm,
    title = "Security PIN",
    description = "Enter the store's 6-digit security PIN to continue.",
    error,
    verifying = false,
    confirmLabel = "Confirm",
}: SecurityPinModalProps) {
    const [pin, setPin] = useState<string[]>(Array(PIN_LENGTH).fill(""));
    const refs = useRef<Array<HTMLInputElement | null>>([]);

    useEffect(() => {
        if (open) {
            setPin(Array(PIN_LENGTH).fill(""));
            setTimeout(() => refs.current[0]?.focus(), 60);
        }
    }, [open ]);

    const handleChange = (index: number, value: string) => {
        const digit = value.replace(/\D/g, "").slice(-1);
        setPin((prev) => {
            const next = [...prev];
            next[index] = digit;
            return next;
        });
        if (digit && index < PIN_LENGTH - 1) {
            refs.current[index + 1]?.focus();
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Backspace" && !pin[index] && index > 0) {
            refs.current[index - 1]?.focus();
        }
        if (e.key === "Enter") {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handlePaste = (e: React.ClipboardEvent) => {
        const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
        if (!text) return;
        e.preventDefault();
        const next = Array(PIN_LENGTH).fill("");
        text.split("").forEach((d, i) => { next[i] = d; });
        setPin(next);
        refs.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
    };

    const handleSubmit = () => {
        const value = pin.join("");
        if (value.length !== PIN_LENGTH || verifying) return;
        onConfirm(value);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xs" onPaste={handlePaste}>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <ShieldCheck className="size-4 text-primary" />
                        {title}
                    </DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                <div className="flex items-center justify-center gap-1.5 py-2">
                    {pin.map((d, i) => (
                        <input
                            key={i}
                            ref={(el) => { refs.current[i] = el; }}
                            type="password"
                            inputMode="numeric"
                            autoComplete="off"
                            maxLength={1}
                            value={d}
                            disabled={verifying}
                            onChange={(e) => handleChange(i, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(i, e)}
                            className={cn(
                                "h-11 w-10 rounded-md border text-center text-lg font-mono tracking-widest outline-none transition",
                                "focus:border-primary focus:ring-2 focus:ring-primary/20",
                                error ? "border-destructive" : "border-input",
                            )}
                        />
                    ))}
                </div>
                {error && <p className="text-center text-xs text-destructive">{error}</p>}
                <DialogFooter className="sm:justify-stretch">
                    <Button
                        className="w-full"
                        disabled={pin.join("").length !== PIN_LENGTH || verifying}
                        onClick={handleSubmit}
                    >
                        {verifying ? "Verifying…" : confirmLabel}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

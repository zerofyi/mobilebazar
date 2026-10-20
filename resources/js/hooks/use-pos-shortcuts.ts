import { useEffect } from "react";

/**
 * Global POS keyboard shortcuts.
 * Stable across versions — cashiers memorize these.
 *
 * F2 or / ......... Focus product search
 * F4 .............. New sale (clear cart)
 * F5 .............. Park sale
 * F8 .............. Toggle paid-in-full
 * F9 .............. Go to payment / submit
 * Escape .......... Close modal / dropdown, or blur search
 * Ctrl+Enter ...... Submit from anywhere
 */
export interface PosShortcuts {
    onFocusSearch?: () => void;
    onNewSale?: () => void;
    onPark?: () => void;
    onTogglePaid?: () => void;
    onSubmit?: () => void;
    onEscape?: () => void;
}

function isTyping(): boolean {
    const t = document.activeElement as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");
}

export function usePosShortcuts(s: PosShortcuts): void {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            // F2 — focus search (works even while typing)
            if (e.key === "F2") {
                e.preventDefault();
                s.onFocusSearch?.();
                return;
            }
            // "/" — focus search when not typing
            if (e.key === "/" && !isTyping()) {
                e.preventDefault();
                s.onFocusSearch?.();
                return;
            }
            // F4 — new sale
            if (e.key === "F4" && !isTyping()) {
                e.preventDefault();
                s.onNewSale?.();
                return;
            }
            // F5 — park sale
            if (e.key === "F5" && !isTyping()) {
                e.preventDefault();
                s.onPark?.();
                return;
            }
            // F8 — toggle paid in full
            if (e.key === "F8" && !isTyping()) {
                e.preventDefault();
                s.onTogglePaid?.();
                return;
            }
            // F9 — submit / payment
            if (e.key === "F9") {
                e.preventDefault();
                s.onSubmit?.();
                return;
            }
            // Ctrl+Enter — submit from anywhere
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                s.onSubmit?.();
                return;
            }
            // Escape — let the component handle (close modal/dropdown)
            if (e.key === "Escape") {
                s.onEscape?.();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [s.onFocusSearch, s.onNewSale, s.onTogglePaid, s.onSubmit, s.onEscape]);
}

/** Shortcut hints for the cheatsheet / tooltips. */
export const POS_SHORTCUTS = [
    { key: "F2", label: "Focus search" },
    { key: "F4", label: "New sale" },
    { key: "F8", label: "Paid in full" },
    { key: "F9", label: "Payment" },
    { key: "Ctrl+Enter", label: "Submit" },
    { key: "Esc", label: "Close" },
] as const;

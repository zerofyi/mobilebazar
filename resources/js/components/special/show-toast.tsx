import { usePage } from "@inertiajs/react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

interface FlashPayload {
    success?: string | null;
    error?: string | null;
    info?: string | null;
    warning?: string | null;
}

export default function ShowToast() {
    const { flash, errors } = usePage<{ flash: FlashPayload; errors: Record<string, string> }>().props;

    // Tracks the last shown message to prevent double execution triggers
    const lastToastRef = useRef<string | null>(null);

    useEffect(() => {
        if (!errors) return;

        const errorKeys = Object.keys(errors);
        if (errorKeys.length > 0) {
            const firstErrorMessage = errors[errorKeys[0]];
            toast.error(firstErrorMessage);
        }
    }, [errors]);

    useEffect(() => {
        if (!flash) return;

        // Determine which alert message string is active
        const currentMessage = flash.success || flash.error || flash.info || flash.warning;

        // If no message text exists, or we have already rendered this exact message string, abort!
        if (!currentMessage || lastToastRef.current === currentMessage) {
            return;
        }

        // Fire the exact type matching the payload key
        if (flash.success) {
            toast.success(flash.success);
        } else if (flash.error) {
            toast.error(flash.error);
        } else if (flash.info) {
            toast.info(flash.info);
        } else if (flash.warning) {
            toast.warning(flash.warning);
        }

        // Save the rendered message string to our persistent ref barrier
        lastToastRef.current = currentMessage;

    }, [flash]); // Keeps listening to flashes, but guards against reference duplicate runs

    return (
        <Toaster theme="system" position="bottom-right" closeButton richColors />
    );
}

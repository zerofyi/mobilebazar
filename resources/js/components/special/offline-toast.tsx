'use client';

import { WifiOff, Wifi, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Bottom-left connectivity toast.
 * - Offline: shows immediately, stays visible until real connectivity returns
 *   or it's manually closed.
 * - Online: browser "online" events aren't fully trustworthy (captive portals,
 *   flaky routers can fire it before internet actually works), so we verify
 *   with a lightweight same-origin ping and retry until it actually succeeds.
 *   Once confirmed, shows a green "restored" toast with a countdown, then
 *   auto-hides. Can be closed manually at any time.
 */

const EXIT_ANIMATION_MS = 200;
const RESTORED_AUTO_HIDE_MS = 4000;
const PING_TIMEOUT_MS = 4000;
const PING_RETRY_MS = 3000;
const DEFAULT_PING_URL = '/favicon.ico';

interface OfflineToastProps {
    /** Same-origin URL pinged to confirm real connectivity (not just navigator.onLine). */
    pingUrl?: string;
    /** How long the "restored" toast stays up before auto-hiding, in ms. */
    autoHideDuration?: number;
}

export default function OfflineToast({
    pingUrl = DEFAULT_PING_URL,
    autoHideDuration = RESTORED_AUTO_HIDE_MS,
}: OfflineToastProps) {
    const [isOffline, setIsOffline] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [closing, setClosing] = useState(false);

    const wasOfflineRef = useRef(false);
    const isMountedRef = useRef(true);
    const verifyTokenRef = useRef(0);
    const autoHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unmountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearAllTimers = useCallback(() => {
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
        if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
    }, []);

    const show = useCallback(() => {
        if (unmountTimerRef.current) clearTimeout(unmountTimerRef.current);
        setClosing(false);
        setRendered(true);
    }, []);

    const hide = useCallback(() => {
        if (autoHideTimerRef.current) clearTimeout(autoHideTimerRef.current);
        setClosing(true);
        // Let the exit animation play before actually removing the node.
        unmountTimerRef.current = setTimeout(() => {
            if (!isMountedRef.current) return;
            setRendered(false);
            setClosing(false);
        }, EXIT_ANIMATION_MS);
    }, []);

    // Pings a same-origin resource to confirm real internet access, since
    // navigator.onLine / the "online" event can be wrong.
    const pingOnce = useCallback(
        (onResult: (reachable: boolean) => void) => {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);

            fetch(pingUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
                .then((res) => onResult(res.ok))
                .catch(() => onResult(false))
                .finally(() => clearTimeout(timeout));
        },
        [pingUrl]
    );

    useEffect(() => {
        isMountedRef.current = true;

        const initiallyOffline = !navigator.onLine;
        setIsOffline(initiallyOffline);
        wasOfflineRef.current = initiallyOffline;
        if (initiallyOffline) show();

        function confirmRestored() {
            if (!isMountedRef.current) return;
            setIsOffline(false);
            show();
            autoHideTimerRef.current = setTimeout(hide, autoHideDuration);
        }

        function attemptVerify(token: number) {
            pingOnce((reachable) => {
                // Bail out if a newer offline/online event superseded this check.
                if (!isMountedRef.current || token !== verifyTokenRef.current) return;

                if (reachable) {
                    confirmRestored();
                } else {
                    verifyTimerRef.current = setTimeout(() => attemptVerify(token), PING_RETRY_MS);
                }
            });
        }

        function handleOffline() {
            verifyTokenRef.current += 1; // invalidate any in-flight verification
            clearAllTimers();
            wasOfflineRef.current = true;
            setIsOffline(true);
            show();
        }

        function handleOnline() {
            if (!wasOfflineRef.current) return; // nothing to restore from
            wasOfflineRef.current = false;
            const token = (verifyTokenRef.current += 1);
            attemptVerify(token);
        }

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        return () => {
            isMountedRef.current = false;
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
            clearAllTimers();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (!rendered) return null;

    const transitionClass = closing
        ? 'animate-out fade-out slide-out-to-bottom-2 duration-200'
        : 'animate-in fade-in slide-in-from-bottom-2 duration-300';

    return (
        <div
            role="status"
            aria-live={isOffline ? 'assertive' : 'polite'}
            className={`fixed bottom-4 left-4 z-9999 flex w-[calc(100%-2rem)] max-w-sm min-w-70 items-center gap-3 overflow-hidden rounded-lg px-4 py-3 shadow-lg text-white transition-colors duration-300 motion-reduce:transition-none motion-reduce:animate-none ${transitionClass} ${
                isOffline ? 'bg-zinc-900 border border-zinc-800' : 'bg-emerald-700'
            }`}
        >
            <span className="relative flex shrink-0 items-center justify-center">
                <WifiOff
                    size={20}
                    className={`absolute text-red-400 transition-all duration-300 motion-reduce:transition-none ${
                        isOffline ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                    }`}
                />
                <Wifi
                    size={20}
                    className={`text-emerald-300 transition-all duration-300 motion-reduce:transition-none ${
                        isOffline ? 'opacity-0 scale-75' : 'opacity-100 scale-100'
                    }`}
                />
            </span>

            <div className="flex-1 text-sm leading-snug font-medium">
                {isOffline
                    ? 'You are currently offline.'
                    : 'Your internet connection was restored.'}

                {isOffline && (
                    <button
                        onClick={() => window.location.reload()}
                        className="ml-2 underline underline-offset-2 hover:text-zinc-300 active:text-zinc-400 transition-colors"
                    >
                        Refresh
                    </button>
                )}
            </div>

            <button
                onClick={hide}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 hover:bg-white/10 active:bg-white/20 transition-colors"
            >
                <X size={16} />
            </button>

            {!isOffline && (
                <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-emerald-300/60 motion-reduce:hidden"
                    style={{ animation: `offline-toast-progress ${autoHideDuration}ms linear forwards` }}
                />
            )}

            <style>{`
                @keyframes offline-toast-progress {
                    from { transform: scaleX(1); }
                    to { transform: scaleX(0); }
                }
            `}</style>
        </div>
    );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { CatalogVariant, Party } from '@/pages/Billing/PurchaseEntry/purchase-context';

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") ?? "";
}

async function jsonGet<T>(url: string, params: Record<string, string>, signal?: AbortSignal): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": getCsrfToken() },
        signal,
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json() as Promise<T>;
}

// ─── Party search (50+ stores safe: debounced, abortable, store-scoped) ─────
export function usePartySearch(partyType: "customer" | "supplier") {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Party[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (query.trim().length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<Party[]>(`/app/${partyType}s/search`, { q: query.trim() }, controller.signal);
                setResults(data);
            } catch (e: any) {
                if (e?.name !== "AbortError") setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            controller.abort();
        };
    }, [query, partyType]);

    const clear = useCallback(() => {
        setQuery("");
        setResults([]);
    }, []);

    return { query, setQuery, results, loading, clear };
}

// ─── Catalog variant search ─────────────────────────────────────────────────
// Hits ProductVariantSearchController which joins:
//   product_variants → products (name, hsn_code, is_serialized)
//                    → tax_categories (rate as tax_pct)
// Returns the CatalogVariant shape from purchase-context.
export function useVariantSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CatalogVariant[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (query.trim().length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<CatalogVariant[]>(
                    "/app/products/variants/search",
                    { q: query.trim() },
                    controller.signal
                );
                setResults(data);
            } catch (e: any) {
                if (e?.name !== "AbortError") setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            controller.abort();
        };
    }, [query]);

    const clearQuery = useCallback(() => {
        setQuery("");
        setResults([]);
    }, []);

    return { query, setQuery, results, loading, clearQuery };
}

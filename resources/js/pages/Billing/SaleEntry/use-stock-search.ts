import { useCallback, useEffect, useRef, useState } from "react";
import type { StockSearchResult } from "./sale-context";

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

interface StockSearchResponse {
    results: StockSearchResult[];
}

// ─── POS stock search ────────────────────────────────────────────────────────
// One omnibox for IMEI 1/2, serial, barcode, SKU, product/variant name.
// Debounced 250ms, abortable, min 2 chars. Exact IMEI/serial hits come back
// with `exact_unit` set so the UI can add the unit instantly.
export function useStockSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<StockSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = query.trim();
        if (q.length < 2) {
            setResults([]);
            setLoading(false);
            setSearched(false);
            return;
        }
        const controller = new AbortController();
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<StockSearchResponse>("/app/sales/stock/search", { q }, controller.signal);
                setResults(Array.isArray(data.results) ? data.results : []);
                setSearched(true);
            } catch (e: unknown) {
                if ((e as { name?: string })?.name !== "AbortError") {
                    setResults([]);
                    setSearched(true);
                }
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            controller.abort();
        };
    }, [query]);

    const clear = useCallback(() => {
        setQuery("");
        setResults([]);
        setSearched(false);
    }, []);

    return { query, setQuery, results, loading, searched, clear };
}

// ─── Supplier ("party") search ───────────────────────────────────────────────
// Same contract as /app/customers/search. Suppliers carry company_name and
// GSTIN; the UI shows company_name ?: name.

export interface SupplierResult {
    id: number;
    uuid: string;
    name: string;
    company_name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
}

export function useSupplierSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<SupplierResult[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = query.trim();
        if (q.length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<SupplierResult[]>("/app/suppliers/search", { q }, controller.signal);
                setResults(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if ((e as { name?: string })?.name !== "AbortError") setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            controller.abort();
        };
    }, [query]);

    const clear = useCallback(() => {
        setQuery("");
        setResults([]);
    }, []);

    return { query, setQuery, results, loading, clear };
}

// ─── Customer search ─────────────────────────────────────────────────────────

export interface CustomerResult {
    id: number;
    uuid: string;
    name: string;
    phone: string | null;
    phone_primary?: string | null;
    email?: string | null;
    gstin?: string | null;
    care_of?: string | null;
}

export function useCustomerSearch() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<CustomerResult[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        const q = query.trim();
        if (q.length < 3) {
            setResults([]);
            setLoading(false);
            return;
        }
        const controller = new AbortController();
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<CustomerResult[]>("/app/customers/search", { q }, controller.signal);
                setResults(Array.isArray(data) ? data : []);
            } catch (e: unknown) {
                if ((e as { name?: string })?.name !== "AbortError") setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => {
            if (timer.current) clearTimeout(timer.current);
            controller.abort();
        };
    }, [query]);

    const clear = useCallback(() => {
        setQuery("");
        setResults([]);
    }, []);

    return { query, setQuery, results, loading, clear };
}

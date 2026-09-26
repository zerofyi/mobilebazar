import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogVariant, Party } from '../pages/App/Purchases/purchase-context';

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

async function jsonGet<T>(url: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${url}?${qs}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
    });
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    return res.json() as Promise<T>;
}

// ─── Party search ─────────────────────────────────────────────────────────────

export function usePartySearch(partyType: 'customer' | 'supplier') {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<Party[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<Party[]>(`/app/${partyType}s/search`, { q: query });
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query, partyType]);

    return { query, setQuery, results, loading };
}

// ─── Variant / catalog search ─────────────────────────────────────────────────

export function useVariantSearch() {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CatalogVariant[]>([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const data = await jsonGet<CatalogVariant[]>('/app/products/variants/search', { q: query });
                setResults(data);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 280);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query]);

    return { query, setQuery, results, loading, clearQuery: useCallback(() => { setQuery(''); setResults([]); }, []) };
}

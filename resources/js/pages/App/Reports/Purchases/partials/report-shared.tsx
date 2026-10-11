import React, { useCallback, useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import { Loader2, Search, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { cn } from '@/lib/utils';

// ─── Laravel-style paginator links (shared by all report pages) ─────────────

export interface ReportLinkItem {
    url: string | null;
    label: string;
    active: boolean;
}

export function ReportPagination({
    links,
    from,
    to,
    total,
    label,
}: {
    links: ReportLinkItem[];
    from: number | null;
    to: number | null;
    total: number;
    label: string;
}) {
    const lastPage = links.filter((l) => !l.label.includes('Previous') && !l.label.includes('Next')).length;
    if (lastPage <= 1) return null;

    const prevLink = links.find((l) => l.label.includes('Previous'));
    const nextLink = links.find((l) => l.label.includes('Next'));
    const pageLinks = links.filter((l) => !l.label.includes('Previous') && !l.label.includes('Next'));

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/50 px-4 py-3 bg-muted/10">
            <p className="text-xs text-muted-foreground">
                Showing <span className="font-medium text-foreground">{from ?? 0}</span> to{' '}
                <span className="font-medium text-foreground">{to ?? 0}</span> of{' '}
                <span className="font-medium text-foreground">{total ?? 0}</span> {label}
            </p>

            <Pagination className="w-auto mx-0">
                <PaginationContent className="gap-1">
                    <PaginationItem>
                        <PaginationPrevious
                            href={prevLink?.url ?? '#'}
                            className={cn('h-8 text-xs px-2.5', !prevLink?.url && 'pointer-events-none opacity-40')}
                            onClick={(e) => {
                                if (!prevLink?.url) return;
                                e.preventDefault();
                                router.get(prevLink.url, {}, { preserveState: true });
                            }}
                        />
                    </PaginationItem>

                    {pageLinks.map((link, idx) => (
                        <PaginationItem key={idx}>
                            <PaginationLink
                                href={link.url ?? '#'}
                                isActive={link.active}
                                className="h-8 w-8 text-xs"
                                onClick={(e) => {
                                    if (!link.url || link.active) return;
                                    e.preventDefault();
                                    router.get(link.url, {}, { preserveState: true });
                                }}
                            >
                                {link.label.replace(/&laquo;|&raquo;/g, '').trim()}
                            </PaginationLink>
                        </PaginationItem>
                    ))}

                    <PaginationItem>
                        <PaginationNext
                            href={nextLink?.url ?? '#'}
                            className={cn('h-8 text-xs px-2.5', !nextLink?.url && 'pointer-events-none opacity-40')}
                            onClick={(e) => {
                                if (!nextLink?.url) return;
                                e.preventDefault();
                                router.get(nextLink.url, {}, { preserveState: true });
                            }}
                        />
                    </PaginationItem>
                </PaginationContent>
            </Pagination>
        </div>
    );
}

// ─── Debounced remote search combobox (supplier / variant pickers) ───────────

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

export interface SearchHit {
    id: number;
    title: string;
    subtitle?: string | null;
}

export function RemoteSearchPicker({
    url,
    placeholder,
    value,
    onPick,
    onClear,
    mapHit,
    className,
}: {
    /** Wayfinder-generated GET search URL, e.g. app.suppliers.search.url() */
    url: string;
    placeholder: string;
    /** Currently selected hit (chip shown instead of input), or null */
    value: SearchHit | null;
    onPick: (hit: SearchHit) => void;
    onClear: () => void;
    mapHit: (raw: any) => SearchHit;
    className?: string;
}) {
    const [query, setQuery] = useState('');
    const [hits, setHits] = useState<SearchHit[]>([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const onDocClick = (e: MouseEvent) => {
            if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    const runSearch = useCallback(
        (q: string) => {
            if (timer.current) clearTimeout(timer.current);
            const trimmed = q.trim();
            if (trimmed.length < 2) {
                setHits([]);
                setLoading(false);
                return;
            }
            const controller = new AbortController();
            timer.current = setTimeout(async () => {
                setLoading(true);
                try {
                    const res = await fetch(`${url}?${new URLSearchParams({ q: trimmed })}`, {
                        credentials: 'same-origin',
                        headers: { Accept: 'application/json', 'X-CSRF-TOKEN': getCsrfToken() },
                        signal: controller.signal,
                    });
                    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
                    const data = await res.json();
                    setHits((Array.isArray(data) ? data : []).map(mapHit));
                    setOpen(true);
                } catch {
                    setHits([]);
                } finally {
                    setLoading(false);
                }
            }, 250);
            return () => controller.abort();
        },
        [url, mapHit]
    );

    if (value) {
        return (
            <div className={cn('flex items-center gap-2 h-9 rounded-md border border-border bg-primary/5 pl-3 pr-1.5 text-xs', className)}>
                <span className="font-semibold text-foreground truncate">{value.title}</span>
                {value.subtitle && <span className="text-muted-foreground truncate">{value.subtitle}</span>}
                <button
                    type="button"
                    onClick={() => {
                        setQuery('');
                        setHits([]);
                        onClear();
                    }}
                    className="ml-auto shrink-0 rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    aria-label="Clear selection"
                >
                    <X className="size-3.5" />
                </button>
            </div>
        );
    }

    return (
        <div ref={boxRef} className={cn('relative', className)}>
            <div className="relative">
                <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
                <Input
                    placeholder={placeholder}
                    className="pl-9 pr-8 h-9 bg-muted/40 text-xs transition-colors focus:bg-background"
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        runSearch(e.target.value);
                    }}
                    onFocus={() => hits.length > 0 && setOpen(true)}
                />
                {loading && <Loader2 className="absolute right-3 top-2.5 size-4 text-muted-foreground animate-spin" />}
            </div>
            {open && hits.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-60 overflow-auto">
                    {hits.map((hit) => (
                        <button
                            key={hit.id}
                            type="button"
                            onClick={() => {
                                setOpen(false);
                                setQuery('');
                                setHits([]);
                                onPick(hit);
                            }}
                            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-xs hover:bg-muted/60"
                        >
                            <span className="font-semibold text-foreground">{hit.title}</span>
                            {hit.subtitle && <span className="text-muted-foreground">{hit.subtitle}</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export function fmtDate(iso: string | null | undefined) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

import React, { useEffect, useRef, useState } from "react";
import { Link } from "@inertiajs/react";
import {
    Command, CommandDialog, CommandEmpty, CommandGroup,
    CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Cpu, Layers, Package, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VerifyResult {
    kind: "unit" | "batch" | "variant";
    id: number;
    title: string;
    identifier: string;
    status: string;
    meta: string;
}

interface VerifyResponse {
    units: VerifyResult[];
    batches: VerifyResult[];
    variants: VerifyResult[];
}

function statusTone(status: string): string {
    switch (status) {
        case "available":
        case "in_stock":
            return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20";
        case "reserved":
            return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20";
        case "sold":
        case "empty":
            return "bg-muted text-muted-foreground border-border";
        default:
            return "border-border";
    }
}

const KIND_ICON = { unit: Cpu, batch: Layers, variant: Package } as const;
const KIND_LABEL = { unit: "Serialized units", batch: "Batches", variant: "Products" } as const;

export default function VerifyStockModal({
    open, onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState<VerifyResponse | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Debounced live search — min 2 chars, like the POS omnibox.
    useEffect(() => {
        if (!open) {
            setQuery("");
            setResults(null);
            return;
        }
    }, [open ]);

    useEffect(() => {
        const q = query.trim();
        if (q.length < 2) {
            setResults(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;

        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/app/inventory/verify/search?q=${encodeURIComponent(q)}`, {
                    signal: controller.signal,
                    headers: { Accept: "application/json" },
                });
                if (!res.ok) throw new Error("search failed");
                const json = (await res.json()) as VerifyResponse;
                setResults(json);
            } catch {
                if (!controller.signal.aborted) setResults({ units: [], batches: [], variants: [] });
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        }, 300);

        return () => {
            clearTimeout(t);
            controller.abort();
        };
    }, [query]);

    const groups: { kind: VerifyResult["kind"]; items: VerifyResult[] }[] = [
        { kind: "unit", items: results?.units ?? [] },
        { kind: "batch", items: results?.batches ?? [] },
        { kind: "variant", items: results?.variants ?? [] },
    ];
    const total = groups.reduce((n, g) => n + g.items.length, 0);

    return (
        <CommandDialog open={open} onOpenChange={onOpenChange}>
            <Command>
                <div className="relative">
                    <CommandInput
                        placeholder="Verify stock — type IMEI, serial, batch no, name, SKU…"
                        value={query}
                        onValueChange={setQuery}
                    />
                    {loading && (
                        <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </div>
                <CommandList className="max-h-[60vh]">
                {query.trim().length >= 2 && total === 0 && !loading && (
                    <CommandEmpty>No stock found for “{query.trim()}”.</CommandEmpty>
                )}
                {query.trim().length < 2 && (
                    <div className="px-4 py-8 text-center text-xs text-muted-foreground">
                        Type at least 2 characters — IMEI, serial number, batch number,
                        product name, SKU or barcode.
                    </div>
                )}
                {groups.map(({ kind, items }) => {
                    if (items.length === 0) return null;
                    const Icon = KIND_ICON[kind];
                    return (
                        <CommandGroup key={kind} heading={KIND_LABEL[kind]}>
                            {items.map((r) => (
                                <CommandItem
                                    key={`${r.kind}-${r.id}`}
                                    value={`${r.title} ${r.identifier}`}
                                    className="flex items-center gap-3 py-2"
                                >
                                    <Icon className="size-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-xs font-medium">{r.title}</div>
                                        <div className="truncate font-mono text-[10px] text-muted-foreground">
                                            {r.identifier}
                                            {r.meta && <span className="ml-1.5 font-sans">· {r.meta}</span>}
                                        </div>
                                    </div>
                                    {r.status !== "—" && (
                                        <Badge variant="outline" className={cn("shrink-0 text-[10px] capitalize", statusTone(r.status))}>
                                            {r.status.replace("_", " ")}
                                        </Badge>
                                    )}
                                    <Button variant="ghost" size="sm" asChild className="h-7 shrink-0 px-2 text-xs">
                                        <Link href={`/app/inventory/verify/${r.kind}/${r.id}`}>
                                            <Eye className="mr-1 size-3.5" /> View
                                        </Link>
                                    </Button>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    );
                })}
                </CommandList>
            </Command>
        </CommandDialog>
    );
}

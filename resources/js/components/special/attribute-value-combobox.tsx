import React, { useState } from 'react';
import { Check, ChevronsUpDown, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

import type { AttributeValueItem } from './variant-attribute-picker';

function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ?? '';
}

interface AttributeValueComboboxProps {
    /** the attribute's route-key (uuid), used to hit POST /app/attributes/{attribute}/values */
    attributeUuid: string;
    values: AttributeValueItem[];
    value: string; // selected attribute_value_id, as a string
    onSelect: (valueId: string) => void;
    onValueCreated: (newValue: AttributeValueItem) => void;
    placeholder?: string;
    disabled?: boolean;
}

/**
 * A select + search + "create if missing" combobox for attributes with unlimited,
 * non-predefined values (Color is the canonical example — you can't enumerate every
 * shade up front like you can with RAM or Storage).
 *
 * Adjust the endpoint / CSRF handling below to match your app's conventions if you
 * don't render a `<meta name="csrf-token">` tag in your root layout.
 */
export default function AttributeValueCombobox({
    attributeUuid,
    values,
    value,
    onSelect,
    onValueCreated,
    placeholder = 'Select or add a value',
    disabled = false,
}: AttributeValueComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selected = values.find((v) => String(v.id) === value);
    const filtered = query.trim()
        ? values.filter((v) => v.value.toLowerCase().includes(query.trim().toLowerCase()))
        : values;

    const exactMatch = values.find((v) => v.value.toLowerCase() === query.trim().toLowerCase());
    const canOfferCreate = query.trim().length > 0 && !exactMatch;

    const handleSelect = (valueId: string) => {
        onSelect(valueId);
        setQuery('');
        setError(null);
        setOpen(false);
    };

    const handleCreate = async () => {
        const newValue = query.trim();
        if (!newValue) return;

        // Someone may have typed a case-variant of something that already exists.
        if (exactMatch) {
            handleSelect(String(exactMatch.id));
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const res = await fetch(`/app/attributes/${attributeUuid}/values`, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({ value: newValue }),
            });

            if (!res.ok) {
                const body = await res.json().catch(() => null);
                const message = body?.errors?.value?.[0] || body?.message || 'Could not save this value.';
                throw new Error(message);
            }

            const created: AttributeValueItem = await res.json();
            onValueCreated(created);
            handleSelect(String(created.id));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Popover
            open={open}
            onOpenChange={(o) => {
                setOpen(o);
                if (!o) setError(null);
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className="h-9 w-full justify-between text-xs font-normal"
                >
                    <span className={cn('truncate', !selected && 'text-muted-foreground')}>
                        {selected ? selected.value : placeholder}
                    </span>
                    <ChevronsUpDown className="ml-2 size-3.5 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-55 p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Search or type new..."
                        value={query}
                        onValueChange={setQuery}
                        className="h-8 text-xs"
                    />
                    <CommandList>
                        {filtered.length === 0 && !canOfferCreate && (
                            <CommandEmpty className="px-3 py-3 text-xs text-muted-foreground">
                                Type to search or add a value.
                            </CommandEmpty>
                        )}

                        {filtered.length > 0 && (
                            <CommandGroup>
                                {filtered.map((v) => (
                                    <CommandItem
                                        key={v.id}
                                        value={v.value}
                                        onSelect={() => handleSelect(String(v.id))}
                                        className="text-xs"
                                    >
                                        <Check
                                            className={cn(
                                                'mr-2 size-3.5',
                                                String(v.id) === value ? 'opacity-100' : 'opacity-0',
                                            )}
                                        />
                                        {v.value}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        )}

                        {canOfferCreate && (
                            <CommandGroup>
                                <button
                                    type="button"
                                    disabled={saving}
                                    onClick={handleCreate}
                                    className="flex w-full items-center gap-2 px-2 py-1.5 text-xs text-primary hover:bg-accent rounded-sm disabled:opacity-60"
                                >
                                    {saving ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : (
                                        <Plus className="size-3.5" />
                                    )}
                                    {saving ? 'Saving…' : `Add "${query.trim()}"`}
                                </button>
                            </CommandGroup>
                        )}

                        {error && <p className="px-2 py-1.5 text-[11px] text-destructive">{error}</p>}
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface AttributeValueItem {
    id: number;
    uuid: string;
    attribute_id: number;
    value: string;
}

export interface AttributeItem {
    id: number;
    uuid: string;
    name: string;
    values: AttributeValueItem[];
}

export interface VariantAttributeRow {
    /** local-only id used as a React key, never sent to the backend */
    id: string;
    attribute_id: string;
    attribute_value_id: string;
}

interface VariantAttributePickerProps {
    attributes: AttributeItem[];
    rows: VariantAttributeRow[];
    onChange: (rows: VariantAttributeRow[]) => void;
    disabled?: boolean;
}

export function uid(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
    return Math.random().toString(36).slice(2, 10);
}

/**
 * Row-based Attribute → Value picker used inside a variant.
 * One row = one attribute axis (e.g. "Color") mapped to one value (e.g. "Red").
 * A given attribute can only be used once per variant, so already-picked
 * attributes are hidden from the other rows' dropdowns.
 */
export default function VariantAttributePicker({
    attributes,
    rows,
    onChange,
    disabled = false,
}: VariantAttributePickerProps) {
    const addRow = () => {
        onChange([...rows, { id: uid(), attribute_id: '', attribute_value_id: '' }]);
    };

    const removeRow = (rowId: string) => {
        onChange(rows.filter((r) => r.id !== rowId));
    };

    const updateRow = (rowId: string, field: 'attribute_id' | 'attribute_value_id', value: string) => {
        onChange(
            rows.map((r) => {
                if (r.id !== rowId) return r;
                // Changing the attribute resets the previously selected value
                if (field === 'attribute_id') return { ...r, attribute_id: value, attribute_value_id: '' };
                return { ...r, [field]: value };
            }),
        );
    };

    const availableAttributesFor = (rowId: string) => {
        const usedElsewhere = rows.filter((r) => r.id !== rowId).map((r) => r.attribute_id);
        return attributes.filter((a) => !usedElsewhere.includes(String(a.id)));
    };

    const valuesFor = (attributeId: string) => {
        return attributes.find((a) => String(a.id) === attributeId)?.values ?? [];
    };

    const canAddMore = availableAttributesFor('__new__').length > 0;

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-muted-foreground">
                    Attributes <span className="font-normal text-muted-foreground/70">(Color, RAM, Storage, etc.)</span>
                </Label>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={disabled || !canAddMore}
                    onClick={addRow}
                    className="h-7 gap-1 text-xs"
                >
                    <Plus className="size-3.5" /> Add Attribute
                </Button>
            </div>

            {rows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-center text-[11.5px] text-muted-foreground">
                    No attributes added yet — click &ldquo;Add Attribute&rdquo; if this variant needs one (e.g. Color, Size).
                </div>
            ) : (
                <div className="space-y-2">
                    {rows.map((row) => (
                        <div key={row.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                            <Select
                                value={row.attribute_id}
                                onValueChange={(val) => updateRow(row.id, 'attribute_id', val)}
                                disabled={disabled}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select attribute" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableAttributesFor(row.id).map((attr) => (
                                        <SelectItem key={attr.id} value={String(attr.id)}>
                                            {attr.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Select
                                value={row.attribute_value_id}
                                onValueChange={(val) => updateRow(row.id, 'attribute_value_id', val)}
                                disabled={disabled || !row.attribute_id}
                            >
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select value" />
                                </SelectTrigger>
                                <SelectContent>
                                    {valuesFor(row.attribute_id).map((val) => (
                                        <SelectItem key={val.id} value={String(val.id)}>
                                            {val.value}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                disabled={disabled}
                                onClick={() => removeRow(row.id)}
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

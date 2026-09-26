import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import {
    Package,
    Plus,
    Trash2,
    Barcode as BarcodeIcon,
    Fingerprint,
    Boxes,
    Layers,
    RefreshCw,
    AlertTriangle,
} from 'lucide-react';

import products from '@/routes/app/products';
import { dashboard } from '@/routes';

import MultipleImageUploader from '@/components/special/multiple-image-uploader';
import DescriptionEditor from '@/components/special/description-editor';
import VariantAttributePicker, {
    uid,
    type AttributeItem,
    type AttributeValueItem,
    type VariantAttributeRow,
} from '@/components/special/variant-attribute-picker';
import AttributeValueCombobox from '@/components/special/attribute-value-combobox';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OptionItem {
    id: number;
    name: string;
    tax_percent?: number;
}

interface UnitOption {
    id: number;
    name: string;
    short_code: string;
    multiplier?: string | number;
}

interface CreateProps {
    categories: OptionItem[];
    brands: OptionItem[];
    taxCategories: OptionItem[];
    units: UnitOption[];
    attributes: AttributeItem[];
}

interface VariantFormState {
    variant_name: string;
    sku: string;
    barcode: string;
    unit_id: string;
    net_quantity: string;
    mrp: string;
    selling_price: string;
    cost_price: string;
    min_selling_price: string;
    compare_price: string;
    weight: string;
    stock_alert_qty: string;
    is_active: boolean;
    attributes: VariantAttributeRow[];
    /** Dedicated slot for Color — kept out of `attributes` so it never interacts with
     *  the RAM/Storage auto-fill logic below. Holds a selected attribute_value_id. */
    color_attribute_value_id: string;
    images: File[];
}

const MAX_VARIANT_IMAGES = 5;

function slugify(text: string): string {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]+/g, '')
        .replace(/--+/g, '-');
}

function randomHex(length = 4): string {
    return Math.random().toString(36).substring(2, 2 + length).toUpperCase();
}

function findAttributeByKeyword(attributes: AttributeItem[], keyword: string) {
    return attributes.find((a) => a.name.toLowerCase().includes(keyword));
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Create({ categories, brands, taxCategories, units, attributes }: CreateProps) {
    const defaultUnitId = units[0]?.id ? String(units[0].id) : '';

    // Mutable copy of the `attributes` prop — grows in place when the user creates a
    // brand-new value (e.g. a new Color) via the combobox, with no page reload/visit.
    // This is only for the dedicated Color field below; it has nothing to do with
    // the generic VariantAttributePicker/`attributes` array or the Serialized effect.
    const [attributeCatalog, setAttributeCatalog] = useState<AttributeItem[]>(attributes);
    const colorAttribute = attributeCatalog.find((a) => /colou?r/i.test(a.name));

    const handleColorValueCreated = (newValue: AttributeValueItem) => {
        if (!colorAttribute) return;
        setAttributeCatalog((prev) =>
            prev.map((a) => (a.id === colorAttribute.id ? { ...a, values: [...a.values, newValue] } : a)),
        );
    };

    // Filter out Color/Colour from the list passed to VariantAttributePicker, since it has its own dedicated field.
    const genericAttributes = attributes.filter(
        (attr) => !/colou?r/i.test(attr.name)
    );

    const buildBlankVariant = useCallback(
        (prefillSerializedAttrs: boolean): VariantFormState => {
            const rows: VariantAttributeRow[] = [];
            if (prefillSerializedAttrs) {
                const ram = findAttributeByKeyword(genericAttributes, 'ram');
                const storage = findAttributeByKeyword(genericAttributes, 'storage');
                if (ram) rows.push({ id: uid(), attribute_id: String(ram.id), attribute_value_id: '' });
                if (storage) rows.push({ id: uid(), attribute_id: String(storage.id), attribute_value_id: '' });
            }
            return {
                variant_name: '',
                sku: '',
                barcode: '',
                unit_id: defaultUnitId,
                net_quantity: '1',
                mrp: '',
                selling_price: '',
                cost_price: '',
                min_selling_price: '',
                compare_price: '',
                weight: '',
                stock_alert_qty: prefillSerializedAttrs ? '1' : '5',
                is_active: true,
                attributes: rows,
                color_attribute_value_id: '',
                images: [],
            };
        },
        [genericAttributes, defaultUnitId],
    );

    const { data, setData, post, processing, errors, transform } = useForm({
        name: '',
        short_description: '',
        description: '',
        category_id: '',
        brand_id: '',
        tax_category_id: '3',
        hsn_code: '',
        warranty_months: 12,
        is_active: true,
        is_returnable: true,
        is_serialized: false,
        is_featured: false,
        is_trending: false,
        is_best_seller: false,
        variants: [buildBlankVariant(false)] as VariantFormState[],
    });

    // "Multiple Variants" toggle — when off, only variant #1 is ever shown/submitted.
    const [hasVariants, setHasVariants] = useState(false);

    // Flips to true only for the duration of a "Save as Draft" submit, read inside transform().
    const isDraftSubmitRef = useRef(false);

    // Strip local-only row ids before this hits the wire; the backend only needs attribute_value_id.
    // A draft submit also force-overrides is_active to false without touching the visible toggle.
    transform((formData) => ({
        ...formData,
        is_active: isDraftSubmitRef.current ? false : formData.is_active,
        variants: (hasVariants ? formData.variants : formData.variants.slice(0, 1)).map((v) => {
            const { color_attribute_value_id, attributes: attrRows, ...rest } = v;

            const attributeValueIds = attrRows.filter((r) => r.attribute_value_id).map((r) => r.attribute_value_id);
            if (color_attribute_value_id) attributeValueIds.push(color_attribute_value_id);

            return {
                ...rest,
                // Convert empty string numeric fields to null so Laravel validation accepts them
                is_active: isDraftSubmitRef.current ? false : v.is_active,
                mrp: v.mrp === '' ? null : v.mrp,
                selling_price: v.selling_price,
                cost_price: v.cost_price === '' ? null : v.cost_price,
                min_selling_price: v.min_selling_price === '' ? null : v.min_selling_price,
                compare_price: v.compare_price === '' ? null : v.compare_price,
                weight: v.weight === '' ? null : v.weight,
                stock_alert_qty: v.stock_alert_qty === '' ? null : v.stock_alert_qty,
                net_quantity: v.net_quantity === '' ? '1.0000' : v.net_quantity,
                attributes: attributeValueIds.map((id) => ({ attribute_value_id: id })),
            };
        }),
    }));

    // Turning Serialized on auto-suggests RAM & Storage rows for any variant that
    // doesn't already have attributes set. It never overwrites existing picks.
    useEffect(() => {
        const isSerialized = data.is_serialized;
        const defaultAlertQty = isSerialized ? '1' : '5';
        const ram = findAttributeByKeyword(genericAttributes, 'ram');
        const storage = findAttributeByKeyword(genericAttributes, 'storage');

        setData((prev) => ({
            ...prev,
            variants: prev.variants.map((v) => {
                const updatedAlertQty =
                    v.stock_alert_qty === '5' || v.stock_alert_qty === '1'
                        ? defaultAlertQty
                        : v.stock_alert_qty;

                if (!isSerialized || v.attributes.length > 0) {
                    return { ...v, stock_alert_qty: updatedAlertQty };
                }

                const rows: VariantAttributeRow[] = [];
                if (ram) rows.push({ id: uid(), attribute_id: String(ram.id), attribute_value_id: '' });
                if (storage) rows.push({ id: uid(), attribute_id: String(storage.id), attribute_value_id: '' });

                return { ...v, stock_alert_qty: updatedAlertQty, attributes: rows };
            }),
        }));
    }, [data.is_serialized]);

    const addVariant = () => {
        setData('variants', [...data.variants, buildBlankVariant(data.is_serialized)]);
    };

    const removeVariant = (index: number) => {
        if (data.variants.length === 1) return;
        setData('variants', data.variants.filter((_, i) => i !== index));
    };

    const updateVariantField = <K extends keyof VariantFormState>(
        variantIndex: number,
        field: K,
        value: VariantFormState[K],
    ) => {
        const updated = [...data.variants];
        updated[variantIndex] = { ...updated[variantIndex], [field]: value };
        setData('variants', updated);
    };

    const suggestSku = (index: number) => {
        const variant = data.variants[index];
        const prefix = slugify(data.name).substring(0, 4).toUpperCase() || 'PROD';
        const namePart = variant.variant_name ? slugify(variant.variant_name).substring(0, 8).toUpperCase() : 'VAR';
        updateVariantField(index, 'sku', `${prefix}-${namePart}-${randomHex(4)}`);
    };

    // Two variants with the exact same attribute combination (e.g. Red / 128GB twice)
    // are effectively the same variant — flag them so the seller can fix it before saving.
    const getVariantSignature = (variant: VariantFormState): string | null => {
        const values = variant.attributes.filter((r) => r.attribute_value_id).map((r) => r.attribute_value_id);
        if (variant.color_attribute_value_id) values.push(variant.color_attribute_value_id);
        const sorted = values.sort();
        return sorted.length > 0 ? sorted.join('|') : null;
    };

    const variantSignatures = data.variants.map(getVariantSignature);
    const duplicateVariantIndexes = new Set<number>(
        variantSignatures
            .map((sig, idx) => (sig && variantSignatures.some((s, i) => s === sig && i !== idx) ? idx : -1))
            .filter((idx) => idx !== -1),
    );
    const hasDuplicateVariants = duplicateVariantIndexes.size > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        isDraftSubmitRef.current = false;
        post(products.store.url(), { forceFormData: true, preserveScroll: true });
    };

    const handleSaveDraft = (e: React.FormEvent) => {
        e.preventDefault();
        isDraftSubmitRef.current = true;
        post(products.store.url(), {
            forceFormData: true,
            preserveScroll: true,
            onFinish: () => {
                isDraftSubmitRef.current = false;
            },
        });
    };

    return (
        <>
            <Head title="Create Product" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Package className="size-6 text-primary" />
                        Create New Product
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Register product details and configure variants, attributes &amp; photos — works for both
                        standard and serialized inventory.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* ── CARD 1: MASTER PRODUCT INFORMATION ─────────────────────── */}
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* LEFT COLUMN (2/3) */}
                            <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm col-span-2 ">
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">
                                                Product Title <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g. Apple iPhone 15 Pro / Fortune Sunflower Oil"
                                                value={data.name}
                                                onChange={(e) => setData('name', e.target.value)}
                                                className={cn(errors.name && 'border-destructive')}
                                                autoFocus
                                            />
                                            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="short_description">Short Overview</Label>
                                            <Input
                                                id="short_description"
                                                type="text"
                                                placeholder="Quick highlights for the customer..."
                                                className="text-sm"
                                                value={data.short_description}
                                                onChange={(e) => setData('short_description', e.target.value)}
                                            />
                                            {errors.short_description && (
                                                <p className="text-xs text-destructive">{errors.short_description}</p>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Full Description</Label>
                                            <DescriptionEditor
                                                value={data.description}
                                                onChange={(html) => setData('description', html)}
                                                error={errors.description}
                                                heightClass="h-73"
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* RIGHT COLUMN (1/3) */}
                            <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                                <CardContent>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="hsn_code">HSN Code</Label>
                                            <Input
                                                id="hsn_code"
                                                placeholder="e.g. 85171200"
                                                value={data.hsn_code}
                                                onChange={(e) => setData('hsn_code', e.target.value)}
                                                className="font-mono"
                                            />
                                            {errors.hsn_code && <p className="text-xs text-destructive">{errors.hsn_code}</p>}
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="category_id">
                                                    Category <span className="text-destructive">*</span>
                                                </Label>
                                                {/* WRAPPED SELECT TO FIX ALIGNMENT */}
                                                <div>
                                                    <Select value={data.category_id} onValueChange={(val) => setData('category_id', val)}>
                                                        <SelectTrigger id="category_id" className={cn('w-full', errors.category_id && 'border-destructive')}>
                                                            <SelectValue placeholder="Select Category" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {categories.map((c) => (
                                                                <SelectItem key={c.id} value={String(c.id)}>
                                                                    {c.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                                {errors.category_id && <p className="text-xs text-destructive">{errors.category_id}</p>}
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="brand_id">Brand</Label>
                                                {/* WRAPPED SELECT TO FIX ALIGNMENT */}
                                                <div>
                                                    <Select value={data.brand_id} onValueChange={(val) => setData('brand_id', val)}>
                                                        <SelectTrigger id="brand_id" className="w-full">
                                                            <SelectValue placeholder="Select Brand" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {brands.map((b) => (
                                                                <SelectItem key={b.id} value={String(b.id)}>
                                                                    {b.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor="tax_category_id">Tax Category</Label>
                                                {/* WRAPPED SELECT TO FIX ALIGNMENT */}
                                                <div>
                                                    <Select value={data.tax_category_id} onValueChange={(val) => setData('tax_category_id', val)}>
                                                        <SelectTrigger id="tax_category_id" className="w-full">
                                                            <SelectValue placeholder="Select Tax Rate" />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {taxCategories.map((t) => (
                                                                <SelectItem key={t.id} value={String(t.id)}>
                                                                    {t.name} {t.tax_percent != null ? `(${t.tax_percent}%)` : ''}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor="warranty_months">Warranty (Months)</Label>
                                                <Input
                                                    id="warranty_months"
                                                    type="number"
                                                    min={0}
                                                    value={data.warranty_months}
                                                    onChange={(e) => setData('warranty_months', Number(e.target.value))}
                                                />
                                            </div>
                                        </div>

                                        {/* Status & Merchandising Flags — Serialized lives here too, it's just another flag */}
                                        <div className="pt-2 border-t border-border/50">
                                            <p className="text-xs font-semibold text-muted-foreground mb-3 mt-2">
                                                Status &amp; Merchandising Flags
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 gap-4">
                                                <FlagToggle
                                                    label="Live"
                                                    checked={data.is_active}
                                                    onCheckedChange={(c) => setData('is_active', c)}
                                                />
                                                <FlagToggle
                                                    label="Returnable"
                                                    checked={data.is_returnable}
                                                    onCheckedChange={(c) => setData('is_returnable', c)}
                                                />
                                                <FlagToggle
                                                    label="Featured"
                                                    checked={data.is_featured}
                                                    onCheckedChange={(c) => setData('is_featured', c)}
                                                />
                                                <FlagToggle
                                                    label="Trending"
                                                    checked={data.is_trending}
                                                    onCheckedChange={(c) => setData('is_trending', c)}
                                                />
                                                <FlagToggle
                                                    label="Best Seller"
                                                    checked={data.is_best_seller}
                                                    onCheckedChange={(c) => setData('is_best_seller', c)}
                                                />
                                                <FlagToggle
                                                    icon={<Fingerprint className="size-3.5" />}
                                                    label="Serialized"
                                                    checked={data.is_serialized}
                                                    onCheckedChange={(c) => setData('is_serialized', c)}
                                                    highlighted
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-2">
                                                When Serialized is on, every unit of every variant is tracked by its own Serial No.
                                                / IMEI (added later from Stock-In) — and Attributes below auto-suggest RAM &amp;
                                                Storage.
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="space-y-4 pt-4">
                        <div className="border-b border-border/50 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="">
                                <div className="text-lg flex items-center gap-2">
                                    <Boxes className="size-5 text-primary" />
                                    Variants, Attributes &amp; Pricing
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    Every physical product is a variant — this is also where variant photos live.
                                </div>
                            </div>
                            <div className="flex items-center gap-2 bg-muted/40 px-3 py-1.5 rounded-lg border border-border/80 shrink-0">
                                <Label htmlFor="has_variants_switch" className="text-xs font-semibold cursor-pointer">
                                    Multiple Variants
                                </Label>
                                <Switch
                                    id="has_variants_switch"
                                    checked={hasVariants}
                                    onCheckedChange={(checked) => {
                                        setHasVariants(checked);
                                        if (!checked && data.variants.length > 1) {
                                            setData('variants', [data.variants[0]]);
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {(hasVariants ? data.variants : data.variants.slice(0, 1)).map((variant, vIdx) => {
                                const isDuplicate = duplicateVariantIndexes.has(vIdx);
                                return (
                                <div
                                    key={vIdx}
                                    className={cn(
                                        'border rounded-xl p-6 bg-card space-y-4 relative shadow-sm',
                                        isDuplicate && 'border-destructive/60',
                                    )}
                                >
                                    <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-2">
                                            <div className="font-mono text-sm text-muted-foreground">
                                                Variant - #{vIdx + 1}
                                            </div>
                                            {data.is_serialized && (
                                                <Fingerprint className="size-5 text-primary" />
                                            )}
                                        </div>

                                        {hasVariants && data.variants.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeVariant(vIdx)}
                                                className="text-destructive hover:bg-destructive/10 h-8 text-xs gap-1"
                                            >
                                                <Trash2 className="size-3.5" /> Remove Variant
                                            </Button>
                                        )}
                                    </div>

                                    {isDuplicate && (
                                        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                                            <AlertTriangle className="size-3.5 shrink-0" />
                                            This attribute combination is already used by another variant — change at
                                            least one value so each variant is unique.
                                        </div>
                                    )}

                                    {/* Identity Row */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="grid grid-cols-2 gap-y-2 gap-x-4 sm:grid-cols-4 col-span-2">
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Net Quantity</Label>
                                                <Input
                                                    type="number"
                                                    step="any"
                                                    placeholder="1"
                                                    value={variant.net_quantity}
                                                    onChange={(e) => updateVariantField(vIdx, 'net_quantity', e.target.value)}
                                                    className="h-9 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Unit</Label>
                                                <Select
                                                    value={variant.unit_id}
                                                    onValueChange={(val) => updateVariantField(vIdx, 'unit_id', val)}
                                                >
                                                    <SelectTrigger className="h-9 w-full text-xs">
                                                        <SelectValue placeholder="Select unit" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {units.map((u) => (
                                                            <SelectItem key={u.id} value={String(u.id)}>
                                                                {u.name} ({u.short_code})
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1 col-span-2 sm:col-span-1">
                                                <Label className="text-xs font-semibold">
                                                    Variant Title <span className="text-destructive">*</span>
                                                </Label>
                                                <Input
                                                    placeholder="e.g. 100G or 128GB / Titanium"
                                                    value={variant.variant_name}
                                                    onChange={(e) => updateVariantField(vIdx, 'variant_name', e.target.value)}
                                                    className="h-9 text-xs"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs font-semibold">
                                                        SKU <span className="text-destructive">*</span>
                                                    </Label>
                                                    <button
                                                        type="button"
                                                        onClick={() => suggestSku(vIdx)}
                                                        className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                                                    >
                                                        <RefreshCw className="size-2.5" /> Suggest
                                                    </button>
                                                </div>
                                                <Input
                                                    placeholder="FORT-100G-A1B2"
                                                    value={variant.sku}
                                                    onChange={(e) => updateVariantField(vIdx, 'sku', e.target.value.toUpperCase())}
                                                    className="h-9 text-xs font-mono uppercase"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Barcode</Label>
                                                <div className="relative">
                                                    <BarcodeIcon className="absolute left-2 top-2.5 size-3.5 text-muted-foreground" />
                                                    <Input
                                                        placeholder="890123456789"
                                                        value={variant.barcode}
                                                        onChange={(e) => updateVariantField(vIdx, 'barcode', e.target.value)}
                                                        className="h-9 pl-7 text-xs font-mono"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Status</Label>
                                                <Select
                                                    value={variant.is_active ? 'active' : 'inactive'}
                                                    onValueChange={(val) => updateVariantField(vIdx, 'is_active', val === 'active')}
                                                >
                                                    <SelectTrigger className="h-9 w-full text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="active">Active</SelectItem>
                                                        <SelectItem value="inactive">Inactive</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">
                                                    Selling Price (₹) <span className="text-destructive">*</span>
                                                </Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={variant.selling_price}
                                                    onChange={(e) => updateVariantField(vIdx, 'selling_price', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">MRP (₹)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={variant.mrp}
                                                    onChange={(e) => updateVariantField(vIdx, 'mrp', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Compare Price (₹)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={variant.compare_price}
                                                    onChange={(e) => updateVariantField(vIdx, 'compare_price', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">
                                                    Cost Price (₹) <span className="text-muted-foreground font-normal">internal</span>
                                                </Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={variant.cost_price}
                                                    onChange={(e) => updateVariantField(vIdx, 'cost_price', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Min Selling Price (₹)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    value={variant.min_selling_price}
                                                    onChange={(e) => updateVariantField(vIdx, 'min_selling_price', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs font-semibold">Weight (kg)</Label>
                                                <Input
                                                    type="number"
                                                    step="0.001"
                                                    value={variant.weight}
                                                    onChange={(e) => updateVariantField(vIdx, 'weight', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            </div>

                                            {/* <div className="space-y-1 col-span-2 sm:col-span-1">
                                                <Label className="text-xs font-semibold">Stock Alert Qty</Label> */}
                                                <Input
                                                    type="hidden"
                                                    value={variant.stock_alert_qty}
                                                    onChange={(e) => updateVariantField(vIdx, 'stock_alert_qty', e.target.value)}
                                                    className="h-9 text-xs font-mono"
                                                />
                                            {/* </div> */}
                                        </div>
                                        <div className="space-y-4 border-t border-border/50 pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-4">
                                            {colorAttribute && (
                                                <div className="space-y-1">
                                                    <Label className="text-xs font-semibold text-muted-foreground">
                                                        Color
                                                    </Label>
                                                    <AttributeValueCombobox
                                                        attributeUuid={colorAttribute.uuid}
                                                        values={colorAttribute.values}
                                                        value={variant.color_attribute_value_id}
                                                        onSelect={(val) =>
                                                            updateVariantField(vIdx, 'color_attribute_value_id', val)
                                                        }
                                                        onValueCreated={handleColorValueCreated}
                                                        placeholder="Select or add a color"
                                                    />
                                                </div>
                                            )}

                                            {/* Attributes — universal, RAM/Storage pre-filled when Serialized is on */}
                                            <VariantAttributePicker
                                                attributes={genericAttributes}
                                                rows={variant.attributes}
                                                onChange={(rows) => updateVariantField(vIdx, 'attributes', rows)}
                                            />
                                        </div>
                                    </div>

                                    {/* Variant Photos — images belong to variants only */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-semibold">
                                            Variant Photos <span className="text-muted-foreground font-normal">(1st image = primary)</span>
                                        </Label>
                                        <MultipleImageUploader
                                            maxFiles={MAX_VARIANT_IMAGES}
                                            maxSizeMB={2}
                                            inOrder={true}
                                            cols={10}
                                            value={variant.images}
                                            onChange={(fileList) => {
                                                const rawFiles = fileList.map((item: any) =>
                                                    item instanceof File ? item : item?.file
                                                ).filter((f): f is File => f instanceof File);

                                                updateVariantField(vIdx, 'images', rawFiles);
                                            }}
                                        />
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    </div>

                    {hasVariants && (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addVariant}
                            className="w-full h-9 text-xs border-dashed gap-1.5 shadow-xs"
                        >
                            <Plus className="size-3.5" /> Add Another Variant Option
                        </Button>
                    )}

                    {/* Submit Bar */}
                    <div className="flex flex-col items-end gap-2 pt-2 pb-6">
                        {hasDuplicateVariants && (
                            <p className="flex items-center gap-1.5 text-xs text-destructive">
                                <AlertTriangle className="size-3.5" /> Fix the duplicate variant(s) above before saving.
                            </p>
                        )}
                        <div className="flex flex-wrap items-center justify-end gap-3">
                            <Button type="button" variant="outline" onClick={() => window.history.back()} disabled={processing}>
                                Cancel
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleSaveDraft}
                                disabled={processing || !data.name || !data.category_id || hasDuplicateVariants}
                            >
                                {processing ? 'Saving...' : 'Save as Draft'}
                            </Button>
                            <Button
                                type="submit"
                                size="lg"
                                disabled={processing || !data.name || !data.category_id || hasDuplicateVariants}
                            >
                                {processing ? 'Saving Product...' : 'Publish Product to Catalog'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Products', href: products.index.url() },
        { title: 'Create', href: products.create.url() },
    ],
};

// ─── Small local component ──────────────────────────────────────────────────

function FlagToggle({
    icon,
    label,
    checked,
    onCheckedChange,
    highlighted = false,
}: {
    icon?: React.ReactNode;
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    highlighted?: boolean;
}) {
    return (
        <div
            className={cn(
                'flex items-center justify-between rounded-lg border px-3 py-2 bg-muted/20',
                highlighted && checked && 'border-primary/50 bg-primary/5',
            )}
        >
            <Label className="text-xs font-medium cursor-pointer flex items-center gap-1.5">
                {icon}
                {label}
            </Label>
            <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
    );
}

import React, { useEffect, useRef, useState } from 'react';
import { Head, router, useForm } from '@inertiajs/react';
import {
    Package,
    Plus,
    Trash2,
    Barcode as BarcodeIcon,
    Fingerprint,
    Boxes,
    RefreshCw,
    AlertTriangle,
    Archive,
    RotateCcw,
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
import type { FileMetadata } from '@/hooks/use-file-upload';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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

interface ExistingAttributeValue {
    id: number;
    attribute_id: number;
    value: string;
    attribute?: { id: number; name: string };
}

interface ExistingImage {
    id: number;
    url: string | null;
    is_primary: boolean;
    sort_order: number;
}

interface ExistingVariant {
    id: number;
    variant_name: string;
    sku: string;
    barcode: string | null;
    unit_id: number | null;
    net_quantity: string;
    mrp: string | null;
    selling_price: string;
    cost_price: string | null;
    min_selling_price: string | null;
    compare_price: string | null;
    weight: string | null;
    stock_alert_qty: number | null;
    is_active: boolean;
    deleted_at: string | null;
    attribute_values: ExistingAttributeValue[];
    images: ExistingImage[];
}

interface ExistingProduct {
    id: number;
    uuid: string;
    name: string;
    description: string | null;
    short_description: string | null;
    category_id: number;
    brand_id: number | null;
    tax_category_id: number | null;
    hsn_code: string | null;
    warranty_months: number;
    is_active: boolean;
    is_returnable: boolean;
    is_serialized: boolean;
    is_featured: boolean;
    is_trending: boolean;
    is_best_seller: boolean;
    variants: ExistingVariant[];
}

interface EditProps {
    product: ExistingProduct;
    categories: OptionItem[];
    brands: OptionItem[];
    taxCategories: OptionItem[];
    units: UnitOption[];
    attributes: AttributeItem[];
}

interface VariantFormState {
    /** undefined = a brand-new variant added during this edit session */
    id?: number;
    /** non-null = this variant is currently trashed; rendered read-only with a Restore action */
    deleted_at: string | null;
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
    color_attribute_value_id: string;
    /** Unified list driving MultipleImageUploader — existing (FileMetadata) + new (File) mixed */
    images: Array<File | FileMetadata>;
    /** Bookkeeping only, stripped before submit — the image ids this variant started with */
    _originalImageIds: number[];
}

const MAX_VARIANT_IMAGES = 6;

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

function toFileMetadata(image: ExistingImage): FileMetadata {
    return {
        id: `existing-${image.id}`,
        name: `image-${image.id}.jpg`,
        size: 0,
        type: 'image/jpeg',
        url: image.url ?? '',
    } as FileMetadata;
}

function mapExistingVariant(v: ExistingVariant, defaultUnitId: string): VariantFormState {
    const colorValue = v.attribute_values.find((av) => /colou?r/i.test(av.attribute?.name ?? ''));
    const otherRows: VariantAttributeRow[] = v.attribute_values
        .filter((av) => av.id !== colorValue?.id)
        .map((av) => ({ id: uid(), attribute_id: String(av.attribute_id), attribute_value_id: String(av.id) }));

    const sortedImages = [...v.images].sort((a, b) => a.sort_order - b.sort_order);

    return {
        id: v.id,
        deleted_at: v.deleted_at,
        variant_name: v.variant_name,
        sku: v.sku,
        barcode: v.barcode ?? '',
        unit_id: v.unit_id ? String(v.unit_id) : defaultUnitId,
        net_quantity: v.net_quantity ?? '1',
        mrp: v.mrp ?? '',
        selling_price: v.selling_price ?? '',
        cost_price: v.cost_price ?? '',
        min_selling_price: v.min_selling_price ?? '',
        compare_price: v.compare_price ?? '',
        weight: v.weight ?? '',
        stock_alert_qty: v.stock_alert_qty != null ? String(v.stock_alert_qty) : '',
        is_active: v.is_active,
        attributes: otherRows,
        color_attribute_value_id: colorValue ? String(colorValue.id) : '',
        images: sortedImages.map(toFileMetadata),
        _originalImageIds: sortedImages.map((img) => img.id),
    };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function Edit({ product, categories, brands, taxCategories, units, attributes }: EditProps) {
    const defaultUnitId = units[0]?.id ? String(units[0].id) : '';

    // Mutable copy of the `attributes` prop — grows in place when the user creates a
    // brand-new value (e.g. a new Color) via the combobox, with no page reload/visit.
    const [attributeCatalog, setAttributeCatalog] = useState<AttributeItem[]>(attributes);
    const colorAttribute = attributeCatalog.find((a) => /colou?r/i.test(a.name));

    const handleColorValueCreated = (newValue: AttributeValueItem) => {
        if (!colorAttribute) return;
        setAttributeCatalog((prev) =>
            prev.map((a) => (a.id === colorAttribute.id ? { ...a, values: [...a.values, newValue] } : a)),
        );
    };

    // Exclude Color/Colour from the list passed to VariantAttributePicker
    const genericAttributes = attributes.filter(
        (attr) => !/colou?r/i.test(attr.name)
    );

    const buildBlankVariant = (prefillSerializedAttrs: boolean): VariantFormState => {
        const rows: VariantAttributeRow[] = [];
        if (prefillSerializedAttrs) {
            const ram = findAttributeByKeyword(genericAttributes, 'ram');
            const storage = findAttributeByKeyword(genericAttributes, 'storage');
            if (ram) rows.push({ id: uid(), attribute_id: String(ram.id), attribute_value_id: '' });
            if (storage) rows.push({ id: uid(), attribute_id: String(storage.id), attribute_value_id: '' });
        }
        return {
            id: undefined,
            deleted_at: null,
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
            _originalImageIds: [],
        };
    };

    const { data, setData, put, processing, errors, transform } = useForm({
        name: product.name,
        short_description: product.short_description ?? '',
        description: product.description ?? '',
        category_id: String(product.category_id),
        brand_id: product.brand_id ? String(product.brand_id) : '',
        tax_category_id: product.tax_category_id ? String(product.tax_category_id) : '',
        hsn_code: product.hsn_code ?? '',
        warranty_months: product.warranty_months ?? 12,
        is_active: product.is_active,
        is_returnable: product.is_returnable,
        is_serialized: product.is_serialized,
        is_featured: product.is_featured,
        is_trending: product.is_trending,
        is_best_seller: product.is_best_seller,
        variants: product.variants.map((v) => mapExistingVariant(v, defaultUnitId)) as VariantFormState[],
    });

    // "Multiple Variants" toggle — same slot/behavior as Create, but safe for existing
    // data: turning it off only ever drops brand-new (unsaved) extra rows, never a
    // persisted or trashed variant.
    const [hasVariants, setHasVariants] = useState(product.variants.length > 1);

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

    transform((formData) => {
        const isProductInactive = !formData.is_active;
        // When "Multiple Variants" toggle is OFF, only process the first active variant
        const activeVariants = formData.variants.filter((v) => !v.deleted_at);
        const variantsToSubmit = hasVariants ? activeVariants : activeVariants.slice(0, 1);

        return {
            ...formData,
            is_active: formData.is_active,
            variants: variantsToSubmit.map((v) => {
                const {
                    color_attribute_value_id,
                    attributes: attrRows,
                    images,
                    _originalImageIds,
                    deleted_at,
                    ...rest
                } = v;

                const attributeValueIds = attrRows
                    .filter((r) => r.attribute_value_id)
                    .map((r) => r.attribute_value_id);

                if (color_attribute_value_id) {
                    attributeValueIds.push(color_attribute_value_id);
                }

                const existingKept = images.filter((f): f is FileMetadata => !(f instanceof File));
                const newFiles = images.filter((f): f is File => f instanceof File);
                const existingImageOrder = existingKept.map((f) =>
                    Number(String(f.id).replace('existing-', ''))
                );
                const removedImageIds = _originalImageIds.filter((id) => !existingImageOrder.includes(id));
                const primaryIsNew = images.length > 0 && images[0] instanceof File;

                return {
                    ...rest,
                    is_active: isProductInactive ? false : v.is_active,
                    mrp: v.mrp === '' ? null : v.mrp,
                    selling_price: v.selling_price,
                    cost_price: v.cost_price === '' ? null : v.cost_price,
                    min_selling_price: v.min_selling_price === '' ? null : v.min_selling_price,
                    compare_price: v.compare_price === '' ? null : v.compare_price,
                    weight: v.weight === '' ? null : v.weight,
                    stock_alert_qty: v.stock_alert_qty === '' ? null : v.stock_alert_qty,
                    net_quantity: v.net_quantity === '' ? '1.0000' : v.net_quantity,
                    attributes: attributeValueIds.map((id) => ({ attribute_value_id: id })),
                    images: newFiles,
                    removed_image_ids: removedImageIds,
                    existing_image_order: existingImageOrder,
                    primary_is_new: primaryIsNew,
                };
            }),
        };
    });

    const addVariant = () => {
        setData('variants', [...data.variants, buildBlankVariant(data.is_serialized)]);
    };

    // Only ever removes a brand-new (unsaved) row — persisted variants can't be
    // removed this way, only trashed via handleTrashVariant below.
    const removeNewVariant = (index: number) => {
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

    // Immediate, independent actions — same endpoints your Index page already uses.
    // These are full round-trips (the page reloads with fresh data), so warn plainly
    // rather than silently discarding any other unsaved edits on the page.
    const handleTrashVariant = (variantId: number) => {
        const confirmed = window.confirm(
            'Move this variant to trash? This saves immediately — any other unsaved changes on this page will be lost. You can restore it afterwards from this same page.',
        );
        if (!confirmed) return;
        router.delete(products.destroy.url(product.uuid), {
            data: { variant_ids: [variantId] },
            preserveScroll: true,
        });
    };

    const handleRestoreVariant = (variantId: number) => {
        const confirmed = window.confirm(
            'Restore this variant? This saves immediately — any other unsaved changes on this page will be lost.',
        );
        if (!confirmed) return;
        router.post(products.restore.url(product.uuid), { variant_ids: [variantId] }, { preserveScroll: true });
    };

    // Two variants with the exact same attribute combination (e.g. Red / 128GB twice)
    // are effectively the same variant — flag them so the seller can fix it before saving.
    const getVariantSignature = (variant: VariantFormState): string | null => {
        const values = variant.attributes.filter((r) => r.attribute_value_id).map((r) => r.attribute_value_id);
        if (variant.color_attribute_value_id) values.push(variant.color_attribute_value_id);
        const sorted = values.sort();
        return sorted.length > 0 ? sorted.join('|') : null;
    };

    const activeIdx = data.variants.map((v, i) => (v.deleted_at ? -1 : i)).filter((i) => i !== -1);
    const activeSignatures = activeIdx.map((i) => getVariantSignature(data.variants[i]));
    const duplicateVariantIndexes = new Set<number>(
        activeIdx.filter((idx) => {
            const sig = getVariantSignature(data.variants[idx]);
            return !!sig && activeSignatures.filter((s) => s === sig).length > 1;
        }),
    );
    const hasDuplicateVariants = duplicateVariantIndexes.size > 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        put(products.update.url(product.uuid), { forceFormData: true, preserveScroll: true });
    };

    return (
        <>
            <Head title={`Edit — ${product.name}`} />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Package className="size-6 text-primary" />
                        Edit Product
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Update product details and configure variants, attributes &amp; photos for{' '}
                        <strong>{product.name}</strong>.
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
                                        if (!checked) {
                                            // Never drop persisted or trashed variants — only cancel unsaved new rows.
                                            setData('variants', data.variants.filter((v, i) => v.id || v.deleted_at || i === 0));
                                        }
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            {(hasVariants ? data.variants : data.variants.slice(0, 1)).map((variant, vIdx) => {
                                const isDuplicate = duplicateVariantIndexes.has(vIdx);
                                const isTrashed = !!variant.deleted_at;
                                const isNew = !variant.id;
                                const thumbUrl = variant.images.find((f): f is FileMetadata => !(f instanceof File))?.url;

                                if (isTrashed) {
                                    return (
                                        <div
                                            key={vIdx}
                                            className="border rounded-xl p-6 bg-muted/30 opacity-80 flex items-center justify-between gap-4 flex-wrap"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {thumbUrl ? (
                                                    <img src={thumbUrl} alt="" className="size-12 rounded-md object-cover border" />
                                                ) : (
                                                    <div className="size-12 rounded-md border bg-muted flex items-center justify-center text-muted-foreground">
                                                        <Package className="size-5" />
                                                    </div>
                                                )}
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono text-xs text-muted-foreground">
                                                            Variant - #{vIdx + 1}
                                                        </span>
                                                        <Badge variant="secondary" className="text-[10px] gap-1">
                                                            <Archive className="size-3" /> Trashed
                                                        </Badge>
                                                    </div>
                                                    <p className="text-sm font-medium truncate">{variant.variant_name}</p>
                                                    <p className="text-xs text-muted-foreground font-mono truncate">
                                                        SKU: {variant.sku} · ₹{variant.selling_price}
                                                    </p>
                                                </div>
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => variant.id && handleRestoreVariant(variant.id)}
                                                className="text-emerald-600 border-emerald-600/30 hover:bg-emerald-600/10 gap-1.5 shrink-0"
                                            >
                                                <RotateCcw className="size-3.5" /> Restore
                                            </Button>
                                        </div>
                                    );
                                }

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
                                            {isNew && (
                                                <Badge variant="outline" className="text-[10px]">
                                                    New
                                                </Badge>
                                            )}
                                            {data.is_serialized && (
                                                <Fingerprint className="size-5 text-primary" />
                                            )}
                                        </div>

                                        {isNew ? (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => removeNewVariant(vIdx)}
                                                className="text-destructive hover:bg-destructive/10 h-8 text-xs gap-1"
                                            >
                                                <Trash2 className="size-3.5" /> Remove Variant
                                            </Button>
                                        ) : (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => variant.id && handleTrashVariant(variant.id)}
                                                className="text-destructive hover:bg-destructive/10 h-8 text-xs gap-1"
                                            >
                                                <Archive className="size-3.5" /> Move to Trash
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

                                            <Input
                                                type="hidden"
                                                value={variant.stock_alert_qty}
                                                onChange={(e) => updateVariantField(vIdx, 'stock_alert_qty', e.target.value)}
                                                className="h-9 text-xs font-mono"
                                            />
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
                                            onChange={(files) => updateVariantField(vIdx, 'images', files)}
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
                                type="submit"
                                size="lg"
                                disabled={processing || !data.name || !data.category_id || hasDuplicateVariants}
                            >
                                {processing ? 'Saving Product...' : 'Update Product'}
                            </Button>
                        </div>
                    </div>
                </form>
            </div>
        </>
    );
}

Edit.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Products', href: products.index.url() },
        { title: 'Edit', href: '' },
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

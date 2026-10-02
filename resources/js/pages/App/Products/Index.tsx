import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Package,
    Plus,
    Search,
    MoreVertical,
    Pencil,
    Trash2,
    RotateCcw,
    Archive,
    ImageIcon,
    Barcode as BarcodeIcon,
    Eye,
    ShieldAlert,
    Boxes,
    Fingerprint,
    X,
    CheckSquare,
    Square,
} from 'lucide-react';

import products from '@/routes/app/products';
import { dashboard } from '@/routes';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from '@/components/ui/pagination';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface AttributeValue {
    id: number;
    value: string;
    attribute?: { id: number; name: string };
}

interface VariantItem {
    id: number;
    product_id: number;
    variant_name: string;
    sku: string;
    barcode: string | null;
    mrp: string;
    selling_price: string;
    is_active: boolean;
    deleted_at: string | null;
    primary_photo_url: string | null;
    attribute_values: AttributeValue[];
}

interface MasterProduct {
    id: number;
    uuid: string;
    name: string;
    is_serialized: boolean;
    is_active: boolean;
    deleted_at: string | null;
    category?: { id: number; name: string };
    brand?: { id: number; name: string };
    variants: VariantItem[];
}

interface IndexProps {
    products: {
        data: MasterProduct[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
        per_page: number;
        from: number | null;
        to: number | null;
    };
    stats: {
        total_products: number;
        total_variants: number;
        serialized: number;
        trashed: number;
    };
    filters: {
        search?: string;
        category_id?: string;
        brand_id?: string;
        is_serialized?: string;
        is_active?: string;
        trashed?: string;
    };
    categories: Array<{ id: number; name: string }>;
    brands: Array<{ id: number; name: string }>;
}

export default function Index({
    products: productList,
    stats,
    filters,
    categories = [],
    brands = [],
}: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canCreate = permissions.includes('products.create');
    const canUpdate = permissions.includes('products.update');
    const canDelete = permissions.includes('products.delete');
    const canPurge = permissions.includes('products.purge');

    const [hoveredProductId, setHoveredProductId] = useState<number | null>(null);

    const [modalTarget, setModalTarget] = useState<{
        product: MasterProduct;
        action: 'delete' | 'purge' | 'restore';
    } | null>(null);
    const [selectedVariantIds, setSelectedVariantIds] = useState<number[]>([]);

    const isTrashedMode = filters.trashed === 'only';

    const hasActiveFilters = Boolean(
        filters.search ||
        filters.category_id ||
        filters.brand_id ||
        filters.is_serialized ||
        filters.is_active ||
        filters.trashed
    );

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                products.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            products.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const handleResetFilters = () => {
        router.get(products.index.url(), {}, { preserveState: true, replace: true });
    };

    const goToPage = (page: number) => {
        if (page < 1 || page > productList.last_page || page === productList.current_page) return;
        router.get(
            products.index.url(),
            { ...filters, page: page === 1 ? undefined : page },
            { preserveState: true, replace: true }
        );
    };

    // Compact page-number list with ellipses: 1 … c-1 c c+1 … last
    const pageItems = (): Array<number | 'ellipsis'> => {
        const current = productList.current_page;
        const last = productList.last_page;
        if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
        const pages = new Set<number>([1, 2, last - 1, last, current - 1, current, current + 1]);
        const sorted = [...pages].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
        const items: Array<number | 'ellipsis'> = [];
        sorted.forEach((p, i) => {
            if (i > 0 && p - sorted[i - 1] > 1) items.push('ellipsis');
            items.push(p);
        });
        return items;
    };

    const openActionModal = (product: MasterProduct, action: 'delete' | 'purge' | 'restore') => {
        setModalTarget({ product, action });
        setSelectedVariantIds(product.variants.map((v) => v.id));
    };

    const toggleVariantSelection = (id: number) => {
        setSelectedVariantIds((prev) =>
            prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (!modalTarget) return;
        if (selectedVariantIds.length === modalTarget.product.variants.length) {
            setSelectedVariantIds([]);
        } else {
            setSelectedVariantIds(modalTarget.product.variants.map((v) => v.id));
        }
    };

    const executeVariantAction = () => {
        if (!modalTarget || selectedVariantIds.length === 0) return;

        const { product, action } = modalTarget;

        if (action === 'delete') {
            router.delete(products.destroy.url(product.uuid), {
                data: { variant_ids: selectedVariantIds },
                onFinish: () => setModalTarget(null),
                preserveState: true,
            });
        } else if (action === 'purge') {
            router.delete(products.purge.url(product.uuid), {
                data: { variant_ids: selectedVariantIds },
                onFinish: () => setModalTarget(null),
                preserveState: true,
            });
        } else if (action === 'restore') {
            router.post(
                products.restore.url(product.uuid),
                { variant_ids: selectedVariantIds },
                {
                    onFinish: () => setModalTarget(null),
                    preserveState: true,
                }
            );
        }
    };

    return (
        <>
            <Head title="Product Catalog" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Package className="size-6 text-primary" />
                            Product Catalog
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage catalog inventory, variants, prices, categories, and brands.
                        </p>
                    </div>

                    {canCreate && (
                        <Link href={products.create.url()}>
                            <Button size="sm" className="w-full sm:w-auto">
                                <Plus className="mr-2 size-4" />
                                Add Product
                            </Button>
                        </Link>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Products" value={stats.total_products} icon={Package} />
                    <StatCard title="Total Variants" value={stats.total_variants} icon={Boxes} />
                    <StatCard title="Serialized Items" value={stats.serialized} icon={Fingerprint} />
                    <StatCard title="Trashed Variants" value={stats.trashed} icon={Archive} />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search product, SKU, barcode..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Select
                            value={filters.category_id || 'all'}
                            onValueChange={(val) => handleFilterChange('category_id', val === 'all' ? null : val)}
                        >
                            <SelectTrigger className="w-[140px] h-9 text-xs">
                                <SelectValue placeholder="Category" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Categories</SelectItem>
                                {categories.map((c) => (
                                    <SelectItem key={c.id} value={String(c.id)}>
                                        {c.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.brand_id || 'all'}
                            onValueChange={(val) => handleFilterChange('brand_id', val === 'all' ? null : val)}
                        >
                            <SelectTrigger className="w-[130px] h-9 text-xs">
                                <SelectValue placeholder="Brand" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Brands</SelectItem>
                                {brands.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.is_serialized ?? 'all'}
                            onValueChange={(val) => handleFilterChange('is_serialized', val === 'all' ? null : val)}
                        >
                            <SelectTrigger className="w-[130px] h-9 text-xs">
                                <SelectValue placeholder="Tracking" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Tracking</SelectItem>
                                <SelectItem value="1">Serialized</SelectItem>
                                <SelectItem value="0">Standard</SelectItem>
                            </SelectContent>
                        </Select>

                        <Select
                            value={filters.is_active ?? 'all'}
                            onValueChange={(val) => handleFilterChange('is_active', val === 'all' ? null : val)}
                        >
                            <SelectTrigger className="w-[120px] h-9 text-xs">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="1">Active</SelectItem>
                                <SelectItem value="0">Inactive</SelectItem>
                            </SelectContent>
                        </Select>

                        {hasActiveFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleResetFilters}
                                className="h-9 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            >
                                <X className="size-3.5" /> Reset
                            </Button>
                        )}

                        <Button
                            variant={isTrashedMode ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('trashed', isTrashedMode ? null : 'only')}
                            className="h-9 text-xs flex items-center gap-1.5"
                        >
                            <Archive className="size-3.5" />
                            Trashed ({stats.trashed})
                        </Button>
                    </div>
                </div>

                {/* Data Table */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-12"></TableHead>
                                    <TableHead>Product Variant</TableHead>
                                    <TableHead>SKU & Barcode</TableHead>
                                    <TableHead>Variant Details</TableHead>
                                    <TableHead className="text-right">Selling Price</TableHead>
                                    <TableHead className="text-right">MRP</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-16 text-right border-l border-border/60">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {productList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-32 text-center text-xs text-muted-foreground">
                                            {isTrashedMode
                                                ? 'No trashed variants found.'
                                                : 'No products found matching your criteria.'}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    productList.data.flatMap((product) =>
                                        product.variants.map((variant, vIdx) => {
                                            const isFirstInGroup = vIdx === 0;
                                            const groupCount = product.variants.length;
                                            const isHovered = hoveredProductId === product.id;

                                            return (
                                                <TableRow
                                                    key={variant.id}
                                                    onMouseEnter={() => setHoveredProductId(product.id)}
                                                    onMouseLeave={() => setHoveredProductId(null)}
                                                    className={isHovered ? 'bg-muted/50 transition-colors' : 'transition-colors'}
                                                >
                                                    <TableCell className="align-middle">
                                                        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 overflow-hidden shrink-0">
                                                            {variant.primary_photo_url ? (
                                                                <img
                                                                    src={variant.primary_photo_url}
                                                                    alt={variant.variant_name}
                                                                    className="size-full object-cover"
                                                                />
                                                            ) : (
                                                                <ImageIcon className="size-4 text-muted-foreground/40" />
                                                            )}
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-middle">
                                                        <div className="space-y-0.5">
                                                            <div className="font-semibold text-xs text-foreground flex items-center gap-1">
                                                                <span className="truncate max-w-80 block">
                                                                    {product.name}
                                                                </span>
                                                                {variant.variant_name && (
                                                                    <span className="font-semibold text-primary ml-1">
                                                                        ({variant.variant_name})
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-muted-foreground">
                                                                <span>{product.category?.name || 'Uncategorized'}</span>
                                                                {product.brand && (
                                                                    <span className="text-muted-foreground/60"> / {product.brand.name}</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-middle">
                                                        <div className="space-y-0.5 font-mono text-xs">
                                                            <p className="font-semibold text-foreground">{variant.sku}</p>
                                                            {variant.barcode && (
                                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                    <BarcodeIcon className="size-2.5" /> {variant.barcode}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </TableCell>

                                                    <TableCell className="align-middle">
                                                        {variant.attribute_values.length > 0 ? (
                                                            <div className="text-xs text-muted-foreground space-y-0.5">
                                                                {variant.attribute_values.map((av) => (
                                                                    <span key={av.id} className="inline-block mr-2 text-[11px]">
                                                                        <span className="font-medium text-foreground">{av.attribute?.name || 'Attr'}:</span> {av.value}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground italic">Standard Variant</span>
                                                        )}
                                                    </TableCell>

                                                    <TableCell className="text-right font-mono text-xs font-semibold align-middle">
                                                        ₹<FormatAmount amount={Number(variant.selling_price)} />
                                                    </TableCell>

                                                    <TableCell className="text-right font-mono text-xs text-muted-foreground align-middle">
                                                        ₹<FormatAmount amount={Number(variant.mrp)} />
                                                    </TableCell>

                                                    <TableCell className="align-middle">
                                                        {variant.deleted_at ? (
                                                            <Badge variant="destructive" className="text-[10px]">
                                                                Trashed
                                                            </Badge>
                                                        ) : (
                                                            <Badge
                                                                variant="outline"
                                                                className={
                                                                    variant.is_active
                                                                        ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10'
                                                                        : 'text-muted-foreground'
                                                                }
                                                            >
                                                                {variant.is_active ? 'Active' : 'Inactive'}
                                                            </Badge>
                                                        )}
                                                    </TableCell>

                                                    {isFirstInGroup && (
                                                        <TableCell
                                                            rowSpan={groupCount}
                                                            className="text-right align-middle border-l border-border/60"
                                                        >
                                                            <DropdownMenu>
                                                                <DropdownMenuTrigger asChild>
                                                                    <Button variant="ghost" size="icon" className="size-8">
                                                                        <MoreVertical className="size-4" />
                                                                    </Button>
                                                                </DropdownMenuTrigger>
                                                                <DropdownMenuContent align="end" className="w-44">
                                                                    {!isTrashedMode && (
                                                                        <>
                                                                            <Link href={products.show.url(product.uuid)}>
                                                                                <DropdownMenuItem className="cursor-pointer">
                                                                                    <Eye className="mr-2 size-4 text-muted-foreground" /> View Product
                                                                                </DropdownMenuItem>
                                                                            </Link>

                                                                            {canUpdate && (
                                                                                <Link href={products.edit.url(product.uuid)}>
                                                                                    <DropdownMenuItem className="cursor-pointer">
                                                                                        <Pencil className="mr-2 size-4 text-muted-foreground" /> Edit Product
                                                                                    </DropdownMenuItem>
                                                                                </Link>
                                                                            )}
                                                                        </>
                                                                    )}

                                                                    {isTrashedMode ? (
                                                                        <>
                                                                            <DropdownMenuItem
                                                                                onClick={() => openActionModal(product, 'restore')}
                                                                                className="text-emerald-600 cursor-pointer"
                                                                            >
                                                                                <RotateCcw className="mr-2 size-4" /> Restore Variants
                                                                            </DropdownMenuItem>
                                                                            {canPurge && (
                                                                                <DropdownMenuItem
                                                                                    onClick={() => openActionModal(product, 'purge')}
                                                                                    className="text-destructive focus:text-destructive cursor-pointer"
                                                                                >
                                                                                    <ShieldAlert className="mr-2 size-4" /> Purge Variants
                                                                                </DropdownMenuItem>
                                                                            )}
                                                                        </>
                                                                    ) : (
                                                                        canDelete && (
                                                                            <>
                                                                                <DropdownMenuSeparator />
                                                                                <DropdownMenuItem
                                                                                    onClick={() => openActionModal(product, 'delete')}
                                                                                    className="text-destructive focus:text-destructive cursor-pointer"
                                                                                >
                                                                                    <Trash2 className="mr-2 size-4" /> Trash Variants
                                                                                </DropdownMenuItem>
                                                                            </>
                                                                        )
                                                                    )}
                                                                </DropdownMenuContent>
                                                            </DropdownMenu>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            );
                                        })
                                    )
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* Pagination footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 pt-1">
                    <p className="text-xs text-muted-foreground">
                        Showing{' '}
                        <span className="font-semibold text-foreground">
                            {productList.from ?? 0}–{productList.to ?? 0}
                        </span>{' '}
                        of <span className="font-semibold text-foreground">{productList.total}</span> products
                    </p>
                    {productList.last_page > 1 && (
                        <Pagination className="mx-0 w-auto">
                            <PaginationContent>
                                <PaginationItem>
                                    <PaginationPrevious
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            goToPage(productList.current_page - 1);
                                        }}
                                        className={
                                            productList.current_page === 1
                                                ? 'pointer-events-none opacity-50'
                                                : 'cursor-pointer'
                                        }
                                    />
                                </PaginationItem>
                                {pageItems().map((item, i) =>
                                    item === 'ellipsis' ? (
                                        <PaginationItem key={`ellipsis-${i}`}>
                                            <PaginationEllipsis />
                                        </PaginationItem>
                                    ) : (
                                        <PaginationItem key={item}>
                                            <PaginationLink
                                                href="#"
                                                isActive={item === productList.current_page}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    goToPage(item);
                                                }}
                                                className="cursor-pointer"
                                            >
                                                {item}
                                            </PaginationLink>
                                        </PaginationItem>
                                    )
                                )}
                                <PaginationItem>
                                    <PaginationNext
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            goToPage(productList.current_page + 1);
                                        }}
                                        className={
                                            productList.current_page === productList.last_page
                                                ? 'pointer-events-none opacity-50'
                                                : 'cursor-pointer'
                                        }
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    )}
                </div>
            </div>

            {/* Selective Variant Action Modal */}
            <Dialog open={!!modalTarget} onOpenChange={() => setModalTarget(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {modalTarget?.action === 'purge' ? (
                                <ShieldAlert className="size-5 text-destructive" />
                            ) : modalTarget?.action === 'restore' ? (
                                <RotateCcw className="size-5 text-emerald-600" />
                            ) : (
                                <Trash2 className="size-5 text-destructive" />
                            )}
                            {modalTarget?.action === 'purge'
                                ? 'Purge Variants'
                                : modalTarget?.action === 'restore'
                                ? 'Restore Variants'
                                : 'Trash Variants'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Select the specific variants of <strong>{modalTarget?.product.name}</strong> you wish to{' '}
                            {modalTarget?.action === 'purge'
                                ? 'permanently purge'
                                : modalTarget?.action === 'restore'
                                ? 'restore to active list'
                                : 'soft-delete'}
                            .
                        </DialogDescription>
                    </DialogHeader>

                    {modalTarget && (
                        <div className="space-y-3 py-2">
                            <div className="flex items-center justify-between pb-2 border-b border-border">
                                <span className="text-xs font-semibold text-muted-foreground">Variants List</span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={toggleSelectAll}
                                    className="h-7 text-xs px-2 text-primary hover:text-primary"
                                >
                                    {selectedVariantIds.length === modalTarget.product.variants.length ? (
                                        <span className="flex items-center gap-1"><CheckSquare className="size-3.5" /> Deselect All</span>
                                    ) : (
                                        <span className="flex items-center gap-1"><Square className="size-3.5" /> Select All ({modalTarget.product.variants.length})</span>
                                    )}
                                </Button>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                {modalTarget.product.variants.map((v) => {
                                    const isChecked = selectedVariantIds.includes(v.id);
                                    return (
                                        <div
                                            key={v.id}
                                            onClick={() => toggleVariantSelection(v.id)}
                                            className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                                                isChecked
                                                    ? 'border-primary/50 bg-primary/5'
                                                    : 'border-border bg-card hover:bg-muted/30'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2.5">
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={() => toggleVariantSelection(v.id)}
                                                />
                                                <div>
                                                    <p className="font-semibold text-foreground">
                                                        {v.variant_name || modalTarget.product.name}
                                                    </p>
                                                    <p className="font-mono text-[10px] text-muted-foreground">SKU: {v.sku}</p>
                                                </div>
                                            </div>

                                            <div className="text-right font-mono">
                                                ₹<FormatAmount amount={Number(v.selling_price)} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {selectedVariantIds.length === modalTarget.product.variants.length && (
                                <p className="text-[11px] text-destructive bg-destructive/10 p-2 rounded border border-destructive/20">
                                    ⚠️ Selecting all variants will affect the master product record.
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter className="gap-2">
                        <Button variant="outline" size="sm" onClick={() => setModalTarget(null)}>
                            Cancel
                        </Button>
                        <Button
                            variant={modalTarget?.action === 'restore' ? 'default' : 'destructive'}
                            size="sm"
                            disabled={selectedVariantIds.length === 0}
                            onClick={executeVariantAction}
                        >
                            Confirm ({selectedVariantIds.length})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Products', href: products.index.url() },
    ],
};

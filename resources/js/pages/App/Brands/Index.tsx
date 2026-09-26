import { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Tag,
    Plus,
    Search,
    CheckCircle2,
    XCircle,
    MoreVertical,
    Edit,
    Trash2,
    RotateCcw,
    Archive,
    Loader2,
    Image as ImageIcon
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StatCard } from '@/components/special/stat-card';
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
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import SingleImageUploader from '@/components/special/single-image-uploader';
import brands from '@/routes/app/brands';
import { dashboard } from '@/routes';
import { cn } from '@/lib/utils';

interface BrandItem {
    id: number;
    uuid: string;
    name: string;
    slug: string;
    logo_path: string | null;
    logo_url?: string | null;
    is_active: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
}

interface IndexProps {
    brands: {
        data: BrandItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        active: number;
        inactive: number;
        trashed: number;
    };
    filters: {
        search?: string;
        is_active?: string;
        trashed?: string;
    };
}

export default function Index({ brands: brandList, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canManage = permissions.includes('brands.manage');
    const canDelete = permissions.includes('brands.delete');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingBrand, setEditingBrand] = useState<BrandItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        name: '',
        slug: '',
        logo: null as File | string | null,
        is_active: true,
    });

    const slugify = (text: string): string => {
        return text
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    };

    const handleNameChange = (val: string) => {
        setData((prev) => ({
            ...prev,
            name: val,
            slug: !editingBrand ? slugify(val) : prev.slug,
        }));
    };

    const openCreateModal = () => {
        reset();
        clearErrors();
        setEditingBrand(null);
        setModalOpen(true);
    };

    const openEditModal = (brand: BrandItem) => {
        clearErrors();
        setEditingBrand(brand);
        setData({
            name: brand.name,
            slug: brand.slug,
            logo: brand.logo_url || null,
            is_active: brand.is_active,
        });
        setModalOpen(true);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingBrand) {
            router.post(brands.update.url({ brand: editingBrand.uuid }), {
                _method: 'put',
                ...data,
                logo: data.logo instanceof File ? data.logo : null,
            }, {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        } else {
            post(brands.store.url(), {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        }
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                brands.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            brands.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(brands.destroy.url({ brand: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(brands.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(brands.restore.url({ uuid }));
    };

    return (
        <>
            <Head title="Brand Management" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Tag className="size-6 text-primary" />
                            Brand Catalogue
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage product manufacturers, brand logos, and catalog visibility settings.
                        </p>
                    </div>

                    {canManage && (
                        <Button onClick={openCreateModal} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 size-4" />
                            Add New Brand
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Brands" value={stats.total} icon={Tag} />
                    <StatCard title="Active Brands" value={stats.active} icon={CheckCircle2} />
                    <StatCard title="Inactive Brands" value={stats.inactive} icon={XCircle} />
                    <StatCard title="Trashed Brands" value={stats.trashed} icon={Archive} />
                </div>

                {/* Filter & Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search brand name or slug..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.is_active && !filters.trashed ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                handleFilterChange('is_active', null);
                                handleFilterChange('trashed', null);
                            }}
                            className="h-8 text-xs"
                        >
                            All Brands
                        </Button>
                        <Button
                            variant={filters.is_active === '1' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_active', '1')}
                            className="h-8 text-xs"
                        >
                            Active
                        </Button>
                        <Button
                            variant={filters.is_active === '0' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_active', '0')}
                            className="h-8 text-xs"
                        >
                            Inactive
                        </Button>
                        <Button
                            variant={filters.trashed === 'only' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('trashed', filters.trashed === 'only' ? null : 'only')}
                            className="h-8 text-xs flex items-center gap-1.5"
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
                                    <TableHead className="w-[280px]">Brand Identity</TableHead>
                                    <TableHead>Slug Identifier</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Created Date</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {brandList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-32 text-center text-xs text-muted-foreground">
                                            No brands found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    brandList.data.map((item) => (
                                        <TableRow key={item.uuid} className={item.deleted_at ? 'bg-destructive/5' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40 overflow-hidden shrink-0">
                                                        {item.logo_url ? (
                                                            <img src={item.logo_url} alt={item.name} className="size-full object-contain p-1" />
                                                        ) : (
                                                            <ImageIcon className="size-4 text-muted-foreground/40" />
                                                        )}
                                                    </div>
                                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                        <span>{item.name}</span>
                                                        {item.deleted_at && (
                                                            <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                                                Deleted
                                                            </Badge>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                                                    {item.slug}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={item.is_active ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'text-muted-foreground'}
                                                >
                                                    {item.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>

                                            <TableCell>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-8">
                                                            <MoreVertical className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-44">
                                                        {!item.deleted_at ? (
                                                            <>
                                                                {canManage && (
                                                                    <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                                        <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Brand
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {canDelete && (
                                                                    <>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            onClick={() => setActionTarget({ uuid: item.uuid, name: item.name, action: 'delete' })}
                                                                            className="text-destructive focus:text-destructive"
                                                                        >
                                                                            <Trash2 className="mr-2 size-4" /> Move to Trash
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
                                                            </>
                                                        ) : (
                                                            canDelete && (
                                                                <>
                                                                    <DropdownMenuItem onClick={() => handleRestore(item.uuid)}>
                                                                        <RotateCcw className="mr-2 size-4 text-emerald-600" /> Restore Brand
                                                                    </DropdownMenuItem>
                                                                    <DropdownMenuSeparator />
                                                                    <DropdownMenuItem
                                                                        onClick={() => setActionTarget({ uuid: item.uuid, name: item.name, action: 'forceDelete' })}
                                                                        className="text-destructive focus:text-destructive"
                                                                    >
                                                                        <Trash2 className="mr-2 size-4" /> Delete Permanently
                                                                    </DropdownMenuItem>
                                                                </>
                                                            )
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* MODAL DIALOG */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-bold text-lg">
                            <Tag className="size-5 text-primary" />
                            {editingBrand ? 'Edit Brand Profile' : 'Register New Brand'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Configure brand details, logo media, and visibility settings.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleFormSubmit} className="space-y-4 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-1 space-y-1.5 min-h-[160px]">
                                <SingleImageUploader
                                    label="Upload Logo"
                                    value={data.logo}
                                    onChange={(file) => setData('logo', file)}
                                    maxSizeMB={2}
                                />
                                {errors.logo && <p className="text-[11px] text-destructive">{errors.logo}</p>}
                            </div>

                            <div className="sm:col-span-2 space-y-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="brand_name" className="text-xs font-semibold">
                                        Brand Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="brand_name"
                                        placeholder="e.g. Samsung, Apple, Xiaomi"
                                        value={data.name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        className={cn('h-9 text-xs', errors.name && 'border-destructive')}
                                        autoFocus
                                    />
                                    {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="brand_slug" className="text-xs font-semibold">
                                        URL Slug <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="brand_slug"
                                        placeholder="samsung"
                                        value={data.slug}
                                        onChange={(e) => setData('slug', slugify(e.target.value))}
                                        className={cn('h-9 text-xs font-mono', errors.slug && 'border-destructive')}
                                    />
                                    {errors.slug && <p className="text-[11px] text-destructive">{errors.slug}</p>}
                                </div>

                                <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                    <div className="space-y-0.5">
                                        <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">
                                            Active Status
                                        </Label>
                                        <p className="text-[10px] text-muted-foreground">
                                            Enable selection across product forms.
                                        </p>
                                    </div>
                                    <Switch
                                        id="is_active"
                                        checked={data.is_active}
                                        onCheckedChange={(checked) => setData('is_active', checked)}
                                    />
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setModalOpen(false)}
                                disabled={processing}
                            >
                                Cancel
                            </Button>
                            <Button type="submit" size="sm" disabled={processing || !data.name || !data.slug}>
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                                        {editingBrand ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    editingBrand ? 'Update Brand' : 'Create Brand'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ACTION CONFIRMATION DIALOG */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {actionTarget?.action === 'forceDelete' ? 'Permanently Purge Brand?' : 'Move Brand to Trash?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionTarget?.action === 'forceDelete'
                                ? `This operation cannot be undone. This will permanently remove "${actionTarget?.name}" and delete logo media.`
                                : `Are you sure you want to soft-delete "${actionTarget?.name}"? You can restore it anytime.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeAction}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            {actionTarget?.action === 'forceDelete' ? 'Purge Permanently' : 'Confirm Trash'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

Index.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Brands', href: brands.index.url() },
    ],
};

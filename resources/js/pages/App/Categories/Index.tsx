import { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    FolderTree,
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
    Image as ImageIcon,
    GitFork,
    ArrowUpDown
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { StatCard } from '@/components/special/stat-card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import categories from '@/routes/app/categories';
import { dashboard } from '@/routes';
import { cn } from '@/lib/utils';

interface CategoryItem {
    id: number;
    uuid: string;
    parent_id: number | null;
    name: string;
    slug: string;
    image_path: string | null;
    icon_path: string | null;
    image_url?: string | null;
    icon_url?: string | null;
    sort_order: number;
    is_active: boolean;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    parent?: {
        id: number;
        uuid: string;
        name: string;
    };
}

interface ParentOption {
    id: number;
    uuid: string;
    name: string;
}

interface IndexProps {
    categories: {
        data: CategoryItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    parents: ParentOption[];
    stats: {
        total: number;
        root: number;
        sub: number;
        trashed: number;
    };
    filters: {
        search?: string;
        parent_id?: string;
        is_active?: string;
        trashed?: string;
    };
}

export default function Index({ categories: categoryList, parents, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canManage = permissions.includes('categories.manage');
    const canDelete = permissions.includes('categories.delete');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<CategoryItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        parent_id: '' as string | number,
        name: '',
        slug: '',
        image: null as File | string | null,
        icon: null as File | string | null,
        sort_order: '0',
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
            slug: !editingCategory ? slugify(val) : prev.slug,
        }));
    };

    const openCreateModal = () => {
        reset();
        clearErrors();
        setEditingCategory(null);
        setModalOpen(true);
    };

    const openEditModal = (category: CategoryItem) => {
        clearErrors();
        setEditingCategory(category);
        setData({
            parent_id: category.parent_id ? String(category.parent_id) : '',
            name: category.name,
            slug: category.slug,
            image: category.image_url || null,
            icon: category.icon_url || null,
            sort_order: String(category.sort_order),
            is_active: category.is_active,
        });
        setModalOpen(true);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingCategory) {
            router.post(categories.update.url({ category: editingCategory.uuid }), {
                _method: 'put',
                ...data,
                image: data.image instanceof File ? data.image : null,
                icon: data.icon instanceof File ? data.icon : null,
            }, {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        } else {
            post(categories.store.url(), {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        }
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                categories.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            categories.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(categories.destroy.url({ category: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(categories.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(categories.restore.url({ uuid }));
    };

    return (
        <>
            <Head title="Category Management" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <FolderTree className="size-6 text-primary" />
                            Category Catalogue
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Organize store product hierarchies, visual thumbnails, vector icons, and sort priorities.
                        </p>
                    </div>

                    {canManage && (
                        <Button onClick={openCreateModal} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 size-4" />
                            Add New Category
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Categories" value={stats.total} icon={FolderTree} />
                    <StatCard title="Root Categories" value={stats.root} icon={CheckCircle2} />
                    <StatCard title="Sub-categories" value={stats.sub} icon={GitFork} />
                    <StatCard title="Trashed Categories" value={stats.trashed} icon={Archive} />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
                        <div className="relative w-full sm:w-80">
                            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                placeholder="Search category name or slug..."
                                defaultValue={filters.search || ''}
                                onKeyDown={handleSearch}
                                className="pl-9 h-9 text-xs"
                            />
                        </div>

                        <div className="w-full sm:w-56">
                            <Select
                                value={filters.parent_id || 'all'}
                                onValueChange={(val) => handleFilterChange('parent_id', val === 'all' ? null : val)}
                            >
                                <SelectTrigger className="w-full h-9 text-xs">
                                    <SelectValue placeholder="All Structural Levels" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Structural Levels</SelectItem>
                                    <SelectItem value="root">Root Categories Only</SelectItem>
                                    {parents.map((p) => (
                                        <SelectItem key={p.id} value={String(p.id)}>
                                            Under {p.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
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
                            All
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
                                    <TableHead className="w-[280px]">Category Hierarchy</TableHead>
                                    <TableHead>Classification</TableHead>
                                    <TableHead>URL Slug</TableHead>
                                    <TableHead className="text-center">Sort Order</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {categoryList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                                            No categories found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    categoryList.data.map((item) => (
                                        <TableRow key={item.uuid} className={item.deleted_at ? 'bg-destructive/5' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40 overflow-hidden shrink-0">
                                                        {item.image_url || item.icon_url ? (
                                                            <img
                                                                src={item.image_url || item.icon_url || ''}
                                                                alt={item.name}
                                                                className="size-full object-cover"
                                                            />
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
                                                {item.parent ? (
                                                    <Badge variant="outline" className="gap-1 font-normal text-xs bg-muted/30">
                                                        <GitFork className="size-3 text-muted-foreground" />
                                                        {item.parent.name}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="font-semibold text-xs text-primary">
                                                        Root Level
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <span className="font-mono text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
                                                    /{item.slug}
                                                </span>
                                            </TableCell>

                                            <TableCell className="text-center">
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {item.sort_order}
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
                                                                        <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Category
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
                                                                        <RotateCcw className="mr-2 size-4 text-emerald-600" /> Restore Category
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
                <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-bold text-lg">
                            <FolderTree className="size-5 text-primary" />
                            {editingCategory ? 'Edit Category' : 'Create New Category'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Configure category classification, parent tree attachments, and visual media assets.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleFormSubmit} className="space-y-4">
                        {/* Dual Media Uploaders Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <SingleImageUploader
                                    label="Upload Banner"
                                    value={data.image}
                                    onChange={(file) => setData('image', file)}
                                    maxSizeMB={2}
                                />
                                {errors.image && <p className="text-[11px] text-destructive">{errors.image}</p>}
                            </div>

                            <div className="space-y-1.5">
                                <SingleImageUploader
                                    label="Upload Icon"
                                    value={data.icon}
                                    onChange={(file) => setData('icon', file)}
                                    maxSizeMB={1}
                                />
                                {errors.icon && <p className="text-[11px] text-destructive">{errors.icon}</p>}
                            </div>
                        </div>

                        {/* Form Inputs */}
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="category_name" className="text-xs font-semibold">
                                        Category Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="category_name"
                                        placeholder="e.g. Mobile Phones, Fashion"
                                        className={cn('h-9 text-xs', errors.name && 'border-destructive')}
                                        value={data.name}
                                        onChange={(e) => handleNameChange(e.target.value)}
                                        autoFocus
                                    />
                                    {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="category_slug" className="text-xs font-semibold">
                                        URL Slug <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="category_slug"
                                        placeholder="mobile-phones"
                                        className={cn('h-9 text-xs font-mono', errors.slug && 'border-destructive')}
                                        value={data.slug}
                                        onChange={(e) => setData('slug', slugify(e.target.value))}
                                    />
                                    {errors.slug && <p className="text-[11px] text-destructive">{errors.slug}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="parent_id" className="text-xs font-semibold">
                                        Parent Category
                                    </Label>
                                    <Select
                                        value={data.parent_id ? String(data.parent_id) : 'none'}
                                        onValueChange={(val) => setData('parent_id', val === 'none' ? '' : val)}
                                    >
                                        <SelectTrigger id="parent_id" className={cn('w-full text-xs h-9', errors.parent_id && 'border-destructive')}>
                                            <SelectValue placeholder="Root Level (No Parent)" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None / Root Category</SelectItem>
                                            {parents
                                                .filter(p => !editingCategory || p.id !== editingCategory.id)
                                                .map((parent) => (
                                                    <SelectItem key={parent.id} value={String(parent.id)}>
                                                        {parent.name}
                                                    </SelectItem>
                                                ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.parent_id && <p className="text-[11px] text-destructive">{errors.parent_id}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="sort_order" className="text-xs font-semibold">
                                        Sort Order
                                    </Label>
                                    <div className="relative">
                                        <ArrowUpDown className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="sort_order"
                                            type="number"
                                            min={0}
                                            className={cn('pl-9 h-9 text-xs font-mono', errors.sort_order && 'border-destructive')}
                                            value={data.sort_order}
                                            onChange={(e) => setData('sort_order', e.target.value)}
                                        />
                                    </div>
                                    {errors.sort_order && <p className="text-[11px] text-destructive">{errors.sort_order}</p>}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                <div className="space-y-0.5">
                                    <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">
                                        Published Status
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        Active categories are visible to customers for browsing.
                                    </p>
                                </div>
                                <Switch
                                    id="is_active"
                                    checked={data.is_active}
                                    onCheckedChange={(checked) => setData('is_active', checked)}
                                />
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
                                        {editingCategory ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    editingCategory ? 'Update Category' : 'Create Category'
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
                            {actionTarget?.action === 'forceDelete' ? 'Permanently Purge Category?' : 'Move Category to Trash?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionTarget?.action === 'forceDelete'
                                ? `This operation cannot be undone. This will permanently remove "${actionTarget?.name}" and delete all linked image assets from server storage.`
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
        { title: 'Categories', href: categories.index.url() },
    ],
};

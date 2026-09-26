import React, { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Image as ImageIcon,
    Plus,
    Search,
    MoreVertical,
    Edit,
    Trash2,
    RotateCcw,
    Archive,
    ExternalLink,
    Calendar,
    Building2,
    LayoutGrid,
    List,
    Loader2,
    LayoutTemplate
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import banners from '@/routes/app/banners';
import { dashboard } from '@/routes';
import { cn } from '@/lib/utils';

interface BannerItem {
    id: number;
    uuid: string;
    store_id: number | null;
    title: string;
    image_path: string;
    image_url?: string | null;
    url_type: 'product' | 'category' | 'custom' | 'none';
    url: string | null;
    position: 'main_slider' | 'sidebar' | 'popup' | 'footer';
    sort_order: number;
    is_active: boolean;
    starts_at: string | null;
    ends_at: string | null;
    deleted_at: string | null;
    store?: {
        id: number;
        name: string;
    };
}

interface IndexProps {
    banners: {
        data: BannerItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    trashedCount: number;
    filters: {
        search?: string;
        position?: string;
        store_id?: string;
        trashed?: string;
    };
    stores: Array<{ id: number; name: string }>;
}

export default function Index({ banners: bannerList, trashedCount, filters, stores }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[]; store_id: number | null } } }>().props;
    const isGlobalAdmin = auth?.user?.store_id === null;

    // Default View Mode Set to Table
    const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
    const [modalOpen, setModalOpen] = useState(false);
    const [editingBanner, setEditingBanner] = useState<BannerItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ id: number; uuid: string; title: string; action: 'delete' | 'forceDelete' } | null>(null);

    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        title: '',
        image: null as File | string | null,
        url_type: 'none',
        url: '',
        position: 'main_slider',
        sort_order: '0',
        store_id: '',
        starts_at: '',
        ends_at: '',
        is_active: true,
    });

    const openCreateModal = () => {
        reset();
        clearErrors();
        setEditingBanner(null);
        setModalOpen(true);
    };

    const openEditModal = (banner: BannerItem) => {
        clearErrors();
        setEditingBanner(banner);
        setData({
            title: banner.title,
            image: banner.image_url || banner.image_path || null,
            url_type: banner.url_type,
            url: banner.url || '',
            position: banner.position,
            sort_order: String(banner.sort_order),
            store_id: banner.store_id ? String(banner.store_id) : '',
            starts_at: banner.starts_at ? banner.starts_at.substring(0, 10) : '',
            ends_at: banner.ends_at ? banner.ends_at.substring(0, 10) : '',
            is_active: banner.is_active,
        });
        setModalOpen(true);
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingBanner) {
            // Use router.post with _method: 'put' for proper multipart file upload handling
            router.post(banners.update.url({ banner: editingBanner.id }), {
                _method: 'put',
                ...data,
                // Pass File object if new image is selected, otherwise null
                image: data.image instanceof File ? data.image : null,
            }, {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        } else {
            post(banners.store.url(), {
                forceFormData: true,
                onSuccess: () => setModalOpen(false),
            });
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            banners.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            handleFilterChange('search', value);
        }
    };

    const executeDeleteAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(banners.destroy.url({ banner: actionTarget.id }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(banners.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(banners.restore.url({ uuid }));
    };

    return (
        <>
            <Head title="Banner Management" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <ImageIcon className="size-6 text-primary" />
                            Promotional Banners
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage home sliders, popup displays, and location-scoped promotional media.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
                            <Button
                                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="size-8"
                                onClick={() => setViewMode('table')}
                                title="Dense Table View"
                            >
                                <List className="size-4" />
                            </Button>
                            <Button
                                variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                                size="icon"
                                className="size-8"
                                onClick={() => setViewMode('grid')}
                                title="Visual Grid View"
                            >
                                <LayoutGrid className="size-4" />
                            </Button>
                        </div>

                        <Button onClick={openCreateModal} size="sm">
                            <Plus className="mr-2 size-4" /> Add Banner
                        </Button>
                    </div>
                </div>

                {/* Filter & Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                            <Input
                                placeholder="Search banner title..."
                                defaultValue={filters.search || ''}
                                onKeyDown={handleSearch}
                                className="pl-9 text-xs"
                            />
                        </div>

                        {isGlobalAdmin && stores.length > 0 && (
                            <div className="w-full sm:w-56">
                                <Select
                                    value={filters.store_id || 'all'}
                                    onValueChange={(val) => handleFilterChange('store_id', val === 'all' ? null : val)}
                                >
                                    <SelectTrigger className="w-full text-xs">
                                        <SelectValue placeholder="All Outlets & Global" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Outlets & Global</SelectItem>
                                        {stores.map((s) => (
                                            <SelectItem key={s.id} value={String(s.id)}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.position && !filters.trashed ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                handleFilterChange('position', null);
                                handleFilterChange('trashed', null);
                            }}
                            className="h-8 text-xs"
                        >
                            All
                        </Button>
                        <Button
                            variant={filters.position === 'main_slider' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('position', 'main_slider')}
                            className="h-8 text-xs"
                        >
                            Main Slider
                        </Button>
                        <Button
                            variant={filters.position === 'popup' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('position', 'popup')}
                            className="h-8 text-xs"
                        >
                            Popup
                        </Button>
                        <Button
                            variant={filters.trashed === 'only' ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('trashed', filters.trashed === 'only' ? null : 'only')}
                            className="h-8 text-xs flex items-center gap-1.5"
                        >
                            <Archive className="size-3.5" />
                            Trashed ({trashedCount})
                        </Button>
                    </div>
                </div>

                {/* CONTENT AREA */}
                {bannerList.data.length === 0 ? (
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm p-12 text-center">
                        <div className="flex flex-col items-center justify-center space-y-3">
                            <div className="p-3 bg-muted/50 rounded-full">
                                <ImageIcon className="size-8 text-muted-foreground" />
                            </div>
                            <h3 className="text-sm font-semibold">No banners found</h3>
                            <p className="text-xs text-muted-foreground">Try adjusting your filter parameters or upload a new banner.</p>
                            <Button size="sm" variant="outline" onClick={openCreateModal}>
                                <Plus className="mr-2 size-4" /> Create Banner
                            </Button>
                        </div>
                    </Card>
                ) : viewMode === 'table' ? (

                    /* DEFAULT DENSE TABLE VIEW */
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm overflow-hidden">
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[240px]">Banner</TableHead>
                                        <TableHead>Target Scope</TableHead>
                                        <TableHead>Placement & Order</TableHead>
                                        <TableHead>Schedule Window</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-20 text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {bannerList.data.map((item) => (
                                        <TableRow key={item.uuid} className={item.deleted_at ? 'bg-destructive/5' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex h-12 w-20 items-center justify-center rounded-md border border-border bg-muted/40 overflow-hidden shrink-0">
                                                        {item.image_url || item.image_path ? (
                                                            <img
                                                                src={item.image_url || item.image_path}
                                                                alt={item.title}
                                                                className="size-full object-cover"
                                                            />
                                                        ) : (
                                                            <ImageIcon className="size-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                            {item.title}
                                                            {item.deleted_at && (
                                                                <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                                                    Deleted
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        {item.url && (
                                                            <a
                                                                href={item.url}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                                className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                                                            >
                                                                <ExternalLink className="size-3" /> {item.url_type}: {item.url}
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                {item.store ? (
                                                    <Badge variant="secondary" className="text-[10px] flex items-center gap-1 w-fit">
                                                        <Building2 className="size-3" /> {item.store.name}
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        Global (All Outlets)
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    <Badge variant="outline" className="capitalize text-[10px]">
                                                        {item.position.replace('_', ' ')}
                                                    </Badge>
                                                    <div className="text-[11px] font-mono text-muted-foreground">
                                                        Order: {item.sort_order}
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="text-xs text-muted-foreground space-y-0.5">
                                                    {item.starts_at || item.ends_at ? (
                                                        <div className="flex items-center gap-1 text-[11px]">
                                                            <Calendar className="size-3 text-primary" />
                                                            {item.starts_at ? new Date(item.starts_at).toLocaleDateString() : 'Start'}
                                                            <span>→</span>
                                                            {item.ends_at ? new Date(item.ends_at).toLocaleDateString() : 'End'}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[11px] text-emerald-600 font-medium">Always Active</span>
                                                    )}
                                                </div>
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
                                                                <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                                    <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Banner
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => setActionTarget({ id: item.id, uuid: item.uuid, title: item.title, action: 'delete' })}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="mr-2 size-4" /> Move to Trash
                                                                </DropdownMenuItem>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <DropdownMenuItem onClick={() => handleRestore(item.uuid)}>
                                                                    <RotateCcw className="mr-2 size-4 text-emerald-600" /> Restore Banner
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => setActionTarget({ id: item.id, uuid: item.uuid, title: item.title, action: 'forceDelete' })}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="mr-2 size-4" /> Delete Permanently
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ) : (

                    /* VISUAL CARDS GRID VIEW */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {bannerList.data.map((item) => (
                            <Card
                                key={item.uuid}
                                className={cn(
                                    "border-sidebar-border/70 dark:border-sidebar-border shadow-sm overflow-hidden flex flex-col group transition-all",
                                    item.deleted_at && "bg-destructive/5 opacity-80"
                                )}
                            >
                                <div className="relative aspect-[16/8] bg-muted/40 overflow-hidden border-b border-border">
                                    {item.image_url || item.image_path ? (
                                        <img
                                            src={item.image_url || item.image_path}
                                            alt={item.title}
                                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                                        />
                                    ) : (
                                        <div className="flex size-full items-center justify-center">
                                            <ImageIcon className="size-8 text-muted-foreground" />
                                        </div>
                                    )}

                                    <div className="absolute top-2 left-2 flex items-center gap-1.5 flex-wrap">
                                        <Badge variant="secondary" className="bg-background/80 backdrop-blur-md text-[10px] font-semibold">
                                            {item.position.replace('_', ' ').toUpperCase()}
                                        </Badge>
                                        <Badge variant="outline" className="bg-background/80 backdrop-blur-md text-[10px]">
                                            Order: {item.sort_order}
                                        </Badge>
                                    </div>

                                    <div className="absolute top-2 right-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="secondary" size="icon" className="size-7 bg-background/80 backdrop-blur-md">
                                                    <MoreVertical className="size-3.5" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-44">
                                                {!item.deleted_at ? (
                                                    <>
                                                        <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                            <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Banner
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setActionTarget({ id: item.id, uuid: item.uuid, title: item.title, action: 'delete' })}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 size-4" /> Move to Trash
                                                        </DropdownMenuItem>
                                                    </>
                                                ) : (
                                                    <>
                                                        <DropdownMenuItem onClick={() => handleRestore(item.uuid)}>
                                                            <RotateCcw className="mr-2 size-4 text-emerald-600" /> Restore Banner
                                                        </DropdownMenuItem>
                                                        <DropdownMenuSeparator />
                                                        <DropdownMenuItem
                                                            onClick={() => setActionTarget({ id: item.id, uuid: item.uuid, title: item.title, action: 'forceDelete' })}
                                                            className="text-destructive focus:text-destructive"
                                                        >
                                                            <Trash2 className="mr-2 size-4" /> Delete Permanently
                                                        </DropdownMenuItem>
                                                    </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>

                                <CardContent className="p-4 flex-1 flex flex-col justify-between space-y-3">
                                    <div>
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="font-semibold text-sm text-foreground line-clamp-1">{item.title}</h4>
                                            <Badge
                                                variant="outline"
                                                className={item.is_active ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10 shrink-0 text-[10px]' : 'text-muted-foreground shrink-0 text-[10px]'}
                                            >
                                                {item.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </div>

                                        {item.url && (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-1 truncate"
                                            >
                                                <ExternalLink className="size-3 shrink-0" />
                                                <span className="truncate">{item.url_type}: {item.url}</span>
                                            </a>
                                        )}
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            {item.store ? (
                                                <span className="flex items-center gap-1 text-[11px] font-medium text-foreground">
                                                    <Building2 className="size-3 text-primary" /> {item.store.name}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-muted-foreground">Global Site Banner</span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-1 text-[11px]">
                                            <Calendar className="size-3" />
                                            {item.starts_at ? new Date(item.starts_at).toLocaleDateString() : 'Always'}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </div>

            {/* CREATE / EDIT DIALOG MODAL (LANDSCAPE 2-COLUMN) */}
            <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                <DialogContent className="sm:max-w-5xl max-h-[90vh] p-0 flex flex-col overflow-hidden gap-0 bg-background">
                    <DialogHeader className="px-6 py-4 border-b border-border shrink-0 bg-muted/10">
                        <DialogTitle className="text-lg font-semibold tracking-tight">
                            {editingBanner ? 'Edit Banner Settings' : 'Create New Banner'}
                        </DialogTitle>
                        <DialogDescription className="text-sm">
                            Configure promotional media, target parameters, and scheduling limits.
                        </DialogDescription>
                    </DialogHeader>

                    {/* Scrollable Form Body */}
                    <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto flex flex-col">
                        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1">

                            {/* LEFT COLUMN: TITLE & MEDIA (5 COLS) */}
                            <div className="lg:col-span-5 p-6 space-y-2 border-b lg:border-b-0 lg:border-r border-border bg-muted/5 flex flex-col">
                                <div className="space-y-2.5">
                                    <Label htmlFor="title" className="text-sm font-medium flex items-center gap-1.5">
                                        <LayoutTemplate className="size-4 text-muted-foreground" />
                                        Banner Title <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="title"
                                        placeholder="e.g. Festival Multi-Store Campaign"
                                        className={cn('h-9 text-sm', errors.title && 'border-destructive focus-visible:ring-destructive')}
                                        value={data.title}
                                        onChange={(e) => setData('title', e.target.value)}
                                        autoFocus
                                    />
                                    {errors.title && <p className="text-xs font-medium text-destructive">{errors.title}</p>}
                                </div>

                                <div className="space-y-2.5 flex-1 flex flex-col">
                                    <Label className="text-sm font-medium flex justify-between items-center">
                                        <span>Banner Media {!editingBanner && <span className="text-destructive">*</span>}</span>
                                        <span className="text-xs text-muted-foreground font-normal">Max 2MB</span>
                                    </Label>
                                    <div className={cn(
                                        "flex-1 min-h-60 rounded-lg transition-all",
                                        errors.image ? "border-2 border-dashed border-destructive/50 bg-destructive/5" : "border-2 border-dashed border-border hover:border-primary/50"
                                    )}>
                                        <SingleImageUploader
                                            label="Drag & drop banner image here"
                                            value={data.image}
                                            onChange={(file) => setData('image', file)}
                                            maxSizeMB={2}
                                            className="w-full h-full rounded-lg"
                                        />
                                    </div>
                                    {errors.image && <p className="text-xs font-medium text-destructive">{errors.image}</p>}
                                </div>
                            </div>

                            {/* RIGHT COLUMN: CONFIGURATIONS (7 COLS) */}
                            <div className="lg:col-span-7 p-6 space-y-4">

                                {/* SECTION 1: Placement & Scope */}
                                <div className="space-y-2">
                                    {isGlobalAdmin && stores.length > 0 && (
                                        <div className="space-y-2">
                                            <Label htmlFor="store_id" className="text-sm font-medium">Target Store</Label>
                                            <Select
                                                value={data.store_id || 'global'}
                                                onValueChange={(val) => setData('store_id', val === 'global' ? '' : val)}
                                            >
                                                <SelectTrigger id="store_id" className={cn("w-full h-9 text-sm", errors.store_id && "border-destructive")}>
                                                    <SelectValue placeholder="Global (All Outlets)" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="global" className="font-medium">Global (All Outlets)</SelectItem>
                                                    {stores.map((s) => (
                                                        <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            {errors.store_id && <p className="text-xs text-destructive">{errors.store_id}</p>}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <Label htmlFor="position" className="text-sm font-medium">Placement Zone</Label>
                                            <Select value={data.position} onValueChange={(val: any) => setData('position', val)}>
                                                <SelectTrigger id="position" className="w-full h-9 text-sm">
                                                    <SelectValue placeholder="Select position" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="main_slider">Main Slider</SelectItem>
                                                    <SelectItem value="sidebar">Sidebar</SelectItem>
                                                    <SelectItem value="popup">Popup Modal</SelectItem>
                                                    <SelectItem value="footer">Footer Banner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="sort_order" className="text-sm font-medium">Sort Priority</Label>
                                            <Input
                                                id="sort_order"
                                                type="number"
                                                min="0"
                                                placeholder="0"
                                                className={cn('h-9 text-sm font-mono', errors.sort_order && 'border-destructive')}
                                                value={data.sort_order}
                                                onChange={(e) => setData('sort_order', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* SECTION 2: Click Action */}
                                <div className="space-y-2 pt-4 border-t border-border/70">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <Label htmlFor="url_type" className="text-sm font-medium">Link Type</Label>
                                            <Select value={data.url_type} onValueChange={(val: any) => setData('url_type', val)}>
                                                <SelectTrigger id="url_type" className="w-full h-9 text-sm">
                                                    <SelectValue placeholder="Select link type" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">No Link (Display Only)</SelectItem>
                                                    <SelectItem value="product">Product Link</SelectItem>
                                                    <SelectItem value="category">Category Link</SelectItem>
                                                    <SelectItem value="custom">Custom URL</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="url" className="text-sm font-medium">
                                                {data.url_type === 'custom' ? 'Destination URL' : data.url_type === 'none' ? 'Target' : 'Target ID'}
                                            </Label>
                                            <Input
                                                id="url"
                                                disabled={data.url_type === 'none'}
                                                placeholder={
                                                    data.url_type === 'custom' ? 'https://...' :
                                                    data.url_type === 'none' ? 'Not applicable' :
                                                    'e.g. 142 or slug-name'
                                                }
                                                className={cn(
                                                    'h-9 text-sm transition-colors',
                                                    errors.url && 'border-destructive',
                                                    data.url_type === 'none' && 'bg-muted text-muted-foreground cursor-not-allowed border-transparent'
                                                )}
                                                value={data.url}
                                                onChange={(e) => setData('url', e.target.value)}
                                            />
                                            {errors.url && <p className="text-xs text-destructive">{errors.url}</p>}
                                        </div>
                                    </div>
                                </div>

                                {/* SECTION 3: Scheduling */}
                                <div className="space-y-2 pt-4 border-t border-border/70">
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <Label htmlFor="starts_at" className="text-sm font-medium">Start Date <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                            <Input
                                                id="starts_at"
                                                type="date"
                                                className="h-9 text-sm block w-full"
                                                value={data.starts_at}
                                                onChange={(e) => setData('starts_at', e.target.value)}
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="ends_at" className="text-sm font-medium">End Date <span className="text-muted-foreground font-normal">(Optional)</span></Label>
                                            <Input
                                                id="ends_at"
                                                type="date"
                                                className="h-9 text-sm block w-full"
                                                value={data.ends_at}
                                                onChange={(e) => setData('ends_at', e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* BOTTOM FULL-WIDTH TOGGLE */}
                        <div className="px-6 pb-6 pt-2 shrink-0">
                            <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:border-primary/30">
                                <div className="space-y-1">
                                    <Label htmlFor="is_active" className="text-sm font-semibold cursor-pointer">
                                        Publish Banner
                                    </Label>
                                    <p className="text-xs text-muted-foreground">
                                        Make this banner visible to customers immediately.
                                    </p>
                                </div>
                                <Switch
                                    id="is_active"
                                    checked={data.is_active}
                                    onCheckedChange={(checked) => setData('is_active', checked)}
                                />
                            </div>
                        </div>

                        {/* FOOTER */}
                        <DialogFooter className="px-6 py-4 border-t border-border bg-muted/10 shrink-0">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => setModalOpen(false)}
                                disabled={processing}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                disabled={processing || !data.title || (!editingBanner && !data.image)}
                                className="min-w-[140px]"
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-2 size-4 animate-spin" />
                                        {editingBanner ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    editingBanner ? 'Update Banner' : 'Create Banner'
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* CONFIRMATION DIALOG MODAL */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {actionTarget?.action === 'forceDelete' ? 'Permanently Purge Banner?' : 'Move Banner to Trash?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionTarget?.action === 'forceDelete'
                                ? `This operation cannot be undone. This will permanently remove "${actionTarget?.title}" and purge media from storage.`
                                : `Are you sure you want to soft-delete "${actionTarget?.title}"? You can restore it anytime.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeDeleteAction}
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
        { title: 'Banners', href: banners.index.url() },
    ],
};

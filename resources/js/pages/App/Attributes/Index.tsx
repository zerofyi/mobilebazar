import { useState } from 'react';
import { Head, router, useForm, usePage } from '@inertiajs/react';
import {
    Sliders,
    Plus,
    Search,
    CheckCircle2,
    XCircle,
    MoreVertical,
    Edit,
    Trash2,
    Loader2,
    X,
    Layers,
    Tag
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

import attributes from '@/routes/app/attributes';
import { dashboard } from '@/routes';
import { cn } from '@/lib/utils';

interface AttributeValueItem {
    id: number;
    uuid: string;
    attribute_id: number;
    value: string;
}

interface AttributeItem {
    id: number;
    uuid: string;
    name: string;
    type: string | null;
    is_variant_defining: boolean;
    values: AttributeValueItem[];
    created_at: string;
    updated_at: string;
}

interface IndexProps {
    attributes: {
        data: AttributeItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        variant: number;
        spec: number;
        values: number;
    };
    filters: {
        search?: string;
        is_variant_defining?: string;
    };
}

export default function Index({ attributes: attributeList, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canManage = permissions.includes('attributes.manage');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingAttribute, setEditingAttribute] = useState<AttributeItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ uuid: string; name: string } | null>(null);
    const [valueInput, setValueInput] = useState('');

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        name: '',
        type: '',
        is_variant_defining: true,
        values: [] as Array<{ value: string }>,
    });

    const openCreateModal = () => {
        reset();
        clearErrors();
        setValueInput('');
        setEditingAttribute(null);
        setModalOpen(true);
    };

    const openEditModal = (attr: AttributeItem) => {
        clearErrors();
        setValueInput('');
        setEditingAttribute(attr);
        setData({
            name: attr.name,
            type: attr.type || '',
            is_variant_defining: attr.is_variant_defining,
            values: attr.values.map((v) => ({ value: v.value })),
        });
        setModalOpen(true);
    };

    const handleAddValue = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = valueInput.trim();
        if (!trimmed) return;

        // Prevent duplicate value chips
        if (data.values.some((v) => v.value.toLowerCase() === trimmed.toLowerCase())) {
            setValueInput('');
            return;
        }

        setData('values', [...data.values, { value: trimmed }]);
        setValueInput('');
    };

    const handleRemoveValue = (indexToRemove: number) => {
        setData('values', data.values.filter((_, idx) => idx !== indexToRemove));
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (editingAttribute) {
            put(attributes.update.url({ attribute: editingAttribute.uuid }), {
                onSuccess: () => setModalOpen(false),
            });
        } else {
            post(attributes.store.url(), {
                onSuccess: () => setModalOpen(false),
            });
        }
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                attributes.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            attributes.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeDelete = () => {
        if (!actionTarget) return;

        router.delete(attributes.destroy.url({ attribute: actionTarget.uuid }), {
            onFinish: () => setActionTarget(null),
        });
    };

    return (
        <>
            <Head title="Attribute Management" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Sliders className="size-6 text-primary" />
                            Product Attributes
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage product variant specifications (RAM, Storage, Color) and option value choices.
                        </p>
                    </div>

                    {canManage && (
                        <Button onClick={openCreateModal} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 size-4" />
                            Add Attribute
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Attributes" value={stats.total} icon={Sliders} />
                    <StatCard title="Variant Defining" value={stats.variant} icon={CheckCircle2} />
                    <StatCard title="Specification Only" value={stats.spec} icon={XCircle} />
                    <StatCard title="Total Values" value={stats.values} icon={Tag} />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search attribute name..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.is_variant_defining ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_variant_defining', null)}
                            className="h-8 text-xs"
                        >
                            All
                        </Button>
                        <Button
                            variant={filters.is_variant_defining === '1' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_variant_defining', '1')}
                            className="h-8 text-xs"
                        >
                            Variant Defining
                        </Button>
                        <Button
                            variant={filters.is_variant_defining === '0' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_variant_defining', '0')}
                            className="h-8 text-xs"
                        >
                            Spec Only
                        </Button>
                    </div>
                </div>

                {/* Data Table */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[200px]">Attribute Name</TableHead>
                                    <TableHead>Classification</TableHead>
                                    <TableHead>Configured Value Options</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {attributeList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="h-32 text-center text-xs text-muted-foreground">
                                            No attributes found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    attributeList.data.map((item) => (
                                        <TableRow key={item.uuid}>
                                            <TableCell>
                                                <span className="font-semibold text-xs text-foreground">
                                                    {item.name}
                                                </span>
                                            </TableCell>

                                            <TableCell>
                                                {item.is_variant_defining ? (
                                                    <Badge variant="secondary" className="font-semibold text-xs text-primary">
                                                        Variant Defining
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="gap-1 font-normal text-xs bg-muted/30">
                                                        <Layers className="size-3 text-muted-foreground" />
                                                        Specification Only
                                                    </Badge>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-wrap gap-1.5 max-w-xl">
                                                    {item.values.map((val) => (
                                                        <Badge
                                                            key={val.uuid}
                                                            variant="outline"
                                                            className="font-mono text-[11px] bg-muted/40 font-normal"
                                                        >
                                                            {val.value}
                                                        </Badge>
                                                    ))}
                                                    {item.values.length === 0 && (
                                                        <span className="text-xs text-muted-foreground italic">No values configured</span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell className="text-right">
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger asChild>
                                                        <Button variant="ghost" size="icon" className="size-8">
                                                            <MoreVertical className="size-4" />
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end" className="w-44">
                                                        {canManage && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                                    <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Attribute
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => setActionTarget({ uuid: item.uuid, name: item.name })}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="mr-2 size-4" /> Delete Attribute
                                                                </DropdownMenuItem>
                                                            </>
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
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 font-bold text-lg">
                            <Sliders className="size-5 text-primary" />
                            {editingAttribute ? 'Edit Attribute' : 'Create New Attribute'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Define attribute properties and option values for product selection.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleFormSubmit} className="space-y-4 pt-2">
                        <div className="space-y-1.5">
                            <Label htmlFor="attr_name" className="text-xs font-semibold">
                                Attribute Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="attr_name"
                                placeholder="e.g. Color, RAM, Internal Storage"
                                value={data.name}
                                onChange={(e) => setData('name', e.target.value)}
                                className={cn('h-9 text-xs', errors.name && 'border-destructive')}
                                autoFocus
                            />
                            {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                        </div>

                        {/* VALUE OPTIONS INLINE TAG MANAGER */}
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">
                                Option Values <span className="text-destructive">*</span>
                            </Label>

                            <div className="flex gap-2">
                                <Input
                                    placeholder="Type value (e.g. 8GB, 128GB, Blue) & press Add"
                                    value={valueInput}
                                    onChange={(e) => setValueInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddValue();
                                        }
                                    }}
                                    className="h-9 text-xs"
                                />
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => handleAddValue()}
                                    className="h-9 px-3 shrink-0 text-xs"
                                >
                                    Add
                                </Button>
                            </div>

                            {/* Option Value Chips List */}
                            <div className="flex flex-wrap gap-1.5 p-2 rounded-lg border border-border bg-muted/20 min-h-14">
                                {data.values.map((v, idx) => (
                                    <Badge
                                        key={idx}
                                        variant="secondary"
                                        className="gap-1 font-mono text-xs bg-background border border-border shadow-xs pl-2 pr-1 py-1"
                                    >
                                        <span>{v.value}</span>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveValue(idx)}
                                            className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                                        >
                                            <X className="size-3" />
                                        </button>
                                    </Badge>
                                ))}
                                {data.values.length === 0 && (
                                    <span className="text-xs text-muted-foreground self-center text-center w-full">
                                        Add at least one option value above.
                                    </span>
                                )}
                            </div>
                            {errors.values && <p className="text-[11px] text-destructive">{errors.values}</p>}
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                            <div className="space-y-0.5">
                                <Label htmlFor="is_variant_defining" className="text-xs font-medium cursor-pointer">
                                    Variant Defining Attribute
                                </Label>
                                <p className="text-[10px] text-muted-foreground">
                                    Generates separate SKUs/prices (e.g. RAM/Color). Uncheck for specs.
                                </p>
                            </div>
                            <Switch
                                id="is_variant_defining"
                                checked={data.is_variant_defining}
                                onCheckedChange={(checked) => setData('is_variant_defining', checked)}
                            />
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
                            <Button
                                type="submit"
                                size="sm"
                                disabled={processing || !data.name || data.values.length === 0}
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                                        {editingAttribute ? 'Updating...' : 'Creating...'}
                                    </>
                                ) : (
                                    editingAttribute ? 'Update Attribute' : 'Create Attribute'
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
                        <AlertDialogTitle>Delete Attribute?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{actionTarget?.name}"? All associated value choices will also be deleted.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeDelete}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Delete Attribute
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
        { title: 'Attributes', href: attributes.index.url() },
    ],
};

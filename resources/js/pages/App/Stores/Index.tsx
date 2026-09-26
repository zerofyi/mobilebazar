import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Building2,
    Plus,
    Search,
    Store as StoreIcon,
    ShieldCheck,
    MoreVertical,
    Eye,
    Edit,
    Trash2,
    RotateCcw,
    Phone,
    Mail,
    Archive
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import stores from '@/routes/app/stores';
import { dashboard } from '@/routes';

interface StoreItem {
    id: number;
    uuid: string;
    name: string;
    code: string;
    type: 'own' | 'franchise';
    phone: string | null;
    email: string | null;
    gstin: string | null;
    is_active: boolean;
    is_public: boolean;
    deleted_at: string | null;
    store_users_count: number;
    owner?: {
        id: number;
        name: string;
        email: string;
        mobile: string;
    };
    address?: {
        village_or_area: string;
        district: string;
        state: string;
        postal_code: string;
    };
    logo_asset?: {
        url: string;
    };
    image_asset?: {
        url: string;
    };
}

interface IndexProps {
    stores: {
        data: StoreItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        active: number;
        own: number;
        franchise: number;
        trashed: number;
    };
    filters: {
        search?: string;
        type?: string;
        status?: string;
        trashed?: string;
    };
}

export default function Index({ stores: storeList, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canCreate = permissions.includes('stores.create');
    const canView = permissions.includes('stores.view');
    const canUpdate = permissions.includes('stores.update');
    const canDelete = permissions.includes('stores.delete');

    const [actionTarget, setActionTarget] = useState<{ uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                stores.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            stores.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(stores.destroy.url({ store: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(stores.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(stores.restore.url({ uuid }));
    };

    return (
        <>
            <Head title="Store Management" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <StoreIcon className="size-6 text-primary" />
                            Stores & Outlets
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage owned outlets, franchise locations, and administrative store assignments.
                        </p>
                    </div>

                    {canCreate && (
                        <Button asChild size="sm" className="w-full sm:w-auto">
                            <Link href={stores.create.url()}>
                                <Plus className="mr-2 size-4" />
                                Add New Store
                            </Link>
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid using specialized StatCard */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard
                        title="Total Active Locations"
                        value={stats.total}
                        icon={Building2}
                    />
                    <StatCard
                        title="Operational Storefronts"
                        value={stats.active}
                        icon={ShieldCheck}
                    />
                    <StatCard
                        title="Company Owned"
                        value={stats.own}
                        icon={StoreIcon}
                    />
                    <StatCard
                        title="Franchise Outlets"
                        value={stats.franchise}
                        icon={Building2}
                    />
                </div>

                {/* Filter & Trashed Controls */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search store name, code, or GSTIN..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.type && !filters.trashed ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                handleFilterChange('type', null);
                                handleFilterChange('trashed', null);
                            }}
                            className="h-8 text-xs"
                        >
                            All Stores
                        </Button>
                        <Button
                            variant={filters.type === 'own' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('type', 'own')}
                            className="h-8 text-xs"
                        >
                            Owned
                        </Button>
                        <Button
                            variant={filters.type === 'franchise' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('type', 'franchise')}
                            className="h-8 text-xs"
                        >
                            Franchise
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
                                    <TableHead className="w-70">Store Identity</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Owner & Contact</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Staff</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {storeList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                                            No stores found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    storeList.data.map((item) => (
                                        <TableRow key={item.uuid} className={item.deleted_at ? 'bg-destructive/5' : ''}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-10 items-center justify-center rounded-lg border border-border bg-muted/40 overflow-hidden shrink-0">
                                                        {item.logo_asset?.url ? (
                                                            <img src={item.logo_asset.url} alt={item.name} className="size-full object-cover" />
                                                        ) : (
                                                            <StoreIcon className="size-5 text-muted-foreground" />
                                                        )}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                            {canView && !item.deleted_at ? (
                                                                <Link href={stores.show.url({ store: item.uuid })} className="hover:underline">
                                                                    {item.name}
                                                                </Link>
                                                            ) : (
                                                                <span>{item.name}</span>
                                                            )}
                                                            {item.deleted_at && (
                                                                <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                                                    Deleted
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <div className="text-[11px] font-mono text-muted-foreground">
                                                            CODE: {item.code} {item.gstin ? `• GST: ${item.gstin}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <Badge variant={item.type === 'own' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                                                    {item.type === 'own' ? 'Company Owned' : 'Franchise'}
                                                </Badge>
                                            </TableCell>

                                            <TableCell>
                                                <div className="space-y-0.5">
                                                    {item.owner ? (
                                                        <>
                                                            <div className="text-xs font-medium text-foreground">{item.owner.name}</div>
                                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                                <span className="flex items-center gap-0.5"><Phone className="size-3" /> {item.owner.mobile}</span>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <span className="text-xs text-muted-foreground">Unassigned</span>
                                                    )}
                                                    {/* {item.phone && item.phone !== item.owner?.mobile && (
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 pt-0.5">
                                                            <Phone className="size-2.5 text-primary" /> Store: {item.phone}
                                                        </div>
                                                    )} */}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                {item.address ? (
                                                    <div className="text-xs text-foreground">
                                                        <div>{item.address.village_or_area}</div>
                                                        <div className="text-[11px] text-muted-foreground">
                                                            {item.address.district}, {item.address.state} - {item.address.postal_code}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="text-xs text-foreground font-medium">
                                                    {item.store_users_count} Users
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
                                                                {canView && (
                                                                    <DropdownMenuItem asChild>
                                                                        <Link href={stores.show.url({ store: item.uuid })}>
                                                                            <Eye className="mr-2 size-4 text-muted-foreground" /> View Details
                                                                        </Link>
                                                                    </DropdownMenuItem>
                                                                )}
                                                                {canUpdate && (
                                                                    <DropdownMenuItem asChild>
                                                                        <Link href={stores.edit.url({ store: item.uuid })}>
                                                                            <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Store
                                                                        </Link>
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
                                                            <>
                                                                {canDelete && (
                                                                    <>
                                                                        <DropdownMenuItem onClick={() => handleRestore(item.uuid)}>
                                                                            <RotateCcw className="mr-2 size-4 text-emerald-600" /> Restore Store
                                                                        </DropdownMenuItem>
                                                                        <DropdownMenuSeparator />
                                                                        <DropdownMenuItem
                                                                            onClick={() => setActionTarget({ uuid: item.uuid, name: item.name, action: 'forceDelete' })}
                                                                            className="text-destructive focus:text-destructive"
                                                                        >
                                                                            <Trash2 className="mr-2 size-4" /> Delete Permanently
                                                                        </DropdownMenuItem>
                                                                    </>
                                                                )}
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

            {/* Action Confirmation Modal */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {actionTarget?.action === 'forceDelete' ? 'Permanently Purge Store?' : 'Move Store to Trash?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {actionTarget?.action === 'forceDelete'
                                ? `This operation cannot be undone. This will permanently remove "${actionTarget?.name}" and delete all linked branding media from server storage.`
                                : `Are you sure you want to soft-delete "${actionTarget?.name}"? You can restore it anytime from the Trashed view.`}
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
        { title: 'Stores', href: stores.index.url() },
    ],
};

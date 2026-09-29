import { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Truck,
    Plus,
    Search,
    CheckCircle2,
    MoreVertical,
    Edit,
    Trash2,
    RotateCcw,
    Archive,
    MapPin,
    Building2,
    Phone,
    IndianRupee,
    Store
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

import SupplierFormModal, { SupplierItem } from './Partials/SupplierFormModal';
import suppliers from '@/routes/app/suppliers';
import { dashboard } from '@/routes';
import { FormatAmount } from '@/components/special/format-amount';

interface IndexProps {
    suppliers: {
        data: SupplierItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        active: number;
        total_payables: number;
        trashed: number;
    };
    stores?: Array<{ id: number; name: string }>;
    filters: {
        search?: string;
        is_active?: string;
        trashed?: string;
    };
}

export default function Index({ suppliers: supplierList, stats, stores = [], filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canCreate = permissions.includes('suppliers.create');
    const canUpdate = permissions.includes('suppliers.update');
    const canDelete = permissions.includes('suppliers.delete');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ id: number; uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const openCreateModal = () => {
        setEditingSupplier(null);
        setModalOpen(true);
    };

    const openEditModal = (supplier: SupplierItem) => {
        setEditingSupplier(supplier);
        setModalOpen(true);
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                suppliers.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            suppliers.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(suppliers.destroy.url({ supplier: actionTarget.id }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(suppliers.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(suppliers.restore.url({ uuid }));
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <>
            <Head title="Supplier Directory" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Truck className="size-6 text-primary" />
                            Supplier Directory
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage wholesale vendors, GSTIN registrations, ledger accounts, and addresses.
                        </p>
                    </div>

                    {canCreate && (
                        <Button onClick={openCreateModal} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 size-4" />
                            Register Supplier
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Vendors" value={stats.total} icon={Truck} />
                    <StatCard title="Active Vendors" value={stats.active} icon={CheckCircle2} />
                    <StatCard
                        title="Outstanding Payable"
                        value={<FormatAmount amount={stats.total_payables} />}
                        icon={IndianRupee}
                    />
                    <StatCard title="Trashed Records" value={stats.trashed} icon={Archive} />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name, phone, company, or GSTIN..."
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
                                    <TableHead className="w-[260px]">Supplier & Company</TableHead>
                                    <TableHead>Contact Info</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Current Ledger</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {supplierList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                                            No suppliers found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    supplierList.data.map((item) => (
                                        <TableRow key={item.uuid}>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                        <span>{item.name}</span>
                                                    </div>
                                                    {item.company_name && (
                                                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                            <Building2 className="size-3" /> {item.company_name}
                                                        </p>
                                                    )}
                                                    {/* {item.store && (
                                                        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Store className="size-3 text-primary" /> {item.store.name}
                                                        </p>
                                                    )} */}
                                                    {item.gstin && (
                                                        <Badge variant="outline" className="font-mono text-[9px] uppercase px-1 py-0 bg-muted/30">
                                                            GSTIN: {item.gstin}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="space-y-1 text-xs">
                                                    <p className="font-mono text-muted-foreground flex items-center gap-1">
                                                        <Phone className="size-3 text-muted-foreground" /> {item.phone}
                                                    </p>
                                                    {item.email && (
                                                        <p className="text-[11px] text-muted-foreground">{item.email}</p>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                {item.address ? (
                                                    <div className="text-xs text-muted-foreground flex items-start gap-1 max-w-[200px] truncate">
                                                        <MapPin className="size-3 shrink-0 mt-0.5" />
                                                        <span className="truncate">
                                                            {[item.address.village_or_area, item.address.district, item.address.state]
                                                                .filter(Boolean)
                                                                .join(', ')}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">No address record</span>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <span className="font-mono text-xs font-semibold text-foreground">
                                                    {formatCurrency(item.current_balance)}
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
                                                        {canUpdate && (
                                                            <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                                <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Profile
                                                            </DropdownMenuItem>
                                                        )}
                                                        {canDelete && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => setActionTarget({ id: item.id, uuid: item.uuid, name: item.name, action: 'delete' })}
                                                                    className="text-destructive focus:text-destructive"
                                                                >
                                                                    <Trash2 className="mr-2 size-4" /> Move to Trash
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

            {/* Localized Modal Partial */}
            <SupplierFormModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                supplier={editingSupplier}
                stores={stores}
            />

            {/* Trash Confirmation Dialog */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move Supplier to Trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to soft-delete "{actionTarget?.name}"? You can restore this record anytime.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={executeAction}
                            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                            Confirm Trash
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
        { title: 'Suppliers', href: suppliers.index.url() },
    ],
};

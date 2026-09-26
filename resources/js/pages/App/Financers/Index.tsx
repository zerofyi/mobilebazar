import { useState } from 'react';
import { Head, router, usePage } from '@inertiajs/react';
import {
    Landmark,
    Plus,
    Search,
    CheckCircle2,
    MoreVertical,
    Edit,
    Trash2,
    RotateCcw,
    Archive,
    MapPin,
    Phone,
    IndianRupee,
    Store,
    FileSignature
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

import FinancerFormModal, { FinancerItem } from './Partials/FinancerFormModal';
import financers from '@/routes/app/financers';
import { dashboard } from '@/routes';
import { FormatAmount } from '@/components/special/format-amount';

interface IndexProps {
    financers: {
        data: FinancerItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        active: number;
        total_limit: number;
        total_balance: number;
        trashed: number;
    };
    stores?: Array<{ id: number; name: string }>;
    filters: {
        search?: string;
        type?: string;
        is_active?: string;
        trashed?: string;
    };
}

export default function Index({ financers: financerList, stats, stores = [], filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canCreate = permissions.includes('financers.create');
    const canUpdate = permissions.includes('financers.update');
    const canDelete = permissions.includes('financers.delete');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingFinancer, setEditingFinancer] = useState<FinancerItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ id: number; uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const openCreateModal = () => {
        setEditingFinancer(null);
        setModalOpen(true);
    };

    const openEditModal = (financer: FinancerItem) => {
        setEditingFinancer(financer);
        setModalOpen(true);
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                financers.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            financers.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(financers.destroy.url({ financer: actionTarget.id }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(financers.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    const handleRestore = (uuid: string) => {
        router.post(financers.restore.url({ uuid }));
    };

    const formatCurrency = (amount: number | null) => {
        if (amount === null || amount === undefined) return 'Unlimited';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <>
            <Head title="Financer Directory" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Landmark className="size-6 text-primary" />
                            Financer Directory
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Manage loan financing partners, Bajaj/TVS credit limits, dynamic balances, and signatures.
                        </p>
                    </div>

                    {canCreate && (
                        <Button onClick={openCreateModal} size="sm" className="w-full sm:w-auto">
                            <Plus className="mr-2 size-4" />
                            Register Financer
                        </Button>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Financers" value={stats.total} icon={Landmark} />
                    <StatCard title="Active Partners" value={stats.active} icon={CheckCircle2} />
                    <StatCard
                        title="Allocated Credit Limit"
                        value={<FormatAmount amount={stats.total_limit} />}
                        icon={IndianRupee}
                    />
                    <StatCard
                        title="Outstanding EMI Balance"
                        value={<FormatAmount amount={stats.total_balance} />}
                        icon={IndianRupee}
                    />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search financer name or mobile..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.type && !filters.is_active && !filters.trashed ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                handleFilterChange('type', null);
                                handleFilterChange('is_active', null);
                                handleFilterChange('trashed', null);
                            }}
                            className="h-8 text-xs"
                        >
                            All
                        </Button>
                        <Button
                            variant={filters.type === 'institution' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('type', 'institution')}
                            className="h-8 text-xs"
                        >
                            Institutions
                        </Button>
                        <Button
                            variant={filters.type === 'individual' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('type', 'individual')}
                            className="h-8 text-xs"
                        >
                            Individuals
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
                                    <TableHead className="w-[240px]">Financer Entity</TableHead>
                                    <TableHead>Contact Phone</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead>Limit & Balance</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {financerList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="h-32 text-center text-xs text-muted-foreground">
                                            No financers found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    financerList.data.map((item) => (
                                        <TableRow key={item.uuid}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-muted/40 overflow-hidden shrink-0">
                                                        {item.signature_url ? (
                                                            <img
                                                                src={item.signature_url}
                                                                alt={item.name}
                                                                className="size-full object-contain p-1"
                                                            />
                                                        ) : (
                                                            <FileSignature className="size-4 text-muted-foreground/40" />
                                                        )}
                                                    </div>
                                                    <div className="space-y-0.5">
                                                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                            <span>{item.name}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <Badge variant="outline" className="text-[9px] capitalize px-1 py-0 bg-muted/30">
                                                                {item.type}
                                                            </Badge>
                                                            {item.store && (
                                                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                    <Store className="size-2.5 text-primary" /> {item.store.name}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <p className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                                                    <Phone className="size-3 text-muted-foreground" /> {item.mobile}
                                                </p>
                                            </TableCell>

                                            <TableCell>
                                                {item.address ? (
                                                    <div className="text-xs text-muted-foreground flex items-start gap-1 max-w-[180px] truncate">
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
                                                <div className="space-y-0.5 font-mono text-xs">
                                                    <p className="font-semibold text-foreground">
                                                        Bal: {formatCurrency(item.balance)}
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground">
                                                        Limit: {formatCurrency(item.limit)}
                                                    </p>
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
                                                        {canUpdate && (
                                                            <DropdownMenuItem onClick={() => openEditModal(item)}>
                                                                <Edit className="mr-2 size-4 text-muted-foreground" /> Edit Partner
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

            {/* Localized Form Modal */}
            <FinancerFormModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                financer={editingFinancer}
                stores={stores}
            />

            {/* Trash Confirmation Modal */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move Financer to Trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to soft-delete "{actionTarget?.name}"? You can restore this partner record anytime.
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
        { title: 'Financers', href: financers.index.url() },
    ],
};

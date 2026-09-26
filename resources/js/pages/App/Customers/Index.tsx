import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Users,
    Plus,
    Search,
    Zap,
    MoreVertical,
    Edit,
    Trash2,
    Archive,
    MapPin,
    Phone,
    IndianRupee,
    ShieldCheck,
    ShieldAlert,
    Globe,
    Award,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/special/stat-card';
import { FormatAmount } from '@/components/special/format-amount';
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

import CustomerFormModal, { CustomerItem } from './Partials/CustomerFormModal';
import customers from '@/routes/app/customers';
import { dashboard } from '@/routes';

interface IndexProps {
    customers: {
        data: CustomerItem[];
        links: Array<{ url: string | null; label: string; active: boolean }>;
        current_page: number;
        last_page: number;
        total: number;
    };
    stats: {
        total: number;
        active: number;
        verified: number;
        total_loyalty: number;
        total_spent: number;
        trashed: number;
    };
    filters: {
        search?: string;
        status?: string;
        is_verified?: string;
        trashed?: string;
    };
}

export default function Index({ customers: customerList, stats, filters }: IndexProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canCreate = permissions.includes('customers.create');
    const canUpdate = permissions.includes('customers.update');
    const canDelete = permissions.includes('customers.delete');

    const [modalOpen, setModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
    const [actionTarget, setActionTarget] = useState<{ id: number; uuid: string; name: string; action: 'delete' | 'forceDelete' } | null>(null);

    const openQuickAddModal = () => {
        setEditingCustomer(null);
        setModalOpen(true);
    };

    const openQuickEditModal = (customer: CustomerItem) => {
        setEditingCustomer(customer);
        setModalOpen(true);
    };

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            const value = (e.target as HTMLInputElement).value;
            router.get(
                customers.index.url(),
                { ...filters, search: value },
                { preserveState: true, replace: true }
            );
        }
    };

    const handleFilterChange = (key: string, value: string | null) => {
        router.get(
            customers.index.url(),
            { ...filters, [key]: value || undefined },
            { preserveState: true, replace: true }
        );
    };

    const executeAction = () => {
        if (!actionTarget) return;

        if (actionTarget.action === 'delete') {
            router.delete(customers.destroy.url({ customer: actionTarget.id }), {
                onFinish: () => setActionTarget(null),
            });
        } else if (actionTarget.action === 'forceDelete') {
            router.delete(customers.delete.url({ uuid: actionTarget.uuid }), {
                onFinish: () => setActionTarget(null),
            });
        }
    };

    return (
        <>
            <Head title="Customer Directory" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Users className="size-6 text-primary" />
                            Customer Directory
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            Chain-wide retail profiles, cross-channel user accounts, KYC verification, and loyalty ledgers.
                        </p>
                    </div>

                    {canCreate && (
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={openQuickAddModal}
                                className="w-full sm:w-auto border-amber-500/40 hover:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            >
                                <Zap className="mr-1.5 size-3.5 fill-amber-500 text-amber-500" />
                                Quick Add
                            </Button>
                            <Button asChild size="sm" className="w-full sm:w-auto">
                                <Link href={customers.create.url()}>
                                    <Plus className="mr-1.5 size-4" />
                                    Register Customer
                                </Link>
                            </Button>
                        </div>
                    )}
                </div>

                {/* Metrics Stats Grid */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatCard title="Total Customers" value={stats.total} icon={Users} />
                    <StatCard title="KYC Verified" value={stats.verified} icon={ShieldCheck} />
                    <StatCard
                        title="Total Chain Spending"
                        value={
                            <div className="flex items-center gap-0.5">
                                <span>₹</span>
                                <FormatAmount amount={stats.total_spent} />
                            </div>
                        }
                        icon={IndianRupee}
                    />
                    <StatCard
                        title="Loyalty Points Outstanding"
                        value={<FormatAmount amount={stats.total_loyalty} />}
                        icon={Award}
                    />
                </div>

                {/* Filter Controls Bar */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pt-2">
                    <div className="relative w-full sm:w-80">
                        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search name, phone, address, or ID numbers..."
                            defaultValue={filters.search || ''}
                            onKeyDown={handleSearch}
                            className="pl-9 h-9 text-xs"
                        />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant={!filters.status && !filters.is_verified && !filters.trashed ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => {
                                handleFilterChange('status', null);
                                handleFilterChange('is_verified', null);
                                handleFilterChange('trashed', null);
                            }}
                            className="h-8 text-xs"
                        >
                            All
                        </Button>
                        <Button
                            variant={filters.status === 'active' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('status', 'active')}
                            className="h-8 text-xs"
                        >
                            Active
                        </Button>
                        <Button
                            variant={filters.is_verified === '1' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => handleFilterChange('is_verified', '1')}
                            className="h-8 text-xs flex items-center gap-1"
                        >
                            <ShieldCheck className="size-3 text-emerald-600" /> Verified KYC
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
                                    <TableHead className="w-[240px]">Customer Name & Care Of</TableHead>
                                    <TableHead>Contact Numbers</TableHead>
                                    <TableHead>KYC Identification</TableHead>
                                    <TableHead>Location / Address</TableHead>
                                    <TableHead>Spending & Loyalty</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="w-20 text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {customerList.data.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} className="h-32 text-center text-xs text-muted-foreground">
                                            No customers found matching your search criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    customerList.data.map((item) => (
                                        <TableRow key={item.uuid}>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                                        <span>{item.name}</span>
                                                        {item.user_id && (
                                                            <Badge variant="secondary" className="text-[9px] px-1 py-0 gap-0.5 bg-primary/10 text-primary border-primary/20">
                                                                <Globe className="size-2.5" /> Online Linked
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    {item.care_of && (
                                                        <p className="text-[11px] text-muted-foreground">
                                                            C/O: {item.care_of}
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="space-y-0.5 text-xs font-mono">
                                                    <p className="text-foreground flex items-center gap-1">
                                                        <Phone className="size-3 text-muted-foreground" /> {item.phone_primary}
                                                    </p>
                                                    {item.phone_secondary && (
                                                        <p className="text-[10px] text-muted-foreground pl-4">
                                                            Alt: {item.phone_secondary}
                                                        </p>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {item.aadhaar_number && (
                                                        <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 bg-muted/20">
                                                            AADHAAR: ...{item.aadhaar_number.slice(-4)}
                                                        </Badge>
                                                    )}
                                                    {item.pan_number && (
                                                        <Badge variant="outline" className="font-mono text-[9px] uppercase px-1 py-0 bg-muted/20">
                                                            PAN: {item.pan_number}
                                                        </Badge>
                                                    )}
                                                    {!item.aadhaar_number && !item.pan_number && !item.voter_number && (
                                                        <span className="text-xs text-muted-foreground italic">Pending KYC</span>
                                                    )}
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                {item.display_address || item.address_snapshot ? (
                                                    <div className="text-xs text-muted-foreground flex items-start gap-1 max-w-[220px] truncate" title={item.display_address || item.address_snapshot || ''}>
                                                        <MapPin className="size-3 shrink-0 mt-0.5 text-primary" />
                                                        <span className="truncate">
                                                            {item.display_address || item.address_snapshot}
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground italic">No address</span>
                                                )}
                                            </TableCell>

                                            <TableCell>
                                                <div className="space-y-0.5 font-mono text-xs">
                                                    <p className="font-semibold text-foreground">
                                                        Spent: ₹<FormatAmount amount={item.total_spent} />
                                                    </p>
                                                    <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                                        <Award className="size-2.5 text-amber-500" />
                                                        Points: <FormatAmount amount={item.loyalty_points} />
                                                    </p>
                                                </div>
                                            </TableCell>

                                            <TableCell>
                                                <div className="flex items-center gap-1.5">
                                                    <Badge
                                                        variant="outline"
                                                        className={
                                                            item.status === 'active'
                                                                ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10'
                                                                : 'text-muted-foreground'
                                                        }
                                                    >
                                                        {item.status}
                                                    </Badge>
                                                    {item.is_verified ? (
                                                        <ShieldCheck className="size-4 text-emerald-600 shrink-0" aria-label="KYC Verified" />
                                                    ) : (
                                                        <ShieldAlert className="size-4 text-amber-500/70 shrink-0" aria-label="KYC Unverified" />
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
                                                    <DropdownMenuContent align="end" className="w-48">
                                                        {canUpdate && (
                                                            <>
                                                                <DropdownMenuItem onClick={() => openQuickEditModal(item)}>
                                                                    <Zap className="mr-2 size-4 text-amber-500 fill-amber-500" /> Quick Edit
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={customers.edit.url({ customer: item.id })}>
                                                                        <Edit className="mr-2 size-4 text-muted-foreground" /> Full Edit Profile
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            </>
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

            {/* Quick Add / Quick Edit Modal */}
            <CustomerFormModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                customer={editingCustomer}
            />

            {/* Confirmation Dialog */}
            <AlertDialog open={!!actionTarget} onOpenChange={() => setActionTarget(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move Customer to Trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to soft-delete "{actionTarget?.name}"? You can restore this profile anytime.
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
        { title: 'Customers', href: customers.index.url() },
    ],
};

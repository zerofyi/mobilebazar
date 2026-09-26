import { useState } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import {
    Store as StoreIcon,
    User,
    Mail,
    Phone,
    Building2,
    FileText,
    ShieldCheck,
    MapPin,
    Landmark,
    Edit,
    Trash2,
    ArrowLeft,
    Users,
    Calendar,
    CheckCircle2,
    XCircle
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

interface StoreUserAssignment {
    id: number;
    user_id: number;
    role: string;
    is_active: boolean;
    joined_at: string;
    user?: {
        id: number;
        name: string;
        email: string;
        mobile: string;
        role: string;
    };
}

interface StoreShowProps {
    store: {
        id: number;
        uuid: string;
        name: string;
        code: string;
        type: 'own' | 'franchise';
        phone: string | null;
        email: string | null;
        gstin: string | null;
        bank_name: string | null;
        account_holder: string | null;
        account_number: string | null;
        ifsc_code: string | null;
        upi_id: string | null;
        is_active: boolean;
        is_public: boolean;
        created_at: string;
        owner?: {
            id: number;
            name: string;
            email: string;
            mobile: string;
        };
        address?: {
            village_or_area: string;
            post_office: string;
            police_station: string;
            district: string;
            postal_code: string;
            state: string;
            country: string;
        };
        store_users?: StoreUserAssignment[];
    };
}

export default function Show({ store }: StoreShowProps) {
    const { auth } = usePage<{ auth: { user: { permissions: string[] } } }>().props;
    const permissions = auth?.user?.permissions || [];

    const canUpdate = permissions.includes('stores.update');
    const canDelete = permissions.includes('stores.delete');

    const [deleteModalOpen, setDeleteModalOpen] = useState(false);

    const handleDelete = () => {
        router.delete(stores.destroy.url({ store: store.uuid }), {
            onFinish: () => setDeleteModalOpen(false),
        });
    };

    return (
        <>
            <Head title={`Store Profile - ${store.name}`} />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                        <Button asChild variant="outline" size="icon" className="size-9 shrink-0">
                            <Link href={stores.index.url()}>
                                <ArrowLeft className="size-4" />
                            </Link>
                        </Button>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold tracking-tight text-foreground">
                                    {store.name}
                                </h2>
                                <Badge variant={store.type === 'own' ? 'default' : 'secondary'} className="capitalize text-[10px]">
                                    {store.type === 'own' ? 'Company Owned' : 'Franchise'}
                                </Badge>
                                <Badge
                                    variant="outline"
                                    className={store.is_active ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'text-muted-foreground'}
                                >
                                    {store.is_active ? 'Active' : 'Inactive'}
                                </Badge>
                            </div>
                            <p className="text-xs font-mono text-muted-foreground mt-1">
                                STORE CODE: {store.code} • Created {new Date(store.created_at).toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {canUpdate && (
                            <Button asChild size="sm">
                                <Link href={stores.edit.url({ store: store.uuid })}>
                                    <Edit className="mr-2 size-4" /> Edit Store Details
                                </Link>
                            </Button>
                        )}
                        {canDelete && (
                            <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => setDeleteModalOpen(true)}
                            >
                                <Trash2 className="mr-2 size-4" /> Move to Trash
                            </Button>
                        )}
                    </div>
                </div>

                {/* Grid Layout: Profile & Overview */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                    {/* CARD 1: PRIMARY OWNER ACCOUNT */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                <User className="size-4 text-primary" />
                                Assigned Store Owner
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            {store.owner ? (
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-xs text-muted-foreground">Full Name</p>
                                        <p className="text-sm font-semibold text-foreground">{store.owner.name}</p>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Mail className="size-3.5 text-primary" />
                                        <span>{store.owner.email}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Phone className="size-3.5 text-primary" />
                                        <span>{store.owner.mobile}</span>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">No primary owner assigned.</p>
                            )}
                        </CardContent>
                    </Card>

                    {/* CARD 2: PUBLIC CONTACT & VISIBILITY */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Building2 className="size-4 text-primary" />
                                Store Public Channels
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                            <div>
                                <p className="text-xs text-muted-foreground">Support Phone</p>
                                <p className="text-xs font-medium text-foreground">{store.phone || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Public Email</p>
                                <p className="text-xs font-medium text-foreground">{store.email || '—'}</p>
                            </div>
                            <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-muted-foreground">Marketplace Visibility</span>
                                <Badge variant="outline" className="text-[10px]">
                                    {store.is_public ? 'Publicly Listed' : 'Hidden'}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 3: PHYSICAL ADDRESS */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-base flex items-center gap-2">
                                <MapPin className="size-4 text-primary" />
                                Store Location Address
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                            {store.address ? (
                                <div className="text-xs space-y-1 text-foreground">
                                    <p className="font-semibold">{store.address.village_or_area}</p>
                                    <p className="text-muted-foreground">P.O. {store.address.post_office} • P.S. {store.address.police_station}</p>
                                    <p className="text-muted-foreground">{store.address.district}, {store.address.state} - {store.address.postal_code}</p>
                                    <p className="text-[11px] text-muted-foreground font-mono pt-1">{store.address.country}</p>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground">No physical address record on file.</p>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* CARD 4: FINANCIAL & BANKING COMPLIANCE */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="border-b border-border/50 pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Landmark className="size-4 text-primary" />
                            Financial Compliance & Settlement Details
                        </CardTitle>
                        <CardDescription>Direct bank accounts and tax identifier registration.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <p className="text-xs text-muted-foreground">GSTIN / Tax ID</p>
                                <p className="text-xs font-mono font-bold text-foreground">{store.gstin || 'NOT REGISTERED'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Bank Name</p>
                                <p className="text-xs font-medium text-foreground">{store.bank_name || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Account Holder</p>
                                <p className="text-xs font-medium text-foreground">{store.account_holder || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Account Number</p>
                                <p className="text-xs font-mono text-foreground">{store.account_number || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">IFSC Code</p>
                                <p className="text-xs font-mono uppercase text-foreground">{store.ifsc_code || '—'}</p>
                            </div>
                            <div>
                                <p className="text-xs text-muted-foreground">Store UPI ID</p>
                                <p className="text-xs font-mono text-foreground">{store.upi_id || '—'}</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CARD 5: ASSIGNED STAFF MEMBERS (store_users) */}
                <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                    <CardHeader className="border-b border-border/50 pb-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Users className="size-4 text-primary" />
                            Assigned Store Staff & Operational Roster
                        </CardTitle>
                        <CardDescription>Personnel linked through store_users pivot assignments.</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead>Staff Member</TableHead>
                                    <TableHead>Store Role</TableHead>
                                    <TableHead>System Role</TableHead>
                                    <TableHead>Contact</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!store.store_users || store.store_users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="h-24 text-center text-xs text-muted-foreground">
                                            No personnel currently assigned to this store location.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    store.store_users.map((assignment) => (
                                        <TableRow key={assignment.id}>
                                            <TableCell>
                                                <div className="font-semibold text-xs text-foreground">
                                                    {assignment.user?.name || 'Unknown Staff'}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="capitalize text-[10px]">
                                                    {assignment.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-xs capitalize text-muted-foreground">
                                                    {assignment.user?.role || '—'}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <div className="text-xs text-muted-foreground space-y-0.5">
                                                    <div>{assignment.user?.mobile}</div>
                                                    <div className="text-[11px]">{assignment.user?.email}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={assignment.is_active ? 'border-emerald-500/30 text-emerald-600 bg-emerald-500/10' : 'text-muted-foreground'}
                                                >
                                                    {assignment.is_active ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>

            {/* Move to Trash Modal */}
            <AlertDialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Move Store to Trash?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to soft-delete "{store.name}"? You can restore it anytime from the Trashed view.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
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

Show.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Stores', href: stores.index.url() },
        { title: 'Store Details', href: '#' },
    ],
};

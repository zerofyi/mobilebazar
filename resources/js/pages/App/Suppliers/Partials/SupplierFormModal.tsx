import React, { useEffect, useState } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import { Truck, Loader2, ArrowRight, ArrowLeft, Building2, MapPin, Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import suppliers from '@/routes/app/suppliers';
import { cn } from '@/lib/utils';
import { INDIAN_STATES } from '@/data/indian-states';

export interface SupplierAddress {
    line1?: string;
    village_or_area?: string;
    district?: string;
    state?: string;
    postal_code?: string;
}

export interface SupplierItem {
    id: number;
    uuid: string;
    store_id: number;
    name: string;
    company_name: string | null;
    phone: string;
    email: string | null;
    gstin: string | null;
    opening_balance: number;
    current_balance: number;
    is_active: boolean;
    address?: SupplierAddress | null;
    store?: { id: number; name: string };
}

interface StoreOption {
    id: number;
    name: string;
}

interface SupplierFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    supplier?: SupplierItem | null;
    stores?: StoreOption[] | StoreOption;
    onSuccessCallback?: (createdParty?: any) => void;
}

export default function SupplierFormModal({
    open,
    onOpenChange,
    supplier,
    stores = [],
    onSuccessCallback,
}: SupplierFormModalProps) {
    const isEditing = !!supplier;
    const [step, setStep] = useState<1 | 2>(1);
    const storesList: StoreOption[] = Array.isArray(stores) ? stores : stores ? [stores] : [];

    const { auth } = usePage<{ auth: { user: { store_id: number | null } } }>().props;
    const isTopLevelUser = auth.user.store_id === null;

    const { data, setData, post, put, processing, errors, reset, clearErrors } = useForm({
        store_id: (auth.user.store_id ? String(auth.user.store_id) : '') as string | number,
        name: '',
        company_name: '',
        phone: '',
        email: '',
        gstin: '',
        opening_balance: '0',
        is_active: true,
        address: {
            line1: '',
            village_or_area: '',
            district: '',
            state: 'West Bengal',
            postal_code: '',
        },
    });

    useEffect(() => {
        if (open) {
            clearErrors();
            setStep(1);
            if (supplier) {
                setData({
                    store_id: String(supplier.store_id),
                    name: supplier.name,
                    company_name: supplier.company_name || '',
                    phone: supplier.phone,
                    email: supplier.email || '',
                    gstin: supplier.gstin || '',
                    opening_balance: String(supplier.opening_balance || 0),
                    is_active: supplier.is_active,
                    address: {
                        line1: supplier.address?.line1 || '',
                        village_or_area: supplier.address?.village_or_area || '',
                        district: supplier.address?.district || '',
                        state: supplier.address?.state || '',
                        postal_code: supplier.address?.postal_code || '',
                    },
                });
            } else {
                reset();
            }
        }
    }, [open, supplier]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (isEditing && supplier) {
            put(suppliers.update.url({ supplier: supplier.id }), {
                onSuccess: (page) => {
                    onOpenChange(false);
                    if (onSuccessCallback) onSuccessCallback(page.props.supplier || page.props.party);
                },
            });
        } else {
            post(suppliers.store.url(), {
                onSuccess: (page) => {
                    onOpenChange(false);
                    if (onSuccessCallback) onSuccessCallback(page.props.supplier || page.props.party);
                },
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-bold text-lg">
                        <Truck className="size-5 text-primary" />
                        {isEditing ? 'Edit Supplier Profile' : 'Register New Supplier'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {step === 1
                            ? 'Step 1 of 2: Basic Contact & Trade Metadata'
                            : 'Step 2 of 2: Optional Location & Address Details'}
                    </DialogDescription>
                </DialogHeader>

                {/* Step Navigation Badges */}
                <div className="flex items-center gap-2 py-1">
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                            step === 1 ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                        )}
                    >
                        <Building2 className="size-3" /> Basic Info
                    </button>
                    <div className="h-px w-4 bg-border" />
                    <button
                        type="button"
                        onClick={() => setStep(2)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                            step === 2 ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                        )}
                    >
                        <MapPin className="size-3" /> Address (Optional)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                    {/* STEP 1: BASIC METADATA */}
                    {step === 1 && (
                        <div className="space-y-3">
                            {/* Store Selector for Top-level Admin Users */}
                            {isTopLevelUser && !isEditing && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="store_id" className="text-xs font-semibold">
                                        Target Store Location <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={data.store_id ? String(data.store_id) : ''}
                                        onValueChange={(val) => setData('store_id', val)}
                                    >
                                        <SelectTrigger id="store_id" className={cn('w-full h-9 text-xs', errors.store_id && 'border-destructive')}>
                                            <SelectValue placeholder="Select target store..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {storesList.map((st) => (
                                                <SelectItem key={st.id} value={String(st.id)}>
                                                    {st.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.store_id && <p className="text-[11px] text-destructive">{errors.store_id}</p>}
                                </div>
                            )}

                            <div className="space-y-1.5">
                                <Label htmlFor="sup_name" className="text-xs font-semibold">
                                    Supplier Name <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="sup_name"
                                    placeholder="e.g. Rahul Sharma"
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    className={cn('h-9 text-xs', errors.name && 'border-destructive')}
                                    autoFocus
                                />
                                {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="company_name" className="text-xs font-semibold">
                                        Company Name
                                    </Label>
                                    <Input
                                        id="company_name"
                                        placeholder="Apex Telecom"
                                        value={data.company_name}
                                        onChange={(e) => setData('company_name', e.target.value)}
                                        className={cn('h-9 text-xs', errors.company_name && 'border-destructive')}
                                    />
                                    {errors.company_name && <p className="text-[11px] text-destructive">{errors.company_name}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="phone" className="text-xs font-semibold">
                                        Phone Number <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="phone"
                                        placeholder="+91 9876543210"
                                        value={data.phone}
                                        onChange={(e) => setData('phone', e.target.value)}
                                        className={cn('h-9 text-xs', errors.phone && 'border-destructive')}
                                    />
                                    {errors.phone && <p className="text-[11px] text-destructive">{errors.phone}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="email" className="text-xs font-semibold">
                                        Email Address
                                    </Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="supplier@domain.com"
                                        value={data.email}
                                        onChange={(e) => setData('email', e.target.value)}
                                        className={cn('h-9 text-xs', errors.email && 'border-destructive')}
                                    />
                                    {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="gstin" className="text-xs font-semibold">
                                        GSTIN Number
                                    </Label>
                                    <Input
                                        id="gstin"
                                        placeholder="19AAAAA0000A1Z5"
                                        value={data.gstin}
                                        onChange={(e) => setData('gstin', e.target.value.toUpperCase())}
                                        className={cn('h-9 text-xs font-mono uppercase', errors.gstin && 'border-destructive')}
                                    />
                                    {errors.gstin && <p className="text-[11px] text-destructive">{errors.gstin}</p>}
                                </div>
                            </div>

                            {!isEditing && (
                                <div className="space-y-1.5">
                                    <Label htmlFor="opening_balance" className="text-xs font-semibold">
                                        Opening Ledger Balance (₹)
                                    </Label>
                                    <Input
                                        id="opening_balance"
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        value={data.opening_balance}
                                        onChange={(e) => setData('opening_balance', e.target.value)}
                                        className={cn('h-9 text-xs font-mono', errors.opening_balance && 'border-destructive')}
                                    />
                                    {errors.opening_balance && <p className="text-[11px] text-destructive">{errors.opening_balance}</p>}
                                </div>
                            )}

                            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                <div className="space-y-0.5">
                                    <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">
                                        Active Supplier
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        Enable for purchase orders and stocking.
                                    </p>
                                </div>
                                <Switch
                                    id="is_active"
                                    checked={data.is_active}
                                    onCheckedChange={(checked) => setData('is_active', checked)}
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 2: ADDRESS */}
                    {step === 2 && (
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="line1" className="text-xs font-medium text-muted-foreground">
                                    Street Address / Line 1
                                </Label>
                                <Input
                                    id="line1"
                                    placeholder="Plot 42, Industrial Area Phase 1"
                                    value={data.address.line1}
                                    onChange={(e) => setData('address', { ...data.address, line1: e.target.value })}
                                    className="h-9 text-xs"
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="village_or_area" className="text-xs font-medium text-muted-foreground">
                                        Area / Village
                                    </Label>
                                    <Input
                                        id="village_or_area"
                                        placeholder="Sector 62"
                                        value={data.address.village_or_area}
                                        onChange={(e) => setData('address', { ...data.address, village_or_area: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="district" className="text-xs font-medium text-muted-foreground">
                                        District
                                    </Label>
                                    <Input
                                        id="district"
                                        placeholder="Murshidabad"
                                        value={data.address.district}
                                        onChange={(e) => setData('address', { ...data.address, district: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">
                                        State
                                    </Label>
                                    <Select
                                        value={data.address.state || 'West Bengal'}
                                        onValueChange={(val) => setData('address', { ...data.address, state: val })}
                                    >
                                        <SelectTrigger id="state" className="w-full h-9 text-xs">
                                            <SelectValue placeholder="Select State..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {INDIAN_STATES.map((stateName) => (
                                                <SelectItem key={stateName} value={stateName}>
                                                    {stateName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="postal_code" className="text-xs font-medium text-muted-foreground">
                                        Postal Code
                                    </Label>
                                    <Input
                                        id="postal_code"
                                        placeholder="742101"
                                        value={data.address.postal_code}
                                        onChange={(e) => setData('address', { ...data.address, postal_code: e.target.value })}
                                        className="h-9 text-xs font-mono"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <DialogFooter className="pt-2 flex items-center justify-between sm:justify-between w-full">
                        {step === 1 ? (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onOpenChange(false)}
                                    disabled={processing}
                                >
                                    Cancel
                                </Button>
                                <div className="flex items-center gap-2">
                                    {!isEditing && (
                                        <Button
                                            type="submit"
                                            variant="secondary"
                                            size="sm"
                                            disabled={processing || !data.name || !data.phone || (isTopLevelUser && !data.store_id)}
                                        >
                                            Quick Save
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setStep(2)}
                                        disabled={!data.name || !data.phone || (isTopLevelUser && !data.store_id && !isEditing)}
                                    >
                                        Address <ArrowRight className="ml-1 size-3.5" />
                                    </Button>
                                </div>
                            </>
                        ) : (
                            <>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStep(1)}
                                    disabled={processing}
                                >
                                    <ArrowLeft className="mr-1 size-3.5" /> Back
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={processing || !data.name || !data.phone || (isTopLevelUser && !data.store_id && !isEditing)}
                                >
                                    {processing ? (
                                        <>
                                            <Loader2 className="mr-2 size-3.5 animate-spin" />
                                            {isEditing ? 'Updating...' : 'Saving...'}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="mr-1.5 size-3.5" />
                                            {isEditing ? 'Update Supplier' : 'Complete Setup'}
                                        </>
                                    )}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

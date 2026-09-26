import React, { useEffect, useState } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import { Landmark, Loader2, ArrowRight, ArrowLeft, Building2, MapPin, Check } from 'lucide-react';

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

import CompactImageUploader from '@/components/special/compact-image-uploader';
import { INDIAN_STATES } from '@/data/indian-states';
import financers from '@/routes/app/financers';
import { cn } from '@/lib/utils';

export interface FinancerAddress {
    line1?: string;
    village_or_area?: string;
    district?: string;
    state?: string;
    postal_code?: string;
}

export interface FinancerItem {
    id: number;
    uuid: string;
    store_id: number;
    name: string;
    mobile: string;
    type: 'individual' | 'institution' | 'company';
    signature_path: string | null;
    signature_url?: string | null;
    limit: number | null;
    balance: number;
    is_active: boolean;
    address?: FinancerAddress | null;
    store?: { id: number; name: string };
}

interface StoreOption {
    id: number;
    name: string;
}

interface FinancerFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    financer?: FinancerItem | null;
    stores?: StoreOption[];
    onSuccessCallback?: () => void;
}

export default function FinancerFormModal({
    open,
    onOpenChange,
    financer,
    stores = [],
    onSuccessCallback,
}: FinancerFormModalProps) {
    const isEditing = !!financer;
    const [step, setStep] = useState<1 | 2>(1);

    const { auth } = usePage<{ auth: { user: { store_id: number | null } } }>().props;
    const isTopLevelUser = auth.user.store_id === null;

    const { data, setData, post, processing, errors, reset, clearErrors } = useForm({
        _method: 'post',
        store_id: (auth.user.store_id ? String(auth.user.store_id) : '') as string | number,
        name: '',
        mobile: '',
        type: 'individual' as 'individual' | 'institution' | 'company',
        limit: '',
        signature: null as File | string | null,
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
            if (financer) {
                setData({
                    _method: 'put',
                    store_id: String(financer.store_id),
                    name: financer.name,
                    mobile: financer.mobile,
                    type: financer.type || 'individual',
                    limit: financer.limit ? String(financer.limit) : '',
                    signature: financer.signature_url || null,
                    is_active: financer.is_active,
                    address: {
                        line1: financer.address?.line1 || '',
                        village_or_area: financer.address?.village_or_area || '',
                        district: financer.address?.district || '',
                        state: financer.address?.state || 'West Bengal',
                        postal_code: financer.address?.postal_code || '',
                    },
                });
            } else {
                reset();
                setData('_method', 'post');
            }
        }
    }, [open, financer]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (isEditing && financer) {
            post(financers.update.url({ financer: financer.id }), {
                forceFormData: true,
                onSuccess: () => {
                    onOpenChange(false);
                    if (onSuccessCallback) onSuccessCallback();
                },
            });
        } else {
            post(financers.store.url(), {
                forceFormData: true,
                onSuccess: () => {
                    onOpenChange(false);
                    if (onSuccessCallback) onSuccessCallback();
                },
            });
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 font-bold text-lg">
                        <Landmark className="size-5 text-primary" />
                        {isEditing ? 'Edit Financer Partner' : 'Register New Financer'}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {step === 1
                            ? 'Step 1 of 2: Financer Identification & Credit Limit'
                            : 'Step 2 of 2: Optional Address Details'}
                    </DialogDescription>
                </DialogHeader>

                {/* STEP BADGES */}
                <div className="flex items-center gap-2 py-1">
                    <button
                        type="button"
                        onClick={() => setStep(1)}
                        className={cn(
                            "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors border",
                            step === 1 ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border"
                        )}
                    >
                        <Building2 className="size-3" /> Basic Details
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
                    {/* STEP 1: BASIC & CREDIT SETUP */}
                    {step === 1 && (
                        <div className="space-y-3">
                            {/* Store Selector for System Admins */}
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
                                            {stores.map((st) => (
                                                <SelectItem key={st.id} value={String(st.id)}>
                                                    {st.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.store_id && <p className="text-[11px] text-destructive">{errors.store_id}</p>}
                                </div>
                            )}

                            {/* Compact Image Uploader for Authorized Signature */}
                            <div className="space-y-1">
                                <CompactImageUploader
                                    label="Authorized Signature"
                                    value={data.signature}
                                    onChange={(file) => setData('signature', file)}
                                />
                                {errors.signature && <p className="text-[11px] text-destructive">{errors.signature}</p>}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="financer_name" className="text-xs font-semibold">
                                        Financer / Entity Name <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="financer_name"
                                        placeholder="e.g. Bajaj Finserv, TVS Credit"
                                        value={data.name}
                                        onChange={(e) => setData('name', e.target.value)}
                                        className={cn('h-9 text-xs', errors.name && 'border-destructive')}
                                        autoFocus
                                    />
                                    {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="mobile" className="text-xs font-semibold">
                                        Mobile Number <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="mobile"
                                        placeholder="+91 9876543210"
                                        value={data.mobile}
                                        onChange={(e) => setData('mobile', e.target.value)}
                                        className={cn('h-9 text-xs font-mono', errors.mobile && 'border-destructive')}
                                    />
                                    {errors.mobile && <p className="text-[11px] text-destructive">{errors.mobile}</p>}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="type" className="text-xs font-semibold">
                                        Entity Classification <span className="text-destructive">*</span>
                                    </Label>
                                    <Select
                                        value={data.type}
                                        onValueChange={(val: 'individual' | 'institution' | 'company') => setData('type', val)}
                                    >
                                        <SelectTrigger id="type" className="w-full h-9 text-xs">
                                            <SelectValue placeholder="Classification..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="individual">Individual Partner</SelectItem>
                                            <SelectItem value="institution">Financial Institution</SelectItem>
                                            <SelectItem value="company">Company / Private Agency</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.type && <p className="text-[11px] text-destructive">{errors.type}</p>}
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="limit" className="text-xs font-semibold">
                                        Allocated Credit Limit (₹)
                                    </Label>
                                    <Input
                                        id="limit"
                                        type="number"
                                        step="0.01"
                                        placeholder="No limit"
                                        value={data.limit}
                                        onChange={(e) => setData('limit', e.target.value)}
                                        className={cn('h-9 text-xs font-mono', errors.limit && 'border-destructive')}
                                    />
                                    {errors.limit && <p className="text-[11px] text-destructive">{errors.limit}</p>}
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                                <div className="space-y-0.5">
                                    <Label htmlFor="is_active" className="text-xs font-medium cursor-pointer">
                                        Active Partner Status
                                    </Label>
                                    <p className="text-[10px] text-muted-foreground">
                                        Allow selecting this financer during checkout / EMI applications.
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
                                    placeholder="Branch Office / Street"
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
                                        placeholder="City Center"
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
                                            disabled={processing || !data.name || !data.mobile || (isTopLevelUser && !data.store_id)}
                                        >
                                            Quick Save
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setStep(2)}
                                        disabled={!data.name || !data.mobile || (isTopLevelUser && !data.store_id && !isEditing)}
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
                                    disabled={processing || !data.name || !data.mobile || (isTopLevelUser && !data.store_id && !isEditing)}
                                >
                                    {processing ? (
                                        <>
                                            <Loader2 className="mr-2 size-3.5 animate-spin" />
                                            {isEditing ? 'Updating...' : 'Saving...'}
                                        </>
                                    ) : (
                                        <>
                                            <Check className="mr-1.5 size-3.5" />
                                            {isEditing ? 'Update Financer' : 'Complete Setup'}
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

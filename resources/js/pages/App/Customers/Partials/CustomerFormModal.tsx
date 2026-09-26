import React, { useEffect, useState } from 'react';
import { useForm, usePage } from '@inertiajs/react';
import { User, Loader2, Phone, MapPin, Check, Zap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

import IdentityConflictDialog, { IdentityConflictData } from './IdentityConflictDialog';
import customers from '@/routes/app/customers';
import { cn } from '@/lib/utils';

export interface CustomerAddress {
    line1?: string;
    line2?: string;
    village_or_area?: string;
    post_office?: string;
    police_station?: string;
    city?: string;
    district?: string;
    state?: string;
    postal_code?: string;
}

export interface CustomerItem {
    id: number;
    uuid: string;
    user_id: number | null;
    status: 'active' | 'suspended' | 'inactive';
    name: string;
    care_of: string | null;
    phone_primary: string;
    phone_secondary: string | null;
    aadhaar_number: string | null;
    pan_number: string | null;
    voter_number: string | null;
    credit_limit: number;
    loyalty_points: number;
    total_spent: number;
    is_verified: boolean;
    address_snapshot?: string | null;
    display_address?: string;
    address?: CustomerAddress | null;
    assets_map?: Record<string, string>;
}

export interface CustomerFormModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customer?: Partial<CustomerItem> | null;
    onSuccessCallback?: (createdParty?: any) => void;
}

export default function CustomerFormModal({
    open,
    onOpenChange,
    customer,
    onSuccessCallback,
}: CustomerFormModalProps) {
    const isEditing = !!customer?.id;

    // Retrieve Inertia page level errors safely
    const { errors: pageErrors } = usePage<{ errors: Record<string, string> }>().props;
    const [conflictData, setConflictData] = useState<IdentityConflictData | null>(null);

    const { data, setData, post, processing, errors, reset, clearErrors, transform } = useForm({
        _method: 'post',
        name: '',
        phone_primary: '',
        address_snapshot: '',
        preferred_name: '',
        status: 'active',
        is_verified: false,
    });

    // Sync form state on dialog visibility toggle or customer prop updates
    useEffect(() => {
        if (open) {
            clearErrors();
            setConflictData(null);

            if (customer?.id) {
                setData({
                    _method: 'put',
                    name: customer.name || '',
                    phone_primary: customer.phone_primary || '',
                    address_snapshot: customer.address_snapshot || customer.display_address || '',
                    preferred_name: '',
                    status: customer.status || 'active',
                    is_verified: customer.is_verified || false,
                });
            } else {
                reset();
                setData({
                    _method: 'post',
                    name: '',
                    phone_primary: '',
                    address_snapshot: '',
                    preferred_name: '',
                    status: 'active',
                    is_verified: false,
                });
            }
        }
    }, [open, customer]);

    // Parse identity conflict errors sent via backend sessions or validation errors
    useEffect(() => {
        if (pageErrors?.identity_conflict) {
            try {
                const parsed = typeof pageErrors.identity_conflict === 'string'
                    ? JSON.parse(pageErrors.identity_conflict)
                    : pageErrors.identity_conflict;
                setConflictData(parsed as IdentityConflictData);
            } catch (e) {
                console.error('Failed to parse identity conflict payload:', e);
            }
        }
    }, [pageErrors]);

    const handleSubmit = (e?: React.FormEvent, resolvedName?: string) => {
        if (e) e.preventDefault();

        const endpoint = isEditing && customer?.id
            ? customers.update.url({ customer: customer.id })
            : customers.store.url();

        transform((formValues) => ({
            ...formValues,
            quick_mode: true,
            preferred_name: resolvedName || formValues.preferred_name,
        }));

        post(endpoint, {
            preserveScroll: true,
            preserveState: true,
            onSuccess: (page) => {
                setConflictData(null);
                onOpenChange(false);

                if (onSuccessCallback) {
                    const partyResult =
                        page.props.customer ||
                        page.props.party ||
                        (page.props as any).data?.party ||
                        (page.props as any).data;
                    onSuccessCallback(partyResult);
                }
            },
        });
    };

    const handleResolveConflict = (preferredName: string) => {
        setData('preferred_name', preferredName);
        handleSubmit(undefined, preferredName);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold">
                            <Zap className="size-4 fill-amber-500 text-amber-500" />
                            {isEditing ? 'Quick Edit Customer' : 'Quick Register Customer'}
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Rapidly capture customer details for POS counter sales or fast checkout.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={(e) => handleSubmit(e)} className="space-y-3.5 pt-1">
                        {/* Full Name */}
                        <div className="space-y-1.5">
                            <Label htmlFor="quick_name" className="text-xs font-semibold">
                                Full Name <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <User className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                                <Input
                                    id="quick_name"
                                    placeholder="e.g. Rahul Sharma"
                                    value={data.name}
                                    onChange={(e) => setData('name', e.target.value)}
                                    className={cn('h-9 pl-9 text-xs', errors.name && 'border-destructive')}
                                    autoFocus
                                />
                            </div>
                            {errors.name && (
                                <p className="text-[11px] font-medium text-destructive">{errors.name}</p>
                            )}
                        </div>

                        {/* Primary Phone */}
                        <div className="space-y-1.5">
                            <Label htmlFor="quick_phone" className="text-xs font-semibold">
                                Primary Phone <span className="text-destructive">*</span>
                            </Label>
                            <div className="relative">
                                <Phone className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                                <Input
                                    id="quick_phone"
                                    type="tel"
                                    placeholder="10-digit Mobile Number"
                                    value={data.phone_primary}
                                    onChange={(e) => setData('phone_primary', e.target.value)}
                                    className={cn(
                                        'h-9 pl-9 font-mono text-xs',
                                        errors.phone_primary && 'border-destructive'
                                    )}
                                />
                            </div>
                            {errors.phone_primary && (
                                <p className="text-[11px] font-medium text-destructive">
                                    {errors.phone_primary}
                                </p>
                            )}
                        </div>

                        {/* Address Snapshot */}
                        <div className="space-y-1.5">
                            <Label htmlFor="quick_address" className="text-xs font-semibold">
                                Quick Address Snapshot
                            </Label>
                            <div className="relative">
                                <MapPin className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
                                <Textarea
                                    id="quick_address"
                                    rows={2}
                                    placeholder="Village, Post Office, District, PIN code..."
                                    value={data.address_snapshot}
                                    onChange={(e) => setData('address_snapshot', e.target.value)}
                                    className="min-h-15 resize-none pl-9 text-xs"
                                />
                            </div>
                            {errors.address_snapshot && (
                                <p className="text-[11px] font-medium text-destructive">
                                    {errors.address_snapshot}
                                </p>
                            )}
                        </div>

                        {/* Dialog Actions */}
                        <DialogFooter className="flex items-center justify-end gap-2 pt-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => onOpenChange(false)}
                                disabled={processing}
                            >
                                Cancel
                            </Button>

                            <Button
                                type="submit"
                                size="sm"
                                disabled={processing || !data.name.trim() || !data.phone_primary.trim()}
                            >
                                {processing ? (
                                    <>
                                        <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                        <span>Saving...</span>
                                    </>
                                ) : (
                                    <>
                                        <Check className="mr-1.5 size-3.5" />
                                        <span>{isEditing ? 'Update Customer' : 'Save Customer'}</span>
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Identity Resolution Conflict Dialog */}
            <IdentityConflictDialog
                open={!!conflictData}
                conflictData={conflictData}
                onResolve={handleResolveConflict}
                onCancel={() => setConflictData(null)}
            />
        </>
    );
}

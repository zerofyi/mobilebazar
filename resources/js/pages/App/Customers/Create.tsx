import React, { useState, useEffect } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import {
    User,
    Phone,
    MapPin,
    Building,
    Map,
    CreditCard,
    ShieldCheck,
} from 'lucide-react';

import customers from '@/routes/app/customers';
import SingleImageUploader from '@/components/special/single-image-uploader';
import CompactImageUploader from '@/components/special/compact-image-uploader';
import IdentityConflictDialog, {
    IdentityConflictData,
} from './Partials/IdentityConflictDialog';
import { INDIAN_STATES } from '@/data/indian-states';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { dashboard } from '@/routes';

export default function Create() {
    // Destructure page errors with an alias to avoid naming conflict with useForm's errors
    const { errors: pageErrors } = usePage<{ errors: Record<string, string> }>().props;
    const [conflictData, setConflictData] = useState<IdentityConflictData | null>(null);

    const { data, setData, post, processing, errors, transform } = useForm({
        name: '',
        care_of: '',
        phone_primary: '',
        phone_secondary: '',
        aadhaar_number: '',
        pan_number: '',
        voter_number: '',
        credit_limit: '0.00',
        status: 'active' as 'active' | 'suspended' | 'inactive',
        is_verified: false,
        preferred_name: '',

        // Media File Inputs
        photo_file: null as File | null,
        aadhaar_front_file: null as File | null,
        aadhaar_back_file: null as File | null,
        voter_front_file: null as File | null,
        voter_back_file: null as File | null,
        pan_file: null as File | null,

        // Address
        address: {
            line1: '',
            line2: '',
            village_or_area: '',
            post_office: '',
            police_station: '',
            city: '',
            district: '',
            state: 'West Bengal',
            postal_code: '',
        },
    });

    // Parse JSON stringified identity_conflict error string safely
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

    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'BUTTON' ||
                target.getAttribute('type') === 'submit'
            ) {
                return;
            }
            e.preventDefault();

            const form = e.currentTarget;
            const focusableElements = Array.from(
                form.querySelectorAll<HTMLElement>(
                    'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]):not([tabindex="-1"])'
                )
            ).filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);

            const currentIndex = focusableElements.indexOf(target);
            if (currentIndex > -1 && currentIndex < focusableElements.length - 1) {
                focusableElements[currentIndex + 1].focus();
            }
        }
    };

    const handleSubmit = (e?: React.FormEvent, resolvedName?: string) => {
        if (e) e.preventDefault();

        transform((formValues: typeof data) => ({
            ...formValues,
            preferred_name: resolvedName || formValues.preferred_name,
        }));

        post(customers.store.url(), {
            forceFormData: true,
            preserveState: true,
            preserveScroll: true,
            onSuccess: () => setConflictData(null),
        });
    };

    const handleResolveConflict = (preferredName: string) => {
        setData('preferred_name', preferredName);
        handleSubmit(undefined, preferredName);
    };

    return (
        <>
            <Head title="Register Retail Customer" />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                <div className="border-b border-border pb-4">
                    <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <User className="size-6 text-primary" />
                        Register New Retail Customer
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create a chain-wide customer record with government KYC documents, contact information, and store credit allocation.
                    </p>
                </div>

                <form onSubmit={(e) => handleSubmit(e)} onKeyDown={handleKeyDown} className="space-y-4">
                    {/* ── CARD 1: CUSTOMER IDENTITY & PHOTO ─────────────────────────── */}
                    <Card className="border border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="size-5 text-primary" />
                                Customer Identity & Profile Photo
                            </CardTitle>
                            <CardDescription>Primary identity details and portrait photograph.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-4">
                            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-4">
                                {/* Photo */}
                                <div className="flex h-full flex-col lg:col-span-1 space-y-2">
                                    <SingleImageUploader
                                        label="Upload Customer Photo"
                                        value={data.photo_file}
                                        onChange={(f) => setData('photo_file', f)}
                                        className="flex-1"
                                    />
                                    {errors.photo_file && <p className="text-xs text-destructive">{errors.photo_file}</p>}
                                </div>

                                {/* Identity fields */}
                                <div className="space-y-4 lg:col-span-3">
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                        <div className="space-y-2">
                                            <Label htmlFor="name">
                                                Full Name <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                id="name"
                                                placeholder="e.g. Rahul Sharma"
                                                value={data.name}
                                                onChange={(e) => setData('name', e.target.value)}
                                                className={cn(errors.name && 'border-destructive')}
                                                autoFocus
                                            />
                                            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="care_of">Care Of (S/O, W/O, C/O)</Label>
                                            <Input
                                                id="care_of"
                                                placeholder="e.g. S/O Late Anil Sharma"
                                                value={data.care_of}
                                                onChange={(e) => setData('care_of', e.target.value)}
                                                className={cn(errors.care_of && 'border-destructive')}
                                            />
                                            {errors.care_of && <p className="text-xs text-destructive">{errors.care_of}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="phone_primary">
                                                Primary Phone <span className="text-destructive">*</span>
                                            </Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                                <Input
                                                    id="phone_primary"
                                                    type="tel"
                                                    placeholder="9876543210"
                                                    value={data.phone_primary}
                                                    onChange={(e) => setData('phone_primary', e.target.value)}
                                                    className={cn('pl-9 font-mono', errors.phone_primary && 'border-destructive')}
                                                />
                                            </div>
                                            {errors.phone_primary && <p className="text-xs text-destructive">{errors.phone_primary}</p>}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3 pt-2">
                                        <div className="space-y-2">
                                            <Label htmlFor="phone_secondary">Secondary Contact Phone</Label>
                                            <div className="relative">
                                                <Phone className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                                <Input
                                                    id="phone_secondary"
                                                    type="tel"
                                                    placeholder="Alternative phone number"
                                                    value={data.phone_secondary}
                                                    onChange={(e) => setData('phone_secondary', e.target.value)}
                                                    className={cn('pl-9 font-mono', errors.phone_secondary && 'border-destructive')}
                                                />
                                            </div>
                                            {errors.phone_secondary && <p className="text-xs text-destructive">{errors.phone_secondary}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="status">Account Status</Label>
                                            <Select
                                                value={data.status}
                                                onValueChange={(val: 'active' | 'suspended' | 'inactive') => setData('status', val)}
                                            >
                                                <SelectTrigger id="status" className="w-full">
                                                    <SelectValue placeholder="Status..." />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="active">Active Customer</SelectItem>
                                                    <SelectItem value="suspended">Suspended Account</SelectItem>
                                                    <SelectItem value="inactive">Inactive Account</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            {errors.status && <p className="text-xs text-destructive">{errors.status}</p>}
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="credit_limit" className="text-xs font-semibold">
                                                Allocated Store Credit Limit (₹)
                                            </Label>
                                            <div className="relative">
                                                <span className="absolute left-3 top-2.5 text-xs font-bold text-muted-foreground">₹</span>
                                                <Input
                                                    id="credit_limit"
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    value={data.credit_limit}
                                                    onChange={(e) => setData('credit_limit', e.target.value)}
                                                    className="pl-7 h-9 text-xs font-mono"
                                                />
                                            </div>
                                            {errors.credit_limit && <p className="text-xs text-destructive">{errors.credit_limit}</p>}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 p-3">
                                        <div className="space-y-0.5 flex items-center gap-2">
                                            <ShieldCheck className="size-5 text-emerald-600 shrink-0" />
                                            <div>
                                                <Label htmlFor="is_verified" className="text-xs font-semibold cursor-pointer">
                                                    KYC Verified Mark
                                                </Label>
                                                <p className="text-[10px] text-muted-foreground">
                                                    Flag customer identity documents as physically verified.
                                                </p>
                                            </div>
                                        </div>
                                        <Switch
                                            id="is_verified"
                                            checked={data.is_verified}
                                            onCheckedChange={(checked) => setData('is_verified', checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── CARD 2: GOVERNMENT KYC DOCUMENTS ────────────────────────── */}
                    <Card className="border border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <CreditCard className="size-5 text-primary" />
                                Government KYC Documents
                            </CardTitle>
                            <CardDescription>Upload identification numbers and scanned card copies for verification.</CardDescription>
                        </CardHeader>

                        <CardContent className="pt-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {/* Aadhaar */}
                                <div className="border border-border/80 rounded-lg p-3 space-y-3 bg-muted/10">
                                    <div className="flex items-center justify-between border-b pb-1.5">
                                        <Label className="text-xs font-semibold flex items-center gap-1">
                                            <CreditCard className="size-3.5 text-primary" /> Aadhaar Card
                                        </Label>
                                    </div>
                                    <Input
                                        type="text"
                                        placeholder="12-digit Aadhaar"
                                        className="font-mono text-xs"
                                        value={data.aadhaar_number}
                                        onChange={(e) => setData('aadhaar_number', e.target.value)}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <CompactImageUploader
                                            label="Front"
                                            value={data.aadhaar_front_file}
                                            onChange={(f) => setData('aadhaar_front_file', f)}
                                        />
                                        <CompactImageUploader
                                            label="Back"
                                            value={data.aadhaar_back_file}
                                            onChange={(f) => setData('aadhaar_back_file', f)}
                                        />
                                    </div>
                                    {errors.aadhaar_number && <p className="text-xs text-destructive">{errors.aadhaar_number}</p>}
                                </div>

                                {/* PAN */}
                                <div className="border border-border/80 rounded-lg p-3 space-y-3 bg-muted/10">
                                    <div className="flex items-center justify-between border-b pb-1.5">
                                        <Label className="text-xs font-semibold flex items-center gap-1">
                                            <CreditCard className="size-3.5 text-muted-foreground" /> PAN Card
                                        </Label>
                                    </div>
                                    <Input
                                        type="text"
                                        placeholder="ABCDE1234F"
                                        className="uppercase tracking-wider font-mono text-xs"
                                        maxLength={10}
                                        value={data.pan_number}
                                        onChange={(e) => setData('pan_number', e.target.value.toUpperCase())}
                                    />
                                    <CompactImageUploader
                                        label="PAN Card Document"
                                        value={data.pan_file}
                                        onChange={(f) => setData('pan_file', f)}
                                    />
                                    {errors.pan_number && <p className="text-xs text-destructive">{errors.pan_number}</p>}
                                </div>

                                {/* Voter ID */}
                                <div className="border border-border/80 rounded-lg p-3 space-y-3 bg-muted/10">
                                    <div className="flex items-center justify-between border-b pb-1.5">
                                        <Label className="text-xs font-semibold flex items-center gap-1">
                                            <CreditCard className="size-3.5 text-muted-foreground" /> Voter ID
                                        </Label>
                                    </div>
                                    <Input
                                        placeholder="EPIC / Voter ID"
                                        className="uppercase tracking-wider font-mono text-xs"
                                        value={data.voter_number}
                                        onChange={(e) => setData('voter_number', e.target.value.toUpperCase())}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                        <CompactImageUploader
                                            label="Front"
                                            value={data.voter_front_file}
                                            onChange={(f) => setData('voter_front_file', f)}
                                        />
                                        <CompactImageUploader
                                            label="Back"
                                            value={data.voter_back_file}
                                            onChange={(f) => setData('voter_back_file', f)}
                                        />
                                    </div>
                                    {errors.voter_number && <p className="text-xs text-destructive">{errors.voter_number}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ── CARD 3: RESIDENTIAL ADDRESS ────────────────────────── */}
                    <Card className="border border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MapPin className="size-5 text-primary" />
                                Residential & Postal Address
                            </CardTitle>
                            <CardDescription>Primary address details for shipping, legal paperwork, and billing.</CardDescription>
                        </CardHeader>

                        <CardContent className="pt-4 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="line1" className="text-xs font-semibold">Address Line 1</Label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="line1"
                                            placeholder="House / Flat No / Building / Street"
                                            value={data.address.line1}
                                            onChange={(e) => setData('address', { ...data.address, line1: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="line2" className="text-xs font-semibold">Address Line 2 (Optional)</Label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="line2"
                                            placeholder="Landmark / Suite / Floor"
                                            value={data.address.line2}
                                            onChange={(e) => setData('address', { ...data.address, line2: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="village_or_area" className="text-xs font-semibold">Village / Area / Locality</Label>
                                    <div className="relative">
                                        <MapPin className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="village_or_area"
                                            placeholder="Village or locality"
                                            value={data.address.village_or_area}
                                            onChange={(e) => setData('address', { ...data.address, village_or_area: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="post_office" className="text-xs font-semibold">Post Office (P.O)</Label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="post_office"
                                            placeholder="Post office name"
                                            value={data.address.post_office}
                                            onChange={(e) => setData('address', { ...data.address, post_office: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="police_station" className="text-xs font-semibold">Police Station (P.S)</Label>
                                    <div className="relative">
                                        <Building className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="police_station"
                                            placeholder="Police station"
                                            value={data.address.police_station}
                                            onChange={(e) => setData('address', { ...data.address, police_station: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city" className="text-xs font-semibold">City / Sub-Division</Label>
                                    <Input
                                        id="city"
                                        placeholder="City name"
                                        value={data.address.city}
                                        onChange={(e) => setData('address', { ...data.address, city: e.target.value })}
                                        className="h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="district" className="text-xs font-semibold">District</Label>
                                    <div className="relative">
                                        <Map className="absolute left-3 top-2.5 size-3.5 text-muted-foreground pointer-events-none" />
                                        <Input
                                            id="district"
                                            placeholder="District"
                                            value={data.address.district}
                                            onChange={(e) => setData('address', { ...data.address, district: e.target.value })}
                                            className="pl-9 h-9 text-xs"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="state" className="text-xs font-semibold">State</Label>
                                    <Select
                                        value={data.address.state || 'West Bengal'}
                                        onValueChange={(val) => setData('address', { ...data.address, state: val })}
                                    >
                                        <SelectTrigger id="state" className="h-9 text-xs w-full">
                                            <SelectValue placeholder="Select state" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {INDIAN_STATES.map((st) => (
                                                <SelectItem key={st} value={st}>
                                                    {st}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="postal_code" className="text-xs font-semibold">Postal Code (PIN)</Label>
                                    <Input
                                        id="postal_code"
                                        placeholder="742101"
                                        value={data.address.postal_code}
                                        onChange={(e) => setData('address', { ...data.address, postal_code: e.target.value })}
                                        className="h-9 text-xs font-mono"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Submit Bar */}
                    <div className="flex items-center justify-end gap-4 pt-2 pb-6">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => window.history.back()}
                            disabled={processing}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" size="lg" disabled={processing || !data.name || !data.phone_primary}>
                            {processing ? 'Saving Registration...' : 'Complete Customer Registration'}
                        </Button>
                    </div>
                </form>

                {/* Identity Conflict Resolution Dialog */}
                <IdentityConflictDialog
                    open={!!conflictData}
                    conflictData={conflictData}
                    onResolve={handleResolveConflict}
                    onCancel={() => setConflictData(null)}
                />
            </div>
        </>
    );
}

Create.layout = {
    breadcrumbs: [
        { title: 'Dashboard', href: dashboard() },
        { title: 'Customers', href: customers.index.url() },
        { title: 'Register', href: customers.create.url() },
    ],
};

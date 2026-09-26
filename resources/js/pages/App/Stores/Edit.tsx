import React, { useEffect, useState } from 'react';
import { Head, useForm } from '@inertiajs/react';
import {
    Store as StoreIcon,
    User,
    Mail,
    Phone,
    Lock,
    Building2,
    FileText,
    ShieldCheck,
    CheckCircle2,
    Eye,
    EyeOff,
    MapPin,
    Landmark,
    RefreshCw,
    ArrowLeft
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import stores from '@/routes/app/stores';
import { INDIAN_STATES } from '@/data/indian-states';
import { Link } from '@inertiajs/react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface StoreEditProps {
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
        is_gst_registered: boolean;
        is_iws_allowed: boolean;
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
            lat: number | null;
            lng: number | null;
        };
    };
}

const generateRandomCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

export default function Edit({ store }: StoreEditProps) {
    const [showPassword, setShowPassword] = useState(false);

    const { data, setData, put, processing, errors } = useForm({
        // Store Identity
        name: store.name || '',
        code: store.code || '',
        type: store.type || 'own',
        security_pin: '', // Optional on edit
        phone: store.phone || '',
        store_email: store.email || '',

        // Address Details
        village_or_area: store.address?.village_or_area || '',
        post_office: store.address?.post_office || '',
        police_station: store.address?.police_station || '',
        district: store.address?.district || '',
        pincode: store.address?.postal_code || '',
        state: store.address?.state || 'West Bengal',
        lat: store.address?.lat ? String(store.address.lat) : '',
        lng: store.address?.lng ? String(store.address.lng) : '',

        // Bank Compliance
        gstin: store.gstin || '',
        bank_name: store.bank_name || '',
        account_holder: store.account_holder || '',
        account_number: store.account_number || '',
        ifsc_code: store.ifsc_code || '',
        upi_id: store.upi_id || '',

        // Controls
        is_active: store.is_active ?? true,
        is_public: store.is_public ?? true,
        is_gst_registered: store.is_gst_registered ?? false,
        is_iws_allowed: store.is_iws_allowed ?? false,
    });

    // Handle Enter Keypress Field Traversal
    const handleKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
        if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.tagName === 'BUTTON' || target.getAttribute('type') === 'submit') {
                return;
            }
            e.preventDefault();

            const form = e.currentTarget;
            const focusableElements = Array.from(
                form.querySelectorAll<HTMLElement>(
                    'input:not([disabled]):not([readonly]):not([type="hidden"]), select:not([disabled]), button:not([disabled]):not([tabindex="-1"])'
                )
            ).filter((el) => el.tabIndex !== -1 && el.offsetParent !== null);

            const currentIndex = focusableElements.indexOf(target);
            if (currentIndex > -1 && currentIndex < focusableElements.length - 1) {
                focusableElements[currentIndex + 1].focus();
            }
        }
    };

    const handleRegenerateCode = () => {
        setData('code', generateRandomCode());
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        put(stores.update.url({ store: store.uuid }));
    };

    return (
        <>
            <Head title={`Edit Store - ${store.name}`} />

            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">
                {/* Header Action Bar */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-3">
                        <Button asChild variant="outline" size="icon" className="size-9 shrink-0">
                            <Link href={stores.show.url({ store: store.uuid })}>
                                <ArrowLeft className="size-4" />
                            </Link>
                        </Button>
                        <div>
                            <h2 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                                <StoreIcon className="size-6 text-primary" />
                                Edit Store Profile: {store.name}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                Update operational attributes, physical location coordinates, and bank compliance metrics.
                            </p>
                        </div>
                    </div>
                </div>

                <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="space-y-4">

                    {/* CARD 1: STORE OWNER READONLY SUMMARY */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <User className="size-5 text-primary" />
                                Primary Store Owner
                            </CardTitle>
                            <CardDescription>Owner user details bound strictly 1-to-1 with this location.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="col-span-2">
                                    {store.owner ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <p className="text-xs text-muted-foreground">Owner Full Name</p>
                                                <p className="text-xs font-semibold text-foreground">{store.owner.name}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Login Email</p>
                                                <p className="text-xs font-medium text-foreground">{store.owner.email}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-muted-foreground">Mobile Contact</p>
                                                <p className="text-xs font-medium text-foreground">{store.owner.mobile}</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">No assigned owner found.</p>
                                    )}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* 1. Store Status */}
                                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                                        <div className="space-y-0.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Label className="text-sm font-medium">Store Status</Label>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <p>Enable store login, POS operations and all other store functionalities.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <Switch
                                            checked={data.is_active}
                                            onCheckedChange={(checked) => setData('is_active', checked)}
                                        />
                                    </div>

                                    {/* 2. Public Visibility */}
                                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                                        <div className="space-y-0.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Label className="text-sm font-medium">Public Visibility</Label>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <p>Display this store on public store listing feeds.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <Switch
                                            checked={data.is_public}
                                            onCheckedChange={(checked) => setData('is_public', checked)}
                                        />
                                    </div>

                                    {/* 3. GST Registered */}
                                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                                        <div className="space-y-0.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Label className="text-sm font-medium">GST Registered</Label>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <p>Enable GST tax invoicing and compliance features for this store.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <Switch
                                            checked={data.is_gst_registered}
                                            onCheckedChange={(checked) => setData('is_gst_registered', checked)}
                                        />
                                    </div>

                                    {/* 4. Allow Wholesale in Internal Chain */}
                                    <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/20 px-4 py-3">
                                        <div className="space-y-0.5">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Label className="text-sm font-medium">Allow Wholesale</Label>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <p>Allow wholesale order processing and pricing within internal chain stores.</p>
                                                </TooltipContent>
                                            </Tooltip>
                                        </div>
                                        <Switch
                                            checked={data.is_iws_allowed}
                                            onCheckedChange={(checked) => setData('is_iws_allowed', checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 2: STORE IDENTITY & PUBLIC CONTACT */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="size-5 text-primary" />
                                Store Profile & Channels
                            </CardTitle>
                            <CardDescription>Storefront identification and public contact details.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2 ">
                                    <Label htmlFor="name">Store Official Name <span className="text-destructive">*</span></Label>
                                    <div className="relative">
                                        <StoreIcon className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="name"
                                            placeholder="MOBILE BAZAR Jalangi"
                                            className={cn('pl-9 h-9 text-xs', errors.name && 'border-destructive')}
                                            value={data.name}
                                            onChange={(e) => setData('name', e.target.value)}
                                        />
                                    </div>
                                    {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="code">Store Code (6-Digit) <span className="text-destructive">*</span></Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="code"
                                            maxLength={6}
                                            placeholder="6-digit code"
                                            className={cn('h-9 text-xs font-mono tracking-widest', errors.code && 'border-destructive')}
                                            value={data.code}
                                            onChange={(e) => setData('code', e.target.value.replace(/\D/g, ''))}
                                        />
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="size-9 shrink-0"
                                            onClick={handleRegenerateCode}
                                            title="Regenerate Code"
                                        >
                                            <RefreshCw className="size-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                    {errors.code && <p className="text-xs text-destructive">{errors.code}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="type">Store Operating Type <span className="text-destructive">*</span></Label>
                                    <Select value={data.type} onValueChange={(val) => setData('type', val as 'own' | 'franchise')}>
                                        <SelectTrigger id="type" className="w-full h-9 text-xs">
                                            <SelectValue placeholder="Select Type" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="own">Company Owned</SelectItem>
                                            <SelectItem value="franchise">Franchise Outlet</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="security_pin">
                                        New Security PIN <span className="text-muted-foreground font-normal text-[10px]">(Leave blank to keep current)</span>
                                    </Label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="security_pin"
                                            type="password"
                                            inputMode="numeric"
                                            autoComplete="new-password"
                                            data-lpignore="true"
                                            data-form-type="other"
                                            maxLength={6}
                                            placeholder="••••••"
                                            className={cn('pl-9 h-9 text-xs tracking-widest font-mono', errors.security_pin && 'border-destructive')}
                                            value={data.security_pin}
                                            onChange={(e) => setData('security_pin', e.target.value.replace(/\D/g, ''))}
                                        />
                                    </div>
                                    {errors.security_pin && <p className="text-xs text-destructive">{errors.security_pin}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="phone">Store Public Phone <span className="text-muted-foreground font-normal text-[10px]">(Optional)</span></Label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="phone"
                                            type="tel"
                                            placeholder="Support phone number"
                                            className={cn('pl-9 h-9 text-xs', errors.phone && 'border-destructive')}
                                            value={data.phone}
                                            onChange={(e) => setData('phone', e.target.value)}
                                        />
                                    </div>
                                    {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="store_email">Store Public Email <span className="text-muted-foreground font-normal text-[10px]">(Optional)</span></Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="store_email"
                                            type="email"
                                            placeholder="contact@store.com"
                                            className={cn('pl-9 h-9 text-xs', errors.store_email && 'border-destructive')}
                                            value={data.store_email}
                                            onChange={(e) => setData('store_email', e.target.value)}
                                        />
                                    </div>
                                    {errors.store_email && <p className="text-xs text-destructive">{errors.store_email}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 3: STORE ADDRESS */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <MapPin className="size-5 text-primary" />
                                Physical Store Location
                            </CardTitle>
                            <CardDescription>Geographic location details for shipping and customer discovery.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2 ">
                                    <Label htmlFor="village_or_area">Village / Area / Street <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="village_or_area"
                                        placeholder="Street, Building, Area"
                                        className={cn('h-9 text-xs', errors.village_or_area && 'border-destructive')}
                                        value={data.village_or_area}
                                        onChange={(e) => setData('village_or_area', e.target.value)}
                                    />
                                    {errors.village_or_area && <p className="text-xs text-destructive">{errors.village_or_area}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="post_office">Post Office <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="post_office"
                                        placeholder="Local P.O."
                                        className={cn('h-9 text-xs', errors.post_office && 'border-destructive')}
                                        value={data.post_office}
                                        onChange={(e) => setData('post_office', e.target.value)}
                                    />
                                    {errors.post_office && <p className="text-xs text-destructive">{errors.post_office}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="police_station">Police Station <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="police_station"
                                        placeholder="Jurisdiction P.S."
                                        className={cn('h-9 text-xs', errors.police_station && 'border-destructive')}
                                        value={data.police_station}
                                        onChange={(e) => setData('police_station', e.target.value)}
                                    />
                                    {errors.police_station && <p className="text-xs text-destructive">{errors.police_station}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="district">District <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="district"
                                        placeholder="e.g. Murshidabad"
                                        className={cn('h-9 text-xs', errors.district && 'border-destructive')}
                                        value={data.district}
                                        onChange={(e) => setData('district', e.target.value)}
                                    />
                                    {errors.district && <p className="text-xs text-destructive">{errors.district}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="pincode">Pincode <span className="text-destructive">*</span></Label>
                                    <Input
                                        id="pincode"
                                        maxLength={6}
                                        placeholder="6-digit PIN"
                                        className={cn('h-9 text-xs font-mono', errors.pincode && 'border-destructive')}
                                        value={data.pincode}
                                        onChange={(e) => setData('pincode', e.target.value.replace(/\D/g, ''))}
                                    />
                                    {errors.pincode && <p className="text-xs text-destructive">{errors.pincode}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="state">State <span className="text-destructive">*</span></Label>
                                    <Select value={data.state} onValueChange={(val) => setData('state', val)}>
                                        <SelectTrigger id="state" className="w-full h-9 text-xs">
                                            <SelectValue placeholder="Select State" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {INDIAN_STATES.map((state) => (
                                                <SelectItem key={state} value={state}>
                                                    {state}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 4: FINANCIAL COMPLIANCE & BANKING */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Landmark className="size-5 text-primary" />
                                Financial & Settlement Details
                            </CardTitle>
                            <CardDescription>Tax numbers and store direct settlement bank credentials.</CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="gstin">
                                        GSTIN / Tax ID <span className="text-muted-foreground font-normal text-[10px]">(Optional)</span>
                                    </Label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                                        <Input
                                            id="gstin"
                                            maxLength={15}
                                            placeholder="15-digit GSTIN"
                                            className={cn('pl-9 h-9 text-xs uppercase font-mono tracking-wider', errors.gstin && 'border-destructive')}
                                            value={data.gstin}
                                            onChange={(e) => setData('gstin', e.target.value.toUpperCase())}
                                        />
                                    </div>
                                    {errors.gstin && <p className="text-xs text-destructive">{errors.gstin}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="bank_name">Bank Name</Label>
                                    <Input
                                        id="bank_name"
                                        placeholder="e.g. State Bank of India"
                                        className={cn('h-9 text-xs', errors.bank_name && 'border-destructive')}
                                        value={data.bank_name}
                                        onChange={(e) => setData('bank_name', e.target.value)}
                                    />
                                    {errors.bank_name && <p className="text-xs text-destructive">{errors.bank_name}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="account_holder">Account Holder Name</Label>
                                    <Input
                                        id="account_holder"
                                        placeholder="Beneficiary Name"
                                        className={cn('h-9 text-xs', errors.account_holder && 'border-destructive')}
                                        value={data.account_holder}
                                        onChange={(e) => setData('account_holder', e.target.value)}
                                    />
                                    {errors.account_holder && <p className="text-xs text-destructive">{errors.account_holder}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="account_number">Bank Account Number</Label>
                                    <Input
                                        id="account_number"
                                        placeholder="Account Number"
                                        className={cn('h-9 text-xs font-mono', errors.account_number && 'border-destructive')}
                                        value={data.account_number}
                                        onChange={(e) => setData('account_number', e.target.value)}
                                    />
                                    {errors.account_number && <p className="text-xs text-destructive">{errors.account_number}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="ifsc_code">IFSC Code</Label>
                                    <Input
                                        id="ifsc_code"
                                        placeholder="SBIN0000000"
                                        className={cn('h-9 text-xs uppercase font-mono', errors.ifsc_code && 'border-destructive')}
                                        value={data.ifsc_code}
                                        onChange={(e) => setData('ifsc_code', e.target.value.toUpperCase())}
                                    />
                                    {errors.ifsc_code && <p className="text-xs text-destructive">{errors.ifsc_code}</p>}
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="upi_id">Store UPI ID</Label>
                                    <Input
                                        id="upi_id"
                                        placeholder="store@upi"
                                        className={cn('h-9 text-xs font-mono', errors.upi_id && 'border-destructive')}
                                        value={data.upi_id}
                                        onChange={(e) => setData('upi_id', e.target.value)}
                                    />
                                    {errors.upi_id && <p className="text-xs text-destructive">{errors.upi_id}</p>}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CARD 5: STATUS & VISIBILITY */}
                    <Card className="border-sidebar-border/70 dark:border-sidebar-border shadow-sm">
                        <CardHeader className="border-b border-border/50 pb-4">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <CheckCircle2 className="size-5 text-primary" />
                                Operational Flags
                            </CardTitle>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                            </div>
                        </CardContent>
                    </Card>

                    {/* Action Controls */}
                    <div className="flex items-center justify-end gap-4 pt-2 pb-6">
                        <Button type="button" variant="outline" onClick={() => window.history.back()} disabled={processing}>
                            Cancel
                        </Button>
                        <Button type="submit" size="lg" disabled={processing || !data.name || !data.code}>
                            {processing ? 'Saving Changes…' : 'Update Store Profile'}
                        </Button>
                    </div>
                </form>
            </div>
        </>
    );
}

Edit.layout = {
    breadcrumbs: [
        { title: 'Stores', href: stores.index.url() },
        { title: 'Edit Store', href: '#' },
    ],
};

import React, { useState } from 'react';

import {
    MapPin,
    FileText,
    UserRound,
    Search,
    Building2,
    BadgeCheck,
    ScrollText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from '@/components/ui/input-group';

type PartyType = 'customer' | 'supplier';

export default function VendorAndDocMeta() {
    const [partyType, setPartyType] = useState<PartyType>('customer');
    const [isIntraState, setIsIntraState] = useState(true);

    const [form, setForm] = useState({
        po_number: 'PO-1001',
        vendor_invoice_no: '',
        order_date: new Date().toISOString().slice(0, 10),
    });

    const updateForm = (
        field: keyof typeof form,
        value: string
    ) => {
        setForm((prev) => ({
            ...prev,
            [field]: value,
        }));
    };

    return (
        <div>
            <div className="grid grid-cols-3 px-4">
                {/* LEFT COLUMN */}
                <div className="pr-4 grid grid-cols-1 gap-2">

                    {/* Party Search */}
                    <div className="flex items-center gap-2">
                        <div
                            className="flex items-center border rounded-md bg-muted-foreground/10"
                            role="group"
                            aria-label="Party type"
                        >
                            <Button
                                type="button"
                                variant={
                                    partyType === 'customer'
                                        ? 'outline'
                                        : 'ghost'
                                }
                                aria-pressed={
                                    partyType === 'customer'
                                }
                                onClick={() =>
                                    setPartyType('customer')
                                }
                                className={
                                    partyType === 'customer'
                                        ? 'h-8.5 text-xs font-medium'
                                        : 'h-8.5 text-xs text-muted-foreground'
                                }
                            >
                                Customer
                            </Button>

                            <Button
                                type="button"
                                variant={
                                    partyType === 'supplier'
                                        ? 'outline'
                                        : 'ghost'
                                }
                                aria-pressed={
                                    partyType === 'supplier'
                                }
                                onClick={() =>
                                    setPartyType('supplier')
                                }
                                className={
                                    partyType === 'supplier'
                                        ? 'h-8.5 text-xs font-medium'
                                        : 'h-8.5 text-xs text-muted-foreground'
                                }
                            >
                                Supplier
                            </Button>
                        </div>

                        <InputGroup className="w-full">
                            <InputGroupInput
                                placeholder={`Search ${
                                    partyType === 'customer'
                                        ? 'Customer'
                                        : 'Supplier'
                                }...`}
                            />

                            <InputGroupAddon>
                                <Search />
                            </InputGroupAddon>
                        </InputGroup>
                    </div>

                    {/* CUSTOMER INFO */}
                    {partyType === 'customer' && (
                        <div className="relative rounded-lg border bg-background p-3">

                            {/* Customer status */}
                            <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                <Badge
                                    variant="secondary"
                                    className="gap-1 text-[10px]"
                                >
                                    <UserRound className="h-3 w-3" />
                                    Customer
                                </Badge>

                                <Badge
                                    variant="outline"
                                    className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                                >
                                    <BadgeCheck className="h-3 w-3" />
                                    KYC Verified
                                </Badge>
                            </div>

                            {/* Customer */}
                            <div className="flex items-start gap-3 pr-32">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <UserRound className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="min-w-0">
                                    <h3 className="text-sm font-semibold">
                                        Rahul Sharma
                                    </h3>

                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        Individual Customer
                                    </p>
                                </div>
                            </div>

                            {/* Contact + Aadhaar */}
                            <div className="mt-2 grid grid-cols-3 gap-4 border-t pt-2">
                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Mobile
                                    </p>

                                    <p className="mt-0.5 text-xs font-medium">
                                        +91 98765 43210
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Email
                                    </p>

                                    <p className="mt-0.5 truncate text-xs font-medium">
                                        rahul@gmail.com
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Aadhaar
                                    </p>

                                    <p className="mt-0.5 text-xs font-medium">
                                        •••• •••• 4821
                                    </p>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="mt-2 flex items-start gap-2 border-t pt-2">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    24 Park Street, 3rd Floor, Kolkata, West Bengal — 700016
                                </p>
                            </div>
                        </div>
                    )}

                    {/* BUSINESS INFO */}
                    {partyType === 'supplier' && (
                        <div className="relative rounded-lg border bg-background p-3">

                            {/* Business status */}
                            <div className="absolute right-3 top-3 flex items-center gap-1.5">
                                <Badge
                                    variant="secondary"
                                    className="gap-1 text-[10px]"
                                >
                                    <Building2 className="h-3 w-3" />
                                    B2B
                                </Badge>

                                <Badge
                                    variant="outline"
                                    className="gap-1 border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                                >
                                    <BadgeCheck className="h-3 w-3" />
                                    GST Verified
                                </Badge>
                            </div>

                            {/* Business */}
                            <div className="flex items-start gap-3 pr-32">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                </div>

                                <div className="min-w-0">
                                    <h3 className="truncate text-sm font-semibold">
                                        ABC Enterprises Pvt. Ltd.
                                    </h3>

                                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                                        GSTIN: 19ABCDE1234F1Z5
                                    </p>
                                </div>
                            </div>

                            {/* Contact */}
                            <div className="mt-2 grid grid-cols-3 gap-4 border-t pt-2">
                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Contact Person
                                    </p>

                                    <p className="mt-0.5 text-xs font-medium">
                                        Rahul Sharma
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Mobile
                                    </p>

                                    <p className="mt-0.5 text-xs font-medium">
                                        +91 98765 43210
                                    </p>
                                </div>

                                <div>
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                        Email
                                    </p>

                                    <p className="mt-0.5 truncate text-xs font-medium">
                                        rahul@abcenterprises.com
                                    </p>
                                </div>
                            </div>

                            {/* Address */}
                            <div className="mt-2 flex items-start gap-2 border-t pt-2">
                                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />

                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    24 Park Street, 3rd Floor, Kolkata, West Bengal — 700016
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* MIDDLE COLUMN */}
                <div className="border-x border-slate-200 px-4 text-xs text-muted-foreground">
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                            <ScrollText className="h-4 w-4" />
                        </div>

                        <p className="mt-2 text-xs font-medium text-foreground">
                            Account Summary
                        </p>

                        <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                            Transactions, payments, totals and outstanding dues
                        </p>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="pl-4">
                    <div className="relative rounded-lg border bg-background p-3">

                        {/* Purchase status */}
                        <div className="absolute right-3 top-3 flex items-center gap-1.5">
                            <Badge
                                variant="secondary"
                                className="text-[10px]"
                            >
                                PO
                            </Badge>

                            <Badge
                                variant="outline"
                                className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700"
                            >
                                GST
                            </Badge>
                        </div>

                        {/* Header */}
                        <div className="flex items-start gap-3 pr-24">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                            </div>

                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold">
                                    Purchase Details
                                </h3>

                                <p className="text-[10px] text-muted-foreground">
                                    Invoice & purchase information
                                </p>
                            </div>
                        </div>

                        {/* Purchase Meta */}
                        <div className="mt-2 grid grid-cols-2 gap-2 border-t pt-2">

                            {/* Purchase No */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Purchase No.
                                </p>

                                <Input
                                    name="po_number"
                                    className="mt-0.5 h-7 text-xs"
                                    value={form.po_number}
                                    readOnly
                                />
                            </div>

                            {/* Vendor Invoice */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Vendor Invoice
                                </p>

                                <Input
                                    name="vendor_invoice_no"
                                    className="mt-0.5 h-7 text-xs"
                                    value={form.vendor_invoice_no}
                                    onChange={(e) =>
                                        updateForm(
                                            'vendor_invoice_no',
                                            e.target.value
                                        )
                                    }
                                    placeholder="Invoice number"
                                />
                            </div>

                            {/* Purchase Date */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Purchase Date
                                </p>

                                <Input
                                    name="order_date"
                                    className="mt-0.5 h-7 text-xs"
                                    type="date"
                                    value={form.order_date}
                                    onChange={(e) =>
                                        updateForm(
                                            'order_date',
                                            e.target.value
                                        )
                                    }
                                />
                            </div>

                            {/* Tax Movement */}
                            <div>
                                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Tax Movement
                                </p>

                                <div
                                    className="mt-0.5 flex h-7 items-center rounded-md border bg-muted-foreground/10"
                                    role="group"
                                    aria-label="Tax movement"
                                >
                                    <Button
                                        type="button"
                                        variant={
                                            isIntraState
                                                ? 'outline'
                                                : 'ghost'
                                        }
                                        aria-pressed={isIntraState}
                                        onClick={() =>
                                            setIsIntraState(true)
                                        }
                                        className={
                                            isIntraState
                                                ? 'h-6.5 flex-1 px-2 text-[10px] font-medium'
                                                : 'h-6.5 flex-1 px-2 text-[10px] text-muted-foreground'
                                        }
                                    >
                                        CGST + SGST
                                    </Button>

                                    <Button
                                        type="button"
                                        variant={
                                            !isIntraState
                                                ? 'outline'
                                                : 'ghost'
                                        }
                                        aria-pressed={!isIntraState}
                                        onClick={() =>
                                            setIsIntraState(false)
                                        }
                                        className={
                                            !isIntraState
                                                ? 'h-6.5 flex-1 px-2 text-[10px] font-medium'
                                                : 'h-6.5 flex-1 px-2 text-[10px] text-muted-foreground'
                                        }
                                    >
                                        IGST
                                    </Button>
                                </div>
                            </div>
                        </div>

                        {/* Current environment */}
                        <div className="flex items-center gap-2 pt-2">
                            <span className="text-[10px] text-muted-foreground">
                                Store GST State
                            </span>

                            <span className="text-[11px] font-medium">
                                West Bengal
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

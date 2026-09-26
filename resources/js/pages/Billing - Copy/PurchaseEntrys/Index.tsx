import React from 'react';
import { Head, router } from '@inertiajs/react';
import { Separator } from '@/components/ui/separator';

import {
    PurchaseProvider,
    groupRowsForSubmit,
    usePurchase,
    type StoreInfo,
    type DeviceConditionOption,
    type UserPermissions,
} from './purchase-context';

import PurchaseHeader from './partials/PurchaseHeader';
import VendorAndDocMeta from './partials/VendorAndDocMeta';
import LineItemTable from './partials/LineItemTable';
import PurchaseSummaryFooter from './partials/PurchaseSummaryFooter';

// ─── Page props (lean — only small/static data prefetched by the controller) ─

interface PurchaseEntryProps {
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
    permissions: UserPermissions;
    initialPoNumber: string;
}

// ─── Inner component (reads from context) ───────────────────────────────────

function PurchaseEntryInner() {
    const {
        state, flags, vendorIsRegistered,
        grandTotal, subtotal, totalTax, roundOff,
        store, permissions,
    } = usePurchase();

    const buildAndSubmit = (isDraft: boolean) => {
        if (!state.selectedParty) {
            alert('Please select or create a party before submitting.');
            return;
        }
        if (state.rows.length === 0) {
            alert('Please add at least one line item.');
            return;
        }
        if (
            !isDraft &&
            state.rows.some(
                (r) => r.is_serialized && !r.imei1 && !r.imei2 && !r.serial,
            )
        ) {
            alert('Every serialized row needs at least an IMEI or a Serial Number before posting.');
            return;
        }

        const groupedItems = groupRowsForSubmit(state.rows, flags, vendorIsRegistered);

        const payload = {
            // Header
            store_id: store.id,
            order_type: 'direct',
            status: isDraft ? 'draft' : 'completed',
            bill_type: flags.billType,
            is_gst_billed: flags.isGstBilled,
            is_margin_scheme: flags.isMarginScheme,
            is_intra_state: state.taxMovement === 'intra',
            // Vendor
            party_type: state.partyType,
            party_id: state.selectedParty!.id,
            // Document meta
            po_number: state.poNumber,
            vendor_invoice_no: state.vendorInvoiceNo || null,
            order_date: state.orderDate,
            // Financials
            subtotal,
            tax_amount: totalTax,
            discount_amount: state.additionalDiscount,
            shipping_charge: state.freightCharges,
            grand_total: grandTotal,
            round_off: roundOff,
            // Payment
            payment_status: state.markAsPaid
                ? state.paidAmount >= grandTotal ? 'paid' : 'partial'
                : 'unpaid',
            paid_amount: state.markAsPaid ? state.paidAmount || grandTotal : 0,
            payment_mode: state.paymentMode,
            // Notes
            notes: state.notes || null,
            // Line items (grouped: one row per variant, units nested)
            items: groupedItems,
        };

        router.post('/app/purchases', payload, {
            forceFormData: false,
            preserveScroll: true,
        });
    };

    return (
        <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
            <PurchaseHeader onSubmit={buildAndSubmit} />
            <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl px-6 py-4">
                <div className="bg-card pt-4 border rounded-md border-border text-sm">
                    <VendorAndDocMeta />
                    <Separator className="mt-6" />
                    <LineItemTable />
                    <PurchaseSummaryFooter onSubmit={buildAndSubmit} />
                </div>
            </div>
        </div>
    );
}

// ─── Page export (wraps in provider with Inertia props) ─────────────────────

export default function PurchaseEntry({ store, deviceConditions, permissions, initialPoNumber }: PurchaseEntryProps) {
    return (
        <>
            <Head title={`Purchase Entry — ${store.name}`} />
            <PurchaseProvider
                store={store}
                deviceConditions={deviceConditions}
                permissions={permissions}
                initialPoNumber={initialPoNumber}
            >
                <PurchaseEntryInner />
            </PurchaseProvider>
        </>
    );
}

PurchaseEntry.layout = {
    breadcrumbs: [
        { title: 'Accounting', href: '#' },
        { title: 'Purchases', href: '/app/purchases' },
        { title: 'Purchase Entry', href: '' },
    ],
};

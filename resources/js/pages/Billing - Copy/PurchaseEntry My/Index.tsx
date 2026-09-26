import { Head } from '@inertiajs/react';

import PurchaseHeader from './partials/PurchaseHeader';
import VendorAndDocMeta from './partials/VendorAndDocMeta';
import LineItemTable from './partials/LineItemTable';
import { Separator } from '@/components/ui/separator';
import PurchaseSummaryFooter from './partials/PurchaseSummaryFooter';
import { DeviceConditionOption, PurchaseProvider, StoreInfo } from './purchase-context';

interface PurchaseEntryProps {
    store: StoreInfo;
    deviceConditions: DeviceConditionOption[];
    initialPoNumber: string;
}

function PurchaseEntryInner() {
    return (
        <>
            <Head title="Purchase Entry" />
            <div className="min-h-[calc(100vh-3.5rem)] bg-muted-foreground/5">
                <PurchaseHeader />
                <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl px-6 py-4">
                    <div className="bg-card pt-4 border rounded-md border-border text-sm">
                        <VendorAndDocMeta />
                        <Separator className="mt-6" />
                        {/* <LineItemTable />
                        <PurchaseSummaryFooter/> */}
                    </div>
                </div>
            </div>
        </>
    );
}

export default function PurchaseEntry({ store, deviceConditions, initialPoNumber }: PurchaseEntryProps) {
    return (
        <>
            <Head title={`Purchase Entry — ${store.name}`} />
            <PurchaseProvider
                store={store}
                deviceConditions={deviceConditions}
                initialPoNumber={initialPoNumber}
            >
                <PurchaseEntryInner />
            </PurchaseProvider>
        </>
    );
}

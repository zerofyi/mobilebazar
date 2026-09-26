import ShowToast from '@/components/special/show-toast';
import AppBillingLayoutTemplate from '@/layouts/app/app-billing-layout';
import type { BreadcrumbItem } from '@/types';

export default function AppBillingLayout({
    breadcrumbs = [],
    children,
}: {
    breadcrumbs?: BreadcrumbItem[];
    children: React.ReactNode;
}) {
    return (
        <AppBillingLayoutTemplate breadcrumbs={breadcrumbs}>
            {children}
            <ShowToast />
        </AppBillingLayoutTemplate>
    );
}

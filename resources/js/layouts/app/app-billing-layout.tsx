import { AppContent } from '@/components/app-content';
import { AppShell } from '@/components/app-shell';
import { AppSidebarFooter } from '@/components/app-sidebar-footer';
import type { AppLayoutProps } from '@/types';

export default function AppBillingLayoutTemplate({
    children,
}: AppLayoutProps) {
    return (
        <AppShell variant="header">
            <AppContent variant="header" className="min-w-0 overflow-x-clip">
                {children}
                <AppSidebarFooter />
            </AppContent>
        </AppShell>
    );
}

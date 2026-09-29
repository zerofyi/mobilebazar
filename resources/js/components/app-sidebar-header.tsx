import { Breadcrumbs } from '@/components/breadcrumbs';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { BreadcrumbItem as BreadcrumbItemType } from '@/types';
import { ThemeSwitcher } from './special/theme-switcher';
import { QuickCreateDropdown } from './special/quick-create-dropdown';
import { SearchCommand } from './special/search-command';
import { TopNavUser } from './top-nav-user';

export function AppSidebarHeader({
    breadcrumbs = [],
}: {
    breadcrumbs?: BreadcrumbItemType[];
}) {
    return (
        <header className="border-sidebar-border/50 bg-sidebar flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 md:px-6">
            {/* Left Section: Sidebar Toggle & Breadcrumbs */}
            <div className="flex items-center gap-2 overflow-hidden pr-2">
                <SidebarTrigger className="-ml-1 shrink-0" />
                <Breadcrumbs breadcrumbs={breadcrumbs} />
            </div>

            {/* Right Section: Global Search & Header Quick Actions */}
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
                <SearchCommand />
                <QuickCreateDropdown />
                <ThemeSwitcher />
                <TopNavUser />
            </div>
        </header>
    );
}

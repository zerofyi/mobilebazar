import { Link } from '@inertiajs/react';

import AppLogo from '@/components/app-logo';
import { NavFooter } from '@/components/nav-footer';
import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';

import { getNavigationForRole } from '@/config/navigation';
import { useCan } from '@/hooks/use-can';

export function AppSidebar() {
    const { primaryRole } = useCan();

    const currentNav = getNavigationForRole(primaryRole);
    const logoHref = currentNav.mainNavItems?.[0]?.href ?? '#';

    return (
        <Sidebar collapsible="icon" variant="sidebar">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={logoHref} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                {currentNav.mainNavItems && currentNav.mainNavItems.length > 0 && (
                    <NavMain items={currentNav.mainNavItems} />
                )}

                {currentNav.mainNavGroups && currentNav.mainNavGroups.length > 0 && (
                    <NavMain groups={currentNav.mainNavGroups} />
                )}
            </SidebarContent>

            <SidebarFooter>
                {currentNav.footerNavItems && currentNav.footerNavItems.length > 0 && (
                    <NavFooter items={currentNav.footerNavItems} className="mt-auto" />
                )}
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}

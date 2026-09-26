import { Link, usePage } from '@inertiajs/react';
import {
    SidebarGroup,
    SidebarGroupLabel,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useCan } from '@/hooks/use-can';
import { toUrl } from '@/lib/utils';
import type { NavItem, NavItemGroup } from '@/types';

interface NavMainProps {
    items?: NavItem[];
    groups?: NavItemGroup[];
}

export function NavMain({ items, groups }: NavMainProps) {
    const { isCurrentUrl } = useCurrentUrl();
    const { url: currentInertiaUrl } = usePage();
    const { can } = useCan();

    const checkIsActive = (item: NavItem): boolean => {
        if (item.isActive !== undefined) {
            return item.isActive;
        }

        try {
            const rawHref = toUrl(item.href);
            const [targetPath, targetSearch] = rawHref.split('?');

            const isPathMatch = isCurrentUrl(targetPath);
            if (!isPathMatch) {
                return false;
            }

            const [, currentSearch] = currentInertiaUrl.split('?');

            const targetParams = new URLSearchParams(targetSearch || '');
            const currentParams = new URLSearchParams(currentSearch || '');

            const targetKeys = Array.from(targetParams.keys());
            const currentKeys = Array.from(currentParams.keys());

            if (targetKeys.length > 0) {
                return targetKeys.every(
                    (key) => currentParams.get(key) === targetParams.get(key)
                );
            }
            return currentKeys.length === 0;
        } catch {
            return false;
        }
    };

    const filterVisibleItems = (navItems: NavItem[]): NavItem[] => {
        return navItems.filter((item) => {
            if (!item.permission) return true;
            return can(item.permission);
        });
    };

    const renderMenuItems = (navItems: NavItem[]) => (
        <SidebarMenu>
            {navItems.map((item) => {
                const Icon = item.icon;
                const active = checkIsActive(item);

                return (
                    <SidebarMenuItem key={item.title}>
                        <SidebarMenuButton
                            asChild
                            isActive={active}
                            tooltip={{ children: item.title }}
                        >
                            <Link href={item.href} prefetch>
                                {Icon && <Icon className="size-4 shrink-0" />}
                                <span>{item.title}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );

    if (groups && groups.length > 0) {
        return (
            <>
                {groups.map((group) => {
                    if (group.permission && !can(group.permission)) {
                        return null;
                    }

                    const visibleGroupItems = filterVisibleItems(group.items);

                    if (visibleGroupItems.length === 0) {
                        return null;
                    }

                    return (
                        <SidebarGroup key={group.title} className="px-2 py-0">
                            {group.title && (
                                <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
                            )}
                            {renderMenuItems(visibleGroupItems)}
                        </SidebarGroup>
                    );
                })}
            </>
        );
    }

    if (items && items.length > 0) {
        const visibleItems = filterVisibleItems(items);
        if (visibleItems.length === 0) return null;

        return (
            <SidebarGroup className="px-2 py-0">
                {renderMenuItems(visibleItems)}
            </SidebarGroup>
        );
    }

    return null;
}

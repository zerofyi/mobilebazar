import { FolderTree, GalleryHorizontal, Handshake, Landmark, LayoutGrid, ListChecks, MonitorCog, Package, Settings, ShoppingCart, Sliders, Store, Tag, User, ListClock, ShoppingCartPlus, ShoppingCartMinus } from 'lucide-react';

import type { NavItemGroup, RoleNavigation, UserRole } from '@/types';

import admin from '@/routes/admin';
import store from '@/routes/store';
import zero from '@/routes/zero';
import app from '@/routes/app';

export const EMPTY_NAV: RoleNavigation = {
    mainNavItems: [],
    mainNavGroups: [],
    footerNavItems: [],
};

export const COMMON_NAV: RoleNavigation = {
    mainNavItems: [],
    mainNavGroups: [
        {
            title: 'Store Management',
            targetRoles: ['admin'],
            items: [
                {
                    title: 'Stores',
                    href: app.stores.index.url(),
                    icon: Store,
                    permission: 'stores.index',
                },
            ],
        },
        {
            title: 'Catalog Management',
            targetRoles: ['zero', 'admin', 'store'],
            items: [
                {
                    title: 'Brands',
                    href: app.brands.index.url(),
                    icon: Tag,
                    permission: 'brands.view',
                },
                {
                    title: 'Categories',
                    href: app.categories.index.url(),
                    icon: FolderTree,
                    permission: 'categories.view',
                },
                {
                    title: 'Attributes',
                    href: app.attributes.index.url(),
                    icon: Sliders,
                    permission: 'attributes.manage',
                },
                {
                    title: 'Products',
                    href: app.products.index.url(),
                    icon: Package,
                    permission: 'products.index',
                },
            ],
        },
        {
            title: 'Appearance Management',
            targetRoles: ['zero', 'admin', 'store'],
            items: [
                {
                    title: 'Banners',
                    href: app.banners.index.url(),
                    icon: GalleryHorizontal,
                    permission: 'banners.manage',
                },

            ],
        },
        {
            title: 'Business',
            targetRoles: ['zero', 'admin', 'store'],
            items: [
                {
                    title: 'Add Purchases',
                    href: app.purchases.create.url(),
                    icon: ShoppingCartPlus,
                    permission: 'purchases.create',
                },
                {
                    title: 'Purchases History',
                    href: app.purchases.index.url(),
                    icon: ListClock,
                    permission: 'purchases.index',
                },
                {
                    title: 'Add Sales',
                    href: app.sales.create.url(),
                    icon: ShoppingCartMinus,
                    permission: 'sales.create',
                },
                {
                    title: 'Sales History',
                    href: app.sales.index.url(),
                    icon: ListClock,
                    permission: 'sales.index',
                },

            ],
        },
        {
            title: 'Party Management',
            targetRoles: ['zero', 'admin', 'store'],
            items: [
                {
                    title: 'Suppliers',
                    href: app.suppliers.index.url(),
                    icon: Handshake,
                    permission: 'suppliers.index',
                },
                {
                    title: 'Financers',
                    href: app.financers.index.url(),
                    icon: Landmark,
                    permission: 'financers.index',
                },
                {
                    title: 'Customers',
                    href: app.customers.index.url(),
                    icon: User,
                    permission: 'customers.index',
                },

            ],
        },
    ],
    footerNavItems: [],
};

export const BASE_NAVIGATION_CONFIG: Record<UserRole, RoleNavigation> = {
    zero: {
        mainNavItems: [
            {
                title: 'Dashboard',
                href: zero.dashboard.url(),
                icon: LayoutGrid,
            },
        ],
        mainNavGroups: [
            {
                title: 'Dev Environment',
                items: [
                    {
                        title: 'Permissions',
                        href: zero.permissions.index.url(),
                        icon: Store,
                    },
                ],
            },
        ],
        footerNavItems: [],
    },

    admin: {
        mainNavItems: [
            {
                title: 'Dashboard',
                href: admin.dashboard.url(),
                icon: LayoutGrid,
            },
        ],
        mainNavGroups: [],
        footerNavItems: [],
    },

    store: {
        mainNavItems: [
            {
                title: 'Dashboard',
                href: store.dashboard.url(),
                icon: LayoutGrid,
            },
        ],
        mainNavGroups: [],
        footerNavItems: [],
    },
};

export function getNavigationForRole(role: UserRole | null | undefined): RoleNavigation {
    if (!role || !BASE_NAVIGATION_CONFIG[role]) return EMPTY_NAV;

    const baseConfig = BASE_NAVIGATION_CONFIG[role];

    const commonMainItems = (COMMON_NAV.mainNavItems ?? []).filter(
        (item) => !item.targetRoles || item.targetRoles.includes(role)
    );
    const mainNavItems = [...(baseConfig.mainNavItems ?? []), ...commonMainItems];

    const commonGroups = (COMMON_NAV.mainNavGroups ?? []).filter(
        (group) => !group.targetRoles || group.targetRoles.includes(role)
    );

    const mergedGroupsMap = new Map<string, NavItemGroup>();

    (baseConfig.mainNavGroups ?? []).forEach((group) => {
        mergedGroupsMap.set(group.title, { ...group, items: [...group.items] });
    });

    commonGroups.forEach((commonGroup) => {
        if (mergedGroupsMap.has(commonGroup.title)) {
            const existingGroup = mergedGroupsMap.get(commonGroup.title)!;
            existingGroup.items.push(...commonGroup.items);
        } else {
            mergedGroupsMap.set(commonGroup.title, {
                ...commonGroup,
                items: [...commonGroup.items],
            });
        }
    });

    const commonFooterItems = (COMMON_NAV.footerNavItems ?? []).filter(
        (item) => !item.targetRoles || item.targetRoles.includes(role)
    );
    const footerNavItems = [...(baseConfig.footerNavItems ?? []), ...commonFooterItems];

    return {
        mainNavItems,
        mainNavGroups: Array.from(mergedGroupsMap.values()),
        footerNavItems,
    };
}

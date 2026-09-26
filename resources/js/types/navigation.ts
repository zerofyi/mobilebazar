import type { InertiaLinkProps } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import type { UserRole } from './auth';

export type BreadcrumbItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
};

export type NavItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: LucideIcon | null;
    isActive?: boolean;
    permission?: string | string[];
    targetRoles?: UserRole[];
};

export type NavItemGroup = {
    title: string;
    items: NavItem[];
    permission?: string | string[];
    targetRoles?: UserRole[];
};

export type RoleNavigation = {
    mainNavItems?: NavItem[];
    mainNavGroups?: NavItemGroup[];
    footerNavItems?: NavItem[];
};

import { usePage } from '@inertiajs/react';
import type { Auth, UserRole } from '@/types';

interface SharedProps {
    auth: Auth;
    [key: string]: unknown;
}

export function useCan() {
    const { auth } = usePage<SharedProps>().props;
    const user = auth?.user ?? null;
    const permissions = user?.permissions ?? [];
    const spatieRoles = user?.roles ?? [];

    /**
     * Check if user has a single permission OR all permissions in an array.
     */
    const can = (permission: string | string[]): boolean => {
        if (!user) return false;

        if (Array.isArray(permission)) {
            return permission.every((p) => permissions.includes(p));
        }

        return permissions.includes(permission);
    };

    /**
     * Check if user has AT LEAST ONE permission from an array.
     */
    const canAny = (permissionList: string[]): boolean => {
        if (!user) return false;
        return permissionList.some((p) => permissions.includes(p));
    };

    /**
     * Check user's primary database workspace column role (zero, admin, store).
     */
    const isPrimaryRole = (role: UserRole | UserRole[]): boolean => {
        if (!user) return false;

        if (Array.isArray(role)) {
            return role.includes(user.role);
        }

        return user.role === role;
    };

    /**
     * Check if user has a Spatie role OR AT LEAST ONE of an array of Spatie roles.
     */
    const hasRole = (role: string | string[]): boolean => {
        if (!user) return false;

        if (Array.isArray(role)) {
            return role.some((r) => spatieRoles.includes(r));
        }

        return spatieRoles.includes(role);
    };

    return {
        can,
        canAny,
        isPrimaryRole,
        hasRole,
        permissions,
        spatieRoles,
        user,
        primaryRole: user?.role ?? null,
    };
}

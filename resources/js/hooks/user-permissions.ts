import { usePage } from '@inertiajs/react';

interface AuthUser {
    id: number | string;
    name?: string;
    email?: string;
    permissions?: string[];
    roles?: string[];
    [key: string]: unknown;
}

interface SharedPageProps {
    auth?: {
        user?: AuthUser | null;
    };
    [key: string]: unknown;
}

/**
 * Custom hook to manage user permissions and roles from Inertia page props.
 *
 * @example
 * const { can, canAny, hasRole } = usePermissions();
 */
export function usePermissions() {
    const { auth } = usePage<SharedPageProps>().props;

    const user = auth?.user ?? null;
    const permissions = user?.permissions ?? [];
    const roles = user?.roles ?? [];

    /**
     * Check if the authenticated user has a specific permission.
     *
     * @example
     * if (can('delete-products')) { ... }
     * {can('create-voucher') && <Button>New Voucher</Button>}
     */
    const can = (permission: string): boolean => {
        if (!permission) return false;
        return permissions.includes(permission);
    };

    /**
     * Check if the authenticated user has ALL of the specified permissions.
     *
     * @example
     * const canExport = canAll(['view-reports', 'export-data']);
     */
    const canAll = (requiredPermissions: string[]): boolean => {
        if (!requiredPermissions || requiredPermissions.length === 0) return true;
        return requiredPermissions.every((p) => permissions.includes(p));
    };

    /**
     * Check if the authenticated user has AT LEAST ONE of the specified permissions.
     *
     * @example
     * if (canAny(['save-draft', 'edit-voucher'])) { ... }
     */
    const canAny = (requiredPermissions: string[]): boolean => {
        if (!requiredPermissions || requiredPermissions.length === 0) return true;
        return requiredPermissions.some((p) => permissions.includes(p));
    };

    /**
     * Check if the authenticated user has a specific role.
     *
     * @example
     * {hasRole('super-admin') && <AdminBadge />}
     */
    const hasRole = (role: string): boolean => {
        if (!role) return false;
        return roles.includes(role);
    };

    /**
     * Check if the authenticated user has ALL of the specified roles.
     *
     * @example
     * const isSystemAdmin = hasAllRoles(['admin', 'developer']);
     */
    const hasAllRoles = (requiredRoles: string[]): boolean => {
        if (!requiredRoles || requiredRoles.length === 0) return true;
        return requiredRoles.every((r) => roles.includes(r));
    };

    /**
     * Check if the authenticated user has AT LEAST ONE of the specified roles.
     *
     * @example
     * if (hasAnyRole(['admin', 'store-manager'])) { ... }
     */
    const hasAnyRole = (requiredRoles: string[]): boolean => {
        if (!requiredRoles || requiredRoles.length === 0) return true;
        return requiredRoles.some((r) => roles.includes(r));
    };

    return {
        user,
        permissions,
        roles,
        can,
        canAll,
        canAny,
        hasRole,
        hasAllRoles,
        hasAnyRole,
    };
}

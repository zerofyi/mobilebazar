export type UserRole = 'store' | 'admin' | 'zero';

export type User = {
    id: number;
    uuid: string;
    store_id: number | null;
    name: string;
    email: string;
    mobile: string | null;
    role: UserRole;
    avatar: string | null;
    is_active: boolean;
    is_suspended: boolean;
    email_verified_at: string | null;
    mobile_verified_at: string | null;
    parent_id: number | null;
    created_at: string | null;
    updated_at: string | null;

    // Spatie Authorization Arrays
    permissions: string[];
    roles: string[];
    [key: string]: unknown;
};

export type Auth = {
    user: User | null;
};

export type Passkey = {
    id: number;
    name: string;
    authenticator: string | null;
    created_at_diff: string;
    last_used_at_diff: string | null;
};

export type TwoFactorSetupData = {
    svg: string;
    url: string;
};

export type TwoFactorSecretKey = {
    secretKey: string;
};

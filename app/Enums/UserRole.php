<?php

namespace App\Enums;

enum UserRole: string
{
    CASE ZERO = 'zero';
    CASE ADMIN = 'admin';
    CASE STORE = 'store';
    CASE CUSTOMER = 'customer';

    /**
     * Get the default landing dashboard URL for each role.
     */
    public function dashboardUrl(): string
    {
        return match ($this) {
            self::ZERO, self::ADMIN => '/admin/dashboard',
            self::STORE            => '/store/dashboard',
            self::CUSTOMER         => '/customer/dashboard',
        };
    }
}

<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RoleAndPermissionSeeder extends Seeder
{
    public function run(): void
    {
        // 1. Reset Spatie permission cache
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // 2. Register all system permission strings
        $permissions = [
            'stores.index',
            'stores.view',
            'stores.create',
            'stores.update',
            'stores.delete',
            'banners.manage',
            'brands.view',
            'brands.manage',
            'brands.delete',
            'categories.view',
            'categories.manage',
            'categories.delete',
            'attributes.manage',
            'suppliers.index',
            'suppliers.view',
            'suppliers.create',
            'suppliers.update',
            'suppliers.delete',
            'financers.index',
            'financers.view',
            'financers.create',
            'financers.update',
            'financers.delete',
            'customers.index',
            'customers.view',
            'customers.create',
            'customers.update',
            'customers.delete',
            'products.index',
            'products.view',
            'products.create',
            'products.update',
            'products.delete',
            'products.purge',

            'purchases.index',
            'purchases.view',
            'purchases.create',
            'purchases.update',
            'purchases.delete',
            'purchases.purge',

            'sales.index',
            'sales.view',
            'sales.create',
            'sales.update',
            'sales.delete',
            'sales.purge',

            'profile.manage.gst.status',


            // Add new permissions here line-by-line during dev/production deployments
        ];

        foreach ($permissions as $permission) {
            Permission::findOrCreate($permission, 'web');
        }

        // 3. Register Base System Roles (No hardcoded permissions needed)
        $superAdmin = Role::findOrCreate('zero', 'web');
        $admin = Role::findOrCreate('admin', 'web');
        Role::findOrCreate('store', 'web');
        // Role::findOrCreate('cashier', 'web');

        // Optional: Super-Admin gets all permissions automatically as a fallback
        $superAdmin->syncPermissions(Permission::all());
        $admin->syncPermissions(Permission::all());
    }
}

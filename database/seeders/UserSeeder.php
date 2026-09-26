<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $this->createZero();
        $this->createAdmin();
    }

    private function createZero(): void
    {
        $superAdmin = User::updateOrCreate(
            ['email' => 'zero@zerofyi.in'],
            [
                'role' => 'zero',
                'name' => 'Zero User',
                'mobile' => '8145271182',
                'password' => Hash::make('Zero@3205##nahiD'),
                'is_active' => true,
                'is_suspended' => false,
                'email_verified_at' => now(),
                'mobile_verified_at' => now(),
            ]
        );

        $superAdmin->assignRole('zero');
    }

    private function createAdmin(): void
    {
        // Platform Super Admin
        $admin =User::updateOrCreate(
            ['email' => 'admin@mobilebazarapp.in'],
            [
                'role' => 'admin',
                'name' => 'The Admin',
                'mobile' => '7478581326',
                'password' => Hash::make('Mon@1122##RSA'),
                'is_active' => true,
                'is_suspended' => false,
                'email_verified_at' => now(),
                'mobile_verified_at' => now(),
            ]
        );

        $admin->assignRole('admin');
    }
}

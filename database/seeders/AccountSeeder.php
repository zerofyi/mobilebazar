<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Seeder;

class AccountSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            ['code' => '1010', 'name' => 'Cash in Hand', 'type' => 'asset', 'is_system' => true],
            ['code' => '1020', 'name' => 'Bank Account', 'type' => 'asset', 'is_system' => true],
            ['code' => '1030', 'name' => 'Accounts Receivable', 'type' => 'asset', 'is_system' => true],
            ['code' => '1040', 'name' => 'Inventory Asset', 'type' => 'asset', 'is_system' => true],
            ['code' => '2010', 'name' => 'Accounts Payable', 'type' => 'liability', 'is_system' => true],
            ['code' => '2020', 'name' => 'Tax Payable (GST)', 'type' => 'liability', 'is_system' => true],
            ['code' => '4010', 'name' => 'Sales Revenue', 'type' => 'income', 'is_system' => true],
            ['code' => '4020', 'name' => 'Franchise Royalty Income', 'type' => 'income', 'is_system' => true],
            ['code' => '4030', 'name' => 'Loan Interest Income', 'type' => 'income', 'is_system' => true],
            ['code' => '5010', 'name' => 'Cost of Goods Sold (COGS)', 'type' => 'expense', 'is_system' => true],
            ['code' => '5020', 'name' => 'Operating Expenses', 'type' => 'expense', 'is_system' => true],
        ];

        foreach ($accounts as $account) {
            Account::updateOrCreate(
                ['code' => $account['code'], 'store_id' => null],
                array_merge($account, [
                    'opening_balance' => 0.00,
                    'current_balance' => 0.00,
                    'is_active' => true,
                ])
            );
        }
    }
}

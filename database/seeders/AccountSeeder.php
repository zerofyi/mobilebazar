<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Account;
use Illuminate\Database\Seeder;

/**
 * Global (store_id = null) chart of accounts. Safe to re-run: existing balances
 * are never reset, only name/type/flags are refreshed.
 */
class AccountSeeder extends Seeder
{
    public function run(): void
    {
        $accounts = [
            // --- ASSETS (1000 series) ---
            ['code' => '1010', 'name' => 'Cash in Hand',               'type' => 'asset'],
            ['code' => '1020', 'name' => 'Bank Account',               'type' => 'asset'],
            ['code' => '1025', 'name' => 'UPI / Gateway Clearing',     'type' => 'asset'],
            ['code' => '1026', 'name' => 'Card Payment Clearing',      'type' => 'asset'],
            ['code' => '1030', 'name' => 'Accounts Receivable',        'type' => 'asset'],
            ['code' => '1040', 'name' => 'Inventory Asset',            'type' => 'asset'],
            ['code' => '1050', 'name' => 'Input Tax Credit (GST)',     'type' => 'asset'],
            ['code' => '1060', 'name' => 'Loans Issued (Principal)',   'type' => 'asset'],

            // --- LIABILITIES (2000 series) ---
            ['code' => '2010', 'name' => 'Accounts Payable',           'type' => 'liability'],
            ['code' => '2020', 'name' => 'Output Tax Payable (GST)',   'type' => 'liability'],

            // --- EQUITY (3000 series) ---
            ['code' => '3010', 'name' => 'Owner / Retained Earnings',  'type' => 'equity'],

            // --- INCOME (4000 series) ---
            ['code' => '4010', 'name' => 'Sales Revenue',              'type' => 'income'],
            ['code' => '4015', 'name' => 'Sales Discounts Allowed',    'type' => 'income'], // Contra-income (debit balance)
            ['code' => '4016', 'name' => 'Sales Returns',              'type' => 'income'], // Contra-income (debit balance)
            ['code' => '4020', 'name' => 'Franchise Royalty Income',   'type' => 'income'],
            ['code' => '4030', 'name' => 'Loan Interest Income',       'type' => 'income'],
            ['code' => '4035', 'name' => 'Processing Fee Income',      'type' => 'income'],

            // --- EXPENSES (5000 series) ---
            ['code' => '5010', 'name' => 'Cost of Goods Sold (COGS)',  'type' => 'expense'],
            ['code' => '5015', 'name' => 'Purchase Discounts Received','type' => 'expense'], // Contra-expense (credit balance)
            ['code' => '5020', 'name' => 'Operating Expenses',         'type' => 'expense'],
            ['code' => '5030', 'name' => 'Freight Inward',             'type' => 'expense'],
            ['code' => '5040', 'name' => 'Inventory Shrinkage & Loss', 'type' => 'expense'],
        ];

        foreach ($accounts as $row) {
            $account = Account::firstOrNew(['code' => $row['code'], 'store_id' => null]);

            if (! $account->exists) {
                $account->fill(['opening_balance' => 0.00, 'current_balance' => 0.00]);
            }

            $account->fill([
                'name'      => $row['name'],
                'type'      => $row['type'],
                'is_system' => true,
                'is_active' => true,
            ]);

            $account->save();
        }
    }
}

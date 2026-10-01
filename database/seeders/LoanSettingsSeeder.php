<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Setting;
use App\Models\Store;
use Illuminate\Database\Seeder;

/**
 * Per-store loan section defaults. Safe to re-run: only fills keys that are
 * missing, never overwrites a store's customized values.
 *
 *  - loan_interest_rate   monthly % as string, default '4' (flat interest, D1)
 *  - loan_collection_slab ssm-style "1,10,20" or "every_N_days"
 *  - loan_processing_fee  default fee amount, '0'
 *  - loan_prefix          numbering prefix, 'LN' (LN-{STORECODE}-{000001})
 */
class LoanSettingsSeeder extends Seeder
{
    /** @var array<string, string> */
    private const DEFAULTS = [
        'loan_interest_rate'   => '4',
        'loan_collection_slab' => '1,10,20',
        'loan_processing_fee'  => '0',
        'loan_prefix'          => 'LN',
    ];

    public function run(): void
    {
        $stores = Store::query()->pluck('id');

        foreach ($stores as $storeId) {
            foreach (self::DEFAULTS as $key => $value) {
                Setting::firstOrCreate(
                    ['store_id' => $storeId, 'key' => $key],
                    ['value' => $value, 'group' => 'loans'],
                );
            }
        }
    }
}

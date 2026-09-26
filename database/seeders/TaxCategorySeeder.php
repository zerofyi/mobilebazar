<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\TaxCategory;
use Illuminate\Database\Seeder;

class TaxCategorySeeder extends Seeder
{
    public function run(): void
    {
        $taxSlabs = [
            // Nil / Exempt
            ['name' => 'GST 0%', 'tax_percent' => 0.00],

            // Merit Rate
            ['name' => 'GST 5%', 'tax_percent' => 5.00],

            // Standard Rate
            ['name' => 'GST 18%', 'tax_percent' => 18.00],

            // Special De-merit Rate
            ['name' => 'GST 40%', 'tax_percent' => 40.00],
        ];

        foreach ($taxSlabs as $slab) {
            TaxCategory::updateOrCreate(
                ['name' => $slab['name']],
                $slab
            );
        }
    }
}

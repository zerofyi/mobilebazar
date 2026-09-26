<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\DeviceCondition;
use Illuminate\Database\Seeder;

class DeviceConditionSeeder extends Seeder
{
    public function run(): void
    {
        $conditions = [
            [
                'code' => 'NEW',
                'label' => 'Brand New',
                'grade_multiplier' => 1.00,
            ],
            [
                'code' => 'SEALED',
                'label' => 'Sealed Pack',
                'grade_multiplier' => 1.00,
            ],
            [
                'code' => 'OPEN_BOX',
                'label' => 'Open Box',
                'grade_multiplier' => 0.99,
            ],
            [
                'code' => 'UNUSED',
                'label' => 'Unused',
                'grade_multiplier' => 0.98,
            ],
            [
                'code' => 'LIKE_NEW',
                'label' => 'Like New',
                'grade_multiplier' => 0.95,
            ],
            [
                'code' => 'USED',
                'label' => 'Used',
                'grade_multiplier' => 0.85,
            ],
            [
                'code' => 'REFURBISHED',
                'label' => 'Refurbished',
                'grade_multiplier' => 0.75,
            ],
            [
                'code' => 'REPAIRED',
                'label' => 'Repaired',
                'grade_multiplier' => 0.60,
            ],
            [
                'code' => 'DAMAGED',
                'label' => 'Damaged',
                'grade_multiplier' => 0.30,
            ],
            [
                'code' => 'PARTS',
                'label' => 'Parts Only',
                'grade_multiplier' => 0.10,
            ],
            [
                'code' => 'SCRAP',
                'label' => 'Scrap',
                'grade_multiplier' => 0.05,
            ],
        ];

        foreach ($conditions as $condition) {
            DeviceCondition::updateOrCreate(
                ['code' => $condition['code']],
                $condition
            );
        }
    }
}

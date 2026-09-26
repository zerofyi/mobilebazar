<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Unit;
use Illuminate\Database\Seeder;

class UnitSeeder extends Seeder
{
    public function run(): void
    {
        $units = [
            [
                'name' => 'Piece',
                'short_code' => 'pcs',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Individual item. Used for smartphones, watches, chargers, cables, earphones, etc.',
            ],
            [
                'name' => 'Pair',
                'short_code' => 'pair',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Two items sold together as a pair.',
            ],
            [
                'name' => 'Set',
                'short_code' => 'set',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Multiple related items sold together as a set.',
            ],
            [
                'name' => 'Box',
                'short_code' => 'box',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Product sold by box. Box contents may vary by product.',
            ],
            [
                'name' => 'Pack',
                'short_code' => 'pack',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Product sold as a pack. Pack contents may vary by product.',
            ],
            [
                'name' => 'Meter',
                'short_code' => 'm',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Length measurement, useful for cables and wires sold by length.',
            ],
            [
                'name' => 'Foot',
                'short_code' => 'ft',
                'base_unit_id' => null,
                'multiplier' => 1.0000,
                'description' => 'Length measurement, useful for cables and wires sold by length.',
            ],
        ];

        foreach ($units as $unit) {
            Unit::updateOrCreate(
                ['short_code' => $unit['short_code']],
                $unit
            );
        }
    }
}

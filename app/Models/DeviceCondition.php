<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

#[Fillable([
    'code',
    'label',
    'grade_multiplier',
])]
class DeviceCondition extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'grade_multiplier' => 'decimal:2',
        ];
    }
}

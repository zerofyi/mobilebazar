<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'name',
    'short_code',
    'base_unit_id',
    'multiplier',
    'description',
])]
class Unit extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'base_unit_id' => 'integer',
            'multiplier' => 'decimal:4',
        ];
    }

    public function baseUnit(): BelongsTo
    {
        return $this->belongsTo(self::class, 'base_unit_id');
    }

    public function subUnits(): HasMany
    {
        return $this->hasMany(self::class, 'base_unit_id');
    }
}

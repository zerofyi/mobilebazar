<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'store_id',
    'name',
    'region_pattern',
    'pincodes',
    'base_fee',
    'eta_days',
    'is_active',
])]
class ShippingZone extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'pincodes' => 'array',
            'base_fee' => 'decimal:2',
            'eta_days' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function deliveries(): HasMany
    {
        return $this->hasMany(Delivery::class);
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

#[Fillable([
    'uuid',
    'addressable_type',
    'addressable_id',
    'type',
    'line1',
    'line2',
    'city',
    'state',
    'postal_code',
    'country',
    'village_or_area',
    'post_office',
    'police_station',
    'district',
    'lat',
    'lng',
    'is_default',
])]
class Address extends Model
{
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'addressable_id' => 'integer',
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
            'is_default' => 'boolean',
        ];
    }

    public function addressable(): MorphTo
    {
        return $this->morphTo();
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'user_id',
    'status',
    'name',
    'care_of',
    'phone_primary',
    'phone_secondary',
    'aadhaar_number',
    'pan_number',
    'voter_number',
    'credit_limit',
    'loyalty_points',
    'total_spent',
    'is_verified',
    'address_snapshot',
])]
class Customer extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'credit_limit'   => 'decimal:2',
            'loyalty_points' => 'decimal:2',
            'total_spent'    => 'decimal:2',
            'is_verified'    => 'boolean',
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('status', 'active');
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function purchases(): MorphMany
    {
        return $this->morphMany(PurchaseOrder::class, 'vendor');
    }

    /*
    |--------------------------------------------------------------------------
    | Accessors
    |--------------------------------------------------------------------------
    */

    public function getDisplayAddressAttribute(): string
    {
        if (!empty($this->address_snapshot)) {
            return $this->address_snapshot;
        }

        if ($this->relationLoaded('address') && $this->address) {
            return collect([
                $this->address->line1,
                $this->address->line2,
                $this->address->village_or_area,
                $this->address->post_office,
                $this->address->police_station,
                $this->address->city,
                $this->address->district,
                $this->address->state,
                $this->address->postal_code,
            ])->filter()->implode(', ');
        }

        return '';
    }
}

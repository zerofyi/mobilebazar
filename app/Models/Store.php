<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'code',
    'name',
    'type',
    'platform',
    'franchise_fee_per_unit',
    'security_pin_hash',
    'agreement_id',
    'image_asset_id',
    'logo_asset_id',
    'signature_asset_id',
    'address_id',
    'location',
    'phone',
    'email',
    'gstin',
    'bank_name',
    'bank_account_holder_name',
    'bank_account_number',
    'bank_ifsc',
    'bank_upi_id',
    'is_active',
    'is_public',
    'lat',
    'lng',
    'timezone',
    'currency',
    'user_id',
    'opened_at',
    'closed_at',
])]
class Store extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    protected function casts(): array
    {
        return [
            'franchise_fee_per_unit' => 'decimal:2',
            'is_active' => 'boolean',
            'is_public' => 'boolean',
            'image_asset_id' => 'integer',
            'logo_asset_id' => 'integer',
            'signature_asset_id' => 'integer',
            'address_id' => 'integer',
            'user_id' => 'integer',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
        ];
    }

    public function address(): BelongsTo
    {
        return $this->belongsTo(Address::class, 'address_id');
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function imageAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'image_asset_id');
    }

    public function logoAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'logo_asset_id');
    }

    public function signatureAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'signature_asset_id');
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'store_users')
            ->withPivot(['role', 'is_active', 'joined_at', 'base_salary', 'commission'])
            ->withTimestamps();
    }

    public function storeUsers(): HasMany
    {
        return $this->hasMany(StoreUser::class, 'store_id');
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'code',
    'name',
    'type',
    'platform',
    'security_pin_hash',
    'franchise_agreement_id',
    'image_asset_path',
    'logo_asset_path',
    'signature_asset_path',
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
    'is_gst_registered',
    'is_iws_allowed',
    'lat',
    'lng',
    'timezone',
    'currency',
    'user_id',
    'opened_at',
    'closed_at',
])]
#[Hidden([
    'security_pin_hash',
])]
class Store extends Model
{
    use HasAssets, HasFactory, HasUuids, SoftDeletes;

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
            'is_active' => 'boolean',
            'is_public' => 'boolean',
            'is_gst_registered' => 'boolean',
            'is_iws_allowed' => 'boolean',
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
            'bank_account_number' => 'encrypted',
            'security_pin_hash' => 'hashed',
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
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

    public function primaryUsers(): HasMany
    {
        return $this->hasMany(User::class, 'store_id');
    }

    public function address(): MorphOne
    {
        return $this->morphOne(Address::class, 'addressable');
    }

    public function addresses(): MorphMany
    {
        return $this->morphMany(Address::class, 'addressable');
    }

    public function purchaseOrders(): HasMany
    {
        return $this->hasMany(PurchaseOrder::class, 'store_id');
    }

    public function suppliers(): HasMany
    {
        return $this->hasMany(Supplier::class, 'store_id');
    }

    public function stockUnits(): HasMany
    {
        return $this->hasMany(StockUnit::class, 'store_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Query Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    public function scopePublic(Builder $query): Builder
    {
        return $query->where('is_public', true)->where('is_active', true);
    }
}

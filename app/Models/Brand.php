<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'name',
    'slug',
    'logo_asset_id',
    'is_active',
])]
class Brand extends Model
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
            'is_active' => 'boolean',
            'logo_asset_id' => 'integer',
        ];
    }

    public function logoAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'logo_asset_id');
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class, 'brand_id');
    }
}

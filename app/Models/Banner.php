<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'store_id',
    'title',
    'image_path',
    'image_asset_id',
    'url_type',
    'url',
    'position',
    'sort_order',
    'is_active',
    'starts_at',
    'ends_at',
])]
class Banner extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'sort_order' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'image_asset_id' => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function imageAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'image_asset_id');
    }
}

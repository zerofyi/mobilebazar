<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'delivery_id',
    'attempt_no',
    'status',
    'note',
    'lat',
    'lng',
    'photo_path',
    'photo_asset_id',
    'attempted_at',
])]
class DeliveryAttempt extends Model
{
    use HasFactory, HasAssets;

    protected function casts(): array
    {
        return [
            'attempt_no' => 'integer',
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
            'attempted_at' => 'datetime',
        ];
    }

    public function delivery(): BelongsTo
    {
        return $this->belongsTo(Delivery::class);
    }

    public function photoAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'photo_asset_id');
    }
}

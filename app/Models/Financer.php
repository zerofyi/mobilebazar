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
    'user_id',
    'name',
    'mobile',
    'signature_asset_id',
    'address_id',
    'type',
    'is_active',
    'limit',
    'balance',
])]
class Financer extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'limit' => 'decimal:2',
            'balance' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function signatureAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'signature_asset_id');
    }

    public function address(): BelongsTo
    {
        return $this->belongsTo(Address::class);
    }
}

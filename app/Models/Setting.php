<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'store_id',
    'key',
    'value',
    'group',
    'is_public',
    'is_locked',
    'updated_by_user_id',
])]
class Setting extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'value' => 'array',
            'is_public' => 'boolean',
            'is_locked' => 'boolean',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function updatedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'updated_by_user_id');
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\Pivot;

#[Fillable([
    'user_id',
    'store_id',
    'role',
    'is_active',
    'joined_at',
    'base_salary',
    'commission',
])]
class StoreUser extends Pivot
{
    use HasFactory;

    public $incrementing = true;
    protected $table = 'store_users';

    protected function casts(): array
    {
        return [
            'user_id' => 'integer',
            'store_id' => 'integer',
            'is_active' => 'boolean',
            'joined_at' => 'datetime',
            'base_salary' => 'decimal:2',
            'commission' => 'decimal:2',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}

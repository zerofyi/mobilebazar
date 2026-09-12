<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $uuid
 * @property string $identifier
 * @property string $code_hash
 * @property string $purpose
 * @property int $attempts
 * @property Carbon $expires_at
 * @property Carbon|null $consumed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @property-read User|null $user
 */
#[Fillable([
    'uuid',
    'identifier',
    'code_hash',
    'purpose',
    'attempts',
    'expires_at',
    'consumed_at',
])]
#[Hidden([
    'code_hash',
])]
class Otp extends Model
{
    use HasFactory, HasUuids;

    /**
     * Specify the UUID target column for HasUuids trait.
     *
     * @return array<int, string>
     */
    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    /**
     * Get the user associated with this OTP identifier.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'identifier', 'mobile');
    }

    /**
     * Check if the OTP is valid.
     */
    public function isValid(): bool
    {
        return $this->consumed_at === null && $this->expires_at->isFuture() && $this->attempts < 5;
    }
}

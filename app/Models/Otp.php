<?php

namespace App\Models;

use Database\Factories\OtpFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * @property int         $id
 * @property string      $uuid
 * @property string      $identifier
 * @property string      $code_hash
 * @property string      $purpose
 * @property string|null $ip_address
 * @property int         $attempts
 * @property Carbon      $expires_at
 * @property Carbon|null $consumed_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @property-read bool $is_expired
 * @property-read bool $is_consumed
 * @property-read bool $is_locked
 * @property-read bool $is_valid
 *
 * @method static Builder<static> validFor(string $identifier, string $purpose)
 * @method static Builder<static> unconsumed()
 * @method static Builder<static> active()
 * @method static Builder<static> prunable()
 */
#[Fillable([
    'uuid',
    'identifier',
    'code_hash',
    'purpose',
    'ip_address',
    'attempts',
    'expires_at',
    'consumed_at',
])]
#[Hidden(['code_hash'])]
class Otp extends Model
{
    /** @use HasFactory<OtpFactory> */
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'attempts'   => 'integer',
            'expires_at' => 'datetime',
            'consumed_at' => 'datetime',
        ];
    }

    // ─── Accessors ───────────────────────────────────────────────────────────

    public function getIsExpiredAttribute(): bool
    {
        return $this->expires_at->isPast();
    }

    public function getIsConsumedAttribute(): bool
    {
        return $this->consumed_at !== null;
    }

    /** Too many wrong guesses — locked regardless of expiry. */
    public function getIsLockedAttribute(): bool
    {
        return $this->attempts >= (int) config('otp.max_verify_attempts', 5);
    }

    public function getIsValidAttribute(): bool
    {
        return ! $this->is_consumed && ! $this->is_expired && ! $this->is_locked;
    }

    // ─── Scopes ──────────────────────────────────────────────────────────────

    public function scopeUnconsumed(Builder $query): Builder
    {
        return $query->whereNull('consumed_at');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('expires_at', '>', now());
    }

    /**
     * Composite scope used during verification; maps to the DB index on
     * (identifier, purpose, expires_at, consumed_at).
     */
    public function scopeValidFor(Builder $query, string $identifier, string $purpose = 'login'): Builder
    {
        return $query
            ->where('identifier', $identifier)
            ->where('purpose', $purpose)
            ->where('expires_at', '>', now())
            ->whereNull('consumed_at');
    }

    /**
     * Records safe to hard-delete: expired or consumed AND older than
     * the configured retention window.
     */
    public function scopePrunable(Builder $query): Builder
    {
        $cutoff = now()->subDays((int) config('otp.prune_after_days', 30));

        return $query->where(function (Builder $q) use ($cutoff) {
            $q->where('expires_at', '<', now())
              ->orWhereNotNull('consumed_at');
        })->where('created_at', '<', $cutoff);
    }
}

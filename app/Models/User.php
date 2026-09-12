<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Fortify\Contracts\PasskeyUser;
use Laravel\Fortify\PasskeyAuthenticatable;
use Laravel\Fortify\TwoFactorAuthenticatable;
use Spatie\Permission\Traits\HasRoles;
use Zerofyi\Media\Traits\HasAssets;

/**
 * @property int $id
 * @property string $uuid
 * @property int|null $store_id
 * @property string $role
 * @property string $name
 * @property string $email
 * @property string|null $mobile
 * @property string|null $avatar
 * @property bool $is_active
 * @property bool $is_suspended
 * @property \Illuminate\Support\Carbon|null $email_verified_at
 * @property \Illuminate\Support\Carbon|null $mobile_verified_at
 * @property string $password
 * @property int|null $parent_id
 * @property int $failed_login_attempts
 * @property \Illuminate\Support\Carbon|null $locked_until
 * @property \Illuminate\Support\Carbon|null $last_login_at
 * @property string|null $last_login_ip
 * @property string|null $two_factor_secret
 * @property string|null $two_factor_recovery_codes
 * @property \Illuminate\Support\Carbon|null $two_factor_confirmed_at
 * @property string|null $remember_token
 * @property \Illuminate\Support\Carbon|null $deleted_at
 * @property \Illuminate\Support\Carbon|null $created_at
 * @property \Illuminate\Support\Carbon|null $updated_at
 */
#[Fillable([
    'uuid',
    'store_id',
    'role',
    'name',
    'email',
    'mobile',
    'avatar',
    'is_active',
    'is_suspended',
    'email_verified_at',
    'mobile_verified_at',
    'password',
    'parent_id',
    'failed_login_attempts',
    'locked_until',
    'last_login_at',
    'last_login_ip',
])]
#[Hidden([
    'password',
    'two_factor_secret',
    'two_factor_recovery_codes',
    'remember_token',
])]
class User extends Authenticatable implements PasskeyUser
{
    use HasFactory,
        HasRoles,
        HasUuids,
        HasAssets,
        Notifiable,
        PasskeyAuthenticatable,
        SoftDeletes,
        TwoFactorAuthenticatable;

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
            'is_active' => 'boolean',
            'is_suspended' => 'boolean',
            'email_verified_at' => 'datetime',
            'mobile_verified_at' => 'datetime',
            'password' => 'hashed',
            'failed_login_attempts' => 'integer',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'two_factor_confirmed_at' => 'datetime',
        ];
    }

    public function parent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'parent_id');
    }

    public function children(): HasMany
    {
        return $this->hasMany(User::class, 'parent_id');
    }

    public function otps(): HasMany
    {
        return $this->hasMany(Otp::class, 'identifier', 'mobile');
    }

    public function devices(): HasMany
    {
        return $this->hasMany(UserDevice::class);
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && $this->locked_until->isFuture();
    }

    public function isUsable(): bool
    {
        return $this->is_active && ! $this->is_suspended && ! $this->isLocked();
    }

    public function ownedStore(): HasOne
    {
        return $this->hasOne(Store::class, 'user_id');
    }

    public function storeAssignments(): HasMany
    {
        return $this->hasMany(StoreUser::class, 'user_id');
    }

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class, 'store_users')
            ->withPivot(['role', 'is_active', 'joined_at', 'base_salary', 'commission'])
            ->withTimestamps();
    }
}

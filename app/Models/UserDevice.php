<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $uuid
 * @property int $user_id
 * @property string $device_id
 * @property string|null $device_name
 * @property string|null $fcm_token
 * @property string|null $platform
 * @property string|null $app_version
 * @property float|null $lat
 * @property float|null $lng
 * @property Carbon|null $last_active_at
 * @property Carbon|null $created_at
 * @property Carbon|null $updated_at
 *
 * @property-read User $user
 */
#[Fillable([
    'uuid',
    'user_id',
    'device_id',
    'device_name',
    'fcm_token',
    'platform',
    'app_version',
    'lat',
    'lng',
    'last_active_at',
])]
class UserDevice extends Model
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
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
            'last_active_at' => 'datetime',
        ];
    }

    /**
     * Get the owning user account.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}

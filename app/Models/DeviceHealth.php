<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'stock_unit_id',
    'battery_health_pct',
    'checklist_json',
    'checked_by',
    'checked_at',
])]
class DeviceHealth extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'battery_health_pct' => 'integer',
            'checklist_json' => 'array',
            'checked_at' => 'datetime',
        ];
    }

    public function stockUnit(): BelongsTo
    {
        return $this->belongsTo(StockUnit::class);
    }

    public function checkedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'checked_by');
    }
}

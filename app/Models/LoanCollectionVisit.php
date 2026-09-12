<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'loan_id',
    'agent_id',
    'outcome',
    'amount_collected',
    'lat',
    'lng',
    'visit_photo_asset_id',
    'notes',
    'visited_at',
])]
class LoanCollectionVisit extends Model
{
    use HasFactory, HasUuids, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'amount_collected' => 'decimal:2',
            'lat' => 'decimal:8',
            'lng' => 'decimal:8',
            'visited_at' => 'datetime',
        ];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function agent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'agent_id');
    }

    public function visitPhoto(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'visit_photo_asset_id');
    }
}

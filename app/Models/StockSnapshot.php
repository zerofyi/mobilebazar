<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'store_id',
    'product_variant_id',
    'quantity_on_hand',
    'quantity_reserved',
    'last_ledger_id_applied',
    'last_unit_event_id_applied',
])]
class StockSnapshot extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'store_id' => 'integer',
            'product_variant_id' => 'integer',
            'quantity_on_hand' => 'integer',
            'quantity_reserved' => 'integer',
            'last_ledger_id_applied' => 'integer',
            'last_unit_event_id_applied' => 'integer',
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }

    public function lastLedger(): BelongsTo
    {
        return $this->belongsTo(StockLedger::class, 'last_ledger_id_applied');
    }

    public function lastUnitEvent(): BelongsTo
    {
        return $this->belongsTo(StockUnitEvent::class, 'last_unit_event_id_applied');
    }

    /*
    |--------------------------------------------------------------------------
    | Accessors
    |--------------------------------------------------------------------------
    */

    public function getAvailableQuantityAttribute(): int
    {
        return max(0, $this->quantity_on_hand - $this->quantity_reserved);
    }
}

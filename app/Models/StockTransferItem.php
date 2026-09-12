<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'stock_transfer_id',
    'product_variant_id',
    'stock_unit_id',
    'quantity',
])]
class StockTransferItem extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'stock_transfer_id' => 'integer',
            'product_variant_id' => 'integer',
            'stock_unit_id' => 'integer',
            'quantity' => 'integer',
        ];
    }

    public function stockTransfer(): BelongsTo
    {
        return $this->belongsTo(StockTransfer::class);
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }

    public function stockUnit(): BelongsTo
    {
        return $this->belongsTo(StockUnit::class);
    }
}

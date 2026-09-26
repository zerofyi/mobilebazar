<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'purchase_order_id',
    'product_variant_id',
    'manual_item_name',
    'ordered_qty',
    'unit_cost',
    'tax_type',
    'is_margin_scheme',
    'base_cost',
    'landed_cost',
    'tax_pct',
    'tax_amount',
    'discount_amount',
    'line_total',
])]
class PurchaseOrderItem extends Model
{
    use HasFactory, SoftDeletes;

    protected function casts(): array
    {
        return [
            'purchase_order_id' => 'integer',
            'product_variant_id' => 'integer',
            'ordered_qty' => 'integer',
            'unit_cost' => 'decimal:2',
            'is_margin_scheme' => 'boolean',
            'base_cost' => 'decimal:2',
            'landed_cost' => 'decimal:2',
            'tax_pct' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }

    public function stockUnits(): HasMany
    {
        return $this->hasMany(StockUnit::class, 'purchase_order_item_id');
    }

    public function stockBatches(): HasMany
    {
        return $this->hasMany(StockBatch::class, 'purchase_order_item_id');
    }
}

<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'uuid',
    'store_id',
    'product_variant_id',
    'manual_item_name',
    'batch_number',
    'purchase_order_id',
    'purchase_order_item_id',
    'product_condition',
    'overall_health',
    'remaining_warranty',
    'received_qty',
    'remaining_qty',
    'base_cost',
    'landed_cost',
    'wholesale_price',
    'selling_price',
    'is_margin_scheme',
    'is_saleable',
])]
class StockBatch extends Model
{
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'store_id' => 'integer',
            'product_variant_id' => 'integer',
            'purchase_order_id' => 'integer',
            'purchase_order_item_id' => 'integer',
            'received_qty' => 'integer',
            'remaining_qty' => 'integer',
            'base_cost' => 'decimal:2',
            'landed_cost' => 'decimal:2',
            'wholesale_price' => 'decimal:2',
            'selling_price' => 'decimal:2',
            'is_margin_scheme' => 'boolean',
            'is_saleable' => 'boolean',
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Query Scopes
    |--------------------------------------------------------------------------
    */

    public function scopeForStore(Builder $query, int $storeId): Builder
    {
        return $query->where('store_id', $storeId);
    }

    public function scopeAvailable(Builder $query): Builder
    {
        return $query->where('remaining_qty', '>', 0)->where('is_saleable', true);
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

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function purchaseOrderItem(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrderItem::class);
    }

    public function ledgers(): HasMany
    {
        return $this->hasMany(StockLedger::class, 'stock_batch_id');
    }
}

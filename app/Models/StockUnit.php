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
use Illuminate\Database\Eloquent\Relations\HasOne;

#[Fillable([
    'uuid',
    'store_id',
    'product_variant_id',
    'manual_item_name',
    'imei1',
    'imei2',
    'serial_number',
    'device_condition',
    'overall_health',
    'health_id',
    'activation_date',
    'warranty_expiry_date',
    'remaining_warranty',
    'is_saleable',
    'status',
    'landed_cost',
    'base_cost',
    'wholesale_price',
    'selling_price',
    'is_margin_scheme',
    'purchase_order_id',
    'purchase_order_item_id',
    'notes',
])]
class StockUnit extends Model
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
            'health_id' => 'integer',
            'purchase_order_id' => 'integer',
            'purchase_order_item_id' => 'integer',
            'activation_date' => 'date',
            'warranty_expiry_date' => 'date',
            'is_saleable' => 'boolean',
            'is_margin_scheme' => 'boolean',
            'landed_cost' => 'decimal:2',
            'base_cost' => 'decimal:2',
            'wholesale_price' => 'decimal:2',
            'selling_price' => 'decimal:2',
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
        return $query->where('status', 'available')->where('is_saleable', true);
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

    public function events(): HasMany
    {
        return $this->hasMany(StockUnitEvent::class);
    }

    public function deviceHealth(): HasOne
    {
        return $this->hasOne(DeviceHealth::class, 'stock_unit_id');
    }

    /*
    |--------------------------------------------------------------------------
    | Accessors
    |--------------------------------------------------------------------------
    */

    public function getDisplayNameAttribute(): string
    {
        return $this->productVariant?->variant_name ?? $this->manual_item_name ?? 'Unknown Device';
    }
}

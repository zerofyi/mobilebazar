<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
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
    'imei1',
    'imei2',
    'serial_number',
    'color',
    'device_condition',
    'health',
    'age',
    'warranty',
    'status',
    'cost_price',
    'selling_price',
    'purchase_order_id',
    'purchase_order_item_id',
    'sold_invoice_item_id',
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
            'cost_price' => 'decimal:2',
            'selling_price' => 'decimal:2',
            'purchase_order_id' => 'integer',
            'purchase_order_item_id' => 'integer',
            'sold_invoice_item_id' => 'integer',
        ];
    }

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

    public function getDisplayNameAttribute(): string
    {
        return $this->productVariant?->variant_name ?? $this->manual_item_name ?? 'Unknown Device';
    }
}

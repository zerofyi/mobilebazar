<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'purchase_order_id',
    'product_variant_id',
    'manual_item_name',
    'ordered_qty',
    'unit_id',
    'unit_cost',
    'tax_category_id',
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
            'ordered_qty' => 'integer',
            'unit_cost' => 'decimal:2',
            'tax_pct' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'line_total' => 'decimal:2',
        ];
    }

    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class);
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }

    public function unit(): BelongsTo
    {
        return $this->belongsTo(Unit::class);
    }

    public function taxCategory(): BelongsTo
    {
        return $this->belongsTo(TaxCategory::class);
    }
}

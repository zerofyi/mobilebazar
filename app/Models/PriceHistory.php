<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'product_variant_id',
    'store_id',
    'old_mrp',
    'new_mrp',
    'old_selling_price',
    'new_selling_price',
    'old_cost_price',
    'new_cost_price',
    'changed_by',
    'reason',
])]
class PriceHistory extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'old_mrp' => 'decimal:2',
            'new_mrp' => 'decimal:2',
            'old_selling_price' => 'decimal:2',
            'new_selling_price' => 'decimal:2',
            'old_cost_price' => 'decimal:2',
            'new_cost_price' => 'decimal:2',
            'created_at' => 'datetime',
        ];
    }

    public function productVariant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function changedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}

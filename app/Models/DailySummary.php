<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'store_id',
    'date',
    'total_sales',
    'total_purchases',
    'total_expenses',
    'total_tax_collected',
    'total_discounts',
    'cash_collected',
    'digital_collected',
    'credit_given',
    'loan_collections',
    'gross_profit',
    'net_profit',
    'invoice_count',
    'purchase_count',
])]
class DailySummary extends Model
{
    use HasFactory;

    public $timestamps = false;

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'total_sales' => 'decimal:2',
            'total_purchases' => 'decimal:2',
            'total_expenses' => 'decimal:2',
            'total_tax_collected' => 'decimal:2',
            'total_discounts' => 'decimal:2',
            'cash_collected' => 'decimal:2',
            'digital_collected' => 'decimal:2',
            'credit_given' => 'decimal:2',
            'loan_collections' => 'decimal:2',
            'gross_profit' => 'decimal:2',
            'net_profit' => 'decimal:2',
            'invoice_count' => 'integer',
            'purchase_count' => 'integer',
            'created_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}

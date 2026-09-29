<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'store_id',
    'year_month',
    'total_sales',
    'new_sales',
    'used_sales',
    'total_purchases',
    'new_purchases',
    'used_purchases',
    'total_refunds',
    'total_discounts',
    'total_tax_collected',
    'total_expenses',
    'total_loan_given',
    'total_emi_collected',
    'gross_profit',
    'net_profit',
    'closing_stock_value',
    'total_receivables',
    'total_payables',
    'purchase_count',
    'invoice_count',
    'return_count',
    'loans_count',
    'is_locked',
    'locked_at',
    'locked_by',
])]
class MonthlySummary extends Model
{
    use HasFactory;

    protected function casts(): array
    {
        return [
            'total_sales'         => 'decimal:2',
            'new_sales'           => 'decimal:2',
            'used_sales'          => 'decimal:2',
            'total_purchases'     => 'decimal:2',
            'new_purchases'       => 'decimal:2',
            'used_purchases'      => 'decimal:2',
            'total_refunds'       => 'decimal:2',
            'total_discounts'     => 'decimal:2',
            'total_tax_collected' => 'decimal:2',
            'total_expenses'      => 'decimal:2',
            'total_loan_given'    => 'decimal:2',
            'total_emi_collected' => 'decimal:2',
            'gross_profit'        => 'decimal:2',
            'net_profit'          => 'decimal:2',
            'closing_stock_value' => 'decimal:2',
            'total_receivables'   => 'decimal:2',
            'total_payables'      => 'decimal:2',
            'purchase_count'      => 'integer',
            'invoice_count'       => 'integer',
            'return_count'        => 'integer',
            'loans_count'         => 'integer',
            'is_locked'           => 'boolean',
            'locked_at'           => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function lockedByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'locked_by');
    }
}

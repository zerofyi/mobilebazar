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
    'new_purchases',
    'used_purchases',
    'total_purchases',
    'total_purchases_serialized',
    'total_purchases_non_serialized',
    'new_sales',
    'used_sales',
    'total_sales',
    'total_sales_serialized',
    'total_sales_non_serialized',
    'total_refunds',
    'total_tax_collected',
    'total_expenses',
    'total_discounts',
    'cash_collected',
    'upi_collected',
    'card_collected',
    'bank_collected',
    'total_loan_given',
    'total_emi_collected',
    'gross_profit',
    'net_profit',
    'purchase_count',
    'purchase_items_count',
    'invoice_count',
    'invoice_items_count',
    'return_count',
    'return_items_count',
    'loans_count',
])]
class DailySummary extends Model
{
    use HasFactory;

    // Note: Enabled because your migration defines $table->timestamps();
    public $timestamps = true;

    protected function casts(): array
    {
        return [
            'date'                             => 'date',
            'new_purchases'                    => 'decimal:2',
            'used_purchases'                   => 'decimal:2',
            'total_purchases'                  => 'decimal:2',
            'total_purchases_serialized'       => 'decimal:2',
            'total_purchases_non_serialized'   => 'decimal:2',
            'new_sales'                        => 'decimal:2',
            'used_sales'                       => 'decimal:2',
            'total_sales'                      => 'decimal:2',
            'total_sales_serialized'           => 'decimal:2',
            'total_sales_non_serialized'       => 'decimal:2',
            'total_refunds'                    => 'decimal:2',
            'total_tax_collected'              => 'decimal:2',
            'total_expenses'                   => 'decimal:2',
            'total_discounts'                  => 'decimal:2',
            'cash_collected'                   => 'decimal:2',
            'upi_collected'                    => 'decimal:2',
            'card_collected'                   => 'decimal:2',
            'bank_collected'                   => 'decimal:2',
            'total_loan_given'                 => 'decimal:2',
            'total_emi_collected'              => 'decimal:2',
            'gross_profit'                     => 'decimal:2',
            'net_profit'                       => 'decimal:2',
            'purchase_count'                   => 'integer',
            'purchase_items_count'             => 'integer',
            'invoice_count'                    => 'integer',
            'invoice_items_count'              => 'integer',
            'return_count'                     => 'integer',
            'return_items_count'               => 'integer',
            'loans_count'                      => 'integer',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}

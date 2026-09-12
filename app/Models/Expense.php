<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'expense_number',
    'store_id',
    'account_id',
    'category',
    'title',
    'amount',
    'tax_amount',
    'payment_mode',
    'shift_id',
    'expense_date',
    'receipt_asset_id',
    'notes',
    'created_by',
])]
class Expense extends Model
{
    use HasFactory, HasUuids, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'amount' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'expense_date' => 'date',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function account(): BelongsTo
    {
        return $this->belongsTo(Account::class);
    }

    public function shift(): BelongsTo
    {
        return $this->belongsTo(Shift::class);
    }

    public function receiptAsset(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'receipt_asset_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}

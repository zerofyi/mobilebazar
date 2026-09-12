<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'po_number',
    'vendor_invoice_no',
    'store_id',
    'vendor_type',
    'supplier_id',
    'customer_id',
    'status',
    'order_date',
    'due_date',
    'expected_date',
    'subtotal',
    'tax_amount',
    'discount_amount',
    'shipping_charge',
    'grand_total',
    'paid_amount',
    'due_amount',
    'payment_status',
    'payment_mode',
    'invoice_document_asset_id',
    'additional_document_asset_id',
    'notes',
    'created_by',
    'approved_by',
    'approved_at',
])]
class PurchaseOrder extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'order_date' => 'date',
            'due_date' => 'date',
            'expected_date' => 'date',
            'subtotal' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'shipping_charge' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'due_amount' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function invoiceDocument(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'invoice_document_asset_id');
    }

    public function additionalDocument(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'additional_document_asset_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PurchaseOrderItem::class);
    }
}

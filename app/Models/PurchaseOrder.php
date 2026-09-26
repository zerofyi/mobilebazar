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
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'store_id',
    'identity',
    'bill_type',
    'po_number',
    'vendor_invoice_no',
    'vendor_type',
    'vendor_id',
    'type',
    'status',
    'order_date',
    'due_date',
    'expected_date',
    'is_gst_billed',
    'is_intra_state',
    'subtotal',
    'tax_amount',
    'discount_amount',
    'shipping_charge',
    'grand_total',
    'paid_amount',
    'due_amount',
    'payment_status',
    'payment_mode',
    'invoice_document_path',
    'additional_document_path',
    'notes',
    'created_by',
    'approved_by',
    'approved_at',
    'idempotency_key',
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
            'approved_at' => 'datetime',
            'is_gst_billed' => 'boolean',
            'is_intra_state' => 'boolean',
            'subtotal' => 'decimal:2',
            'tax_amount' => 'decimal:2',
            'discount_amount' => 'decimal:2',
            'shipping_charge' => 'decimal:2',
            'grand_total' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'due_amount' => 'decimal:2',
        ];
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

    /**
     * Polymorphic vendor: Supplier (registered B2B) or Customer (unregistered seller).
     */
    public function vendor(): MorphTo
    {
        return $this->morphTo();
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

    /*
    |--------------------------------------------------------------------------
    | Vendor convenience accessors (BC for $po->supplier / $po->customer)
    |--------------------------------------------------------------------------
    */

    public function getSupplierAttribute(): ?Supplier
    {
        $vendor = $this->vendor;

        return $vendor instanceof Supplier ? $vendor : null;
    }

    public function getCustomerAttribute(): ?Customer
    {
        $vendor = $this->vendor;

        return $vendor instanceof Customer ? $vendor : null;
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

    public function scopeDirect(Builder $query): Builder
    {
        return $query->where('type', 'direct');
    }

    public function scopeCompleted(Builder $query): Builder
    {
        return $query->where('status', 'completed');
    }
}

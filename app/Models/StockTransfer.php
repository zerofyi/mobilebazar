<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

#[Fillable([
    'uuid',
    'transfer_number',
    'from_store_id',
    'to_store_id',
    'sale_invoice_id',
    'purchase_order_id',
    'status',
    'dispatched_at',
    'received_at',
    'created_by',
])]
class StockTransfer extends Model
{
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'from_store_id' => 'integer',
            'to_store_id' => 'integer',
            'sale_invoice_id' => 'integer',
            'purchase_order_id' => 'integer',
            'created_by' => 'integer',
            'dispatched_at' => 'datetime',
            'received_at' => 'datetime',
        ];
    }

    public function fromStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'from_store_id');
    }

    public function toStore(): BelongsTo
    {
        return $this->belongsTo(Store::class, 'to_store_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    /** The sale issued by the source store for this transfer. */
    public function saleInvoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'sale_invoice_id');
    }

    /** The purchase booked by the target store for this transfer. */
    public function purchaseOrder(): BelongsTo
    {
        return $this->belongsTo(PurchaseOrder::class, 'purchase_order_id');
    }

    // No items() relation: the transfer is a bridge only — items and prices
    // live on the linked sale invoice and purchase order, so credit notes
    // and debit notes work through the existing flows. (stock_transfer_items
    // was dropped in 2026_10_22_000001.)
}

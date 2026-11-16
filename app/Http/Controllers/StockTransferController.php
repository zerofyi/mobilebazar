<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\AccountingException;
use App\Exceptions\MonthLockedException;
use App\Http\Requests\Billing\StoreStockTransferRequest;
use App\Http\Requests\Billing\UpdateStockTransferRequest;
use App\Models\CreditNote;
use App\Models\DebitNote;
use App\Models\Invoice;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\SaleService;
use App\Services\StockTransferService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Stock transfer: a sale in this store + a purchase in the target store,
 * posted atomically by StockTransferService. The transfer record is only a
 * bridge between the two documents.
 */
class StockTransferController extends Controller
{
    public function __construct(
        private readonly StockTransferService $transfers,
        private readonly SaleService $sales,
    ) {}

    public function index(): Response
    {
        $store = $this->ownedStore();

        $transfers = StockTransfer::query()
            ->with([
                'fromStore:id,name,code',
                'toStore:id,name,code',
                'saleInvoice:id,uuid,invoice_number,invoice_date,grand_total,paid_amount,due_amount,payment_status',
                'purchaseOrder:id,uuid,po_number,order_date,grand_total,paid_amount,due_amount,payment_status',
            ])
            ->where(fn ($q) => $q->where('from_store_id', $store->id)->orWhere('to_store_id', $store->id))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Billing/StockTransfer/Index', [
            'transfers' => $transfers->through(fn (StockTransfer $t) => $this->serializeRow($t, $store->id)),
            'canCreate' => Auth::user()->can('transfers.create'),
        ]);
    }

    /**
     * The transfer POS: the regular sale screen, with the party restricted
     * to suppliers that have a store attached.
     */
    public function create(): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $attachedSuppliers = Supplier::query()
            ->where('store_id', $store->id)
            ->where('is_active', true)
            ->whereNotNull('linked_store_id')
            ->with('linkedStore:id,name,code')
            ->orderBy('name')
            ->get()
            ->map(fn (Supplier $s) => [
                'id'          => $s->id,
                'name'        => $s->company_name ?: $s->name,
                'phone'       => $s->phone,
                'gstin'       => $s->gstin,
                'linked_store' => $s->linkedStore ? [
                    'id'   => $s->linkedStore->id,
                    'name' => $s->linkedStore->name,
                    'code' => $s->linkedStore->code,
                ] : null,
            ])
            ->filter(fn ($s) => $s['linked_store'] !== null)
            ->values();

        return Inertia::render('Billing/StockTransfer/Create', [
            'store' => [
                'id'                => $store->id,
                'code'              => $store->code,
                'name'              => $store->name,
                'gstin'             => $store->gstin,
                'is_gst_registered' => (bool) $store->is_gst_registered,
                'state_code'        => $store->gstin ? substr($store->gstin, 0, 2) : $store->address?->state_code,
            ],
            'attachedSuppliers'   => $attachedSuppliers,
            'initialInvoiceNumber' => $this->sales->previewInvoiceNumber($store->id),
            'today'               => $store->businessToday(),
        ]);
    }

    /**
     * Post the transfer. PIN-gated — money and stock move in two stores.
     */
    public function store(StoreStockTransferRequest $request): RedirectResponse
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $pinData = $request->validate([
            'security_pin' => ['required', 'string', 'size:6'],
        ]);
        $this->verifySecurityPin($store, $pinData['security_pin']);

        try {
            $transfer = $this->transfers->transfer($store, $user, $request->validated());
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors())->withInput();
        } catch (MonthLockedException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        } catch (AccountingException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        }

        return redirect()
            ->route('app.transfers.show', $transfer->uuid)
            ->with('success', 'Stock transfer completed: '
                . $transfer->transfer_number . ' — sale '
                . $transfer->saleInvoice->invoice_number . ' + purchase '
                . $transfer->purchaseOrder->po_number . '.');
    }

    public function show(string $transfer): Response
    {
        $store = $this->ownedStore();

        $row = StockTransfer::query()
            ->with([
                'fromStore:id,name,code',
                'toStore:id,name,code',
                'createdBy:id,name',
                'saleInvoice',
                'purchaseOrder',
            ])
            ->where('uuid', $transfer)
            ->where(fn ($q) => $q->where('from_store_id', $store->id)->orWhere('to_store_id', $store->id))
            ->firstOrFail();

        $invoice = $row->saleInvoice;
        $purchase = $row->purchaseOrder;

        return Inertia::render('Billing/StockTransfer/Show', [
            'transfer' => [
                'uuid'            => $row->uuid,
                'transfer_number' => $row->transfer_number,
                'status'          => $row->status,
                'direction'       => $row->from_store_id === $store->id ? 'outgoing' : 'incoming',
                'from_store'      => $row->fromStore ? ['id' => $row->fromStore->id, 'name' => $row->fromStore->name, 'code' => $row->fromStore->code] : null,
                'to_store'        => $row->toStore ? ['id' => $row->toStore->id, 'name' => $row->toStore->name, 'code' => $row->toStore->code] : null,
                'can_edit'        => Auth::user()->can('transfers.create')
                    && $row->from_store_id === $store->id
                    && $invoice
                    && ! CreditNote::where('invoice_id', $invoice->id)->where('status', 'issued')->exists()
                    && $purchase
                    && ! DebitNote::where('purchase_order_id', $purchase->id)->where('status', 'issued')->exists(),
                'can_delete'      => Auth::user()->can('transfers.create')
                    && $row->from_store_id === $store->id
                    && $row->status === 'completed'
                    && $invoice
                    && ! CreditNote::where('invoice_id', $invoice->id)->where('status', 'issued')->exists()
                    && $purchase
                    && ! DebitNote::where('purchase_order_id', $purchase->id)->where('status', 'issued')->exists(),
                'created_by'      => $row->createdBy?->name,
                'created_at'      => $row->created_at?->toIso8601String(),
                'dispatched_at'   => $row->dispatched_at?->toIso8601String(),
                'received_at'     => $row->received_at?->toIso8601String(),
                'sale'            => $invoice ? [
                    'uuid'           => $invoice->uuid,
                    'invoice_number' => $invoice->invoice_number,
                    'invoice_date'   => $invoice->invoice_date?->toDateString(),
                    'grand_total'    => (float) $invoice->grand_total,
                    'paid_amount'    => (float) $invoice->paid_amount,
                    'due_amount'     => (float) $invoice->due_amount,
                    'payment_status' => $invoice->payment_status,
                    'is_own'         => $invoice->store_id === $store->id,
                    'has_credit_note' => CreditNote::where('invoice_id', $invoice->id)->exists(),
                ] : null,
                'purchase'        => $purchase ? [
                    'uuid'           => $purchase->uuid,
                    'po_number'      => $purchase->po_number,
                    'bill_type'      => $purchase->bill_type,
                    'order_date'     => $purchase->order_date?->toDateString(),
                    'grand_total'    => (float) $purchase->grand_total,
                    'paid_amount'    => (float) $purchase->paid_amount,
                    'due_amount'     => (float) $purchase->due_amount,
                    'payment_status' => $purchase->payment_status,
                    'is_own'         => $purchase->store_id === $store->id,
                    'has_debit_note' => DebitNote::where('purchase_order_id', $purchase->id)->exists(),
                ] : null,
            ],
        ]);
    }

    /**
     * The transfer edit screen: the same POS as create, hydrated with the
     * posted sale. Only the SOURCE store can edit — the sale lives there,
     * and the service re-posts the target purchase to match. The party
     * (target store) is locked; lines can be re-priced or removed, never
     * added (the service enforces that too).
     */
    public function edit(string $transfer): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $row = StockTransfer::query()
            ->with(['toStore:id,name,code'])
            ->where('uuid', $transfer)
            ->where('from_store_id', $store->id)
            ->firstOrFail();

        $invoice = Invoice::with([
            'party',
            'payments',
            'items.productVariant:id,product_id,variant_name,sku,selling_price,min_selling_price',
            'items.productVariant.product:id,name,hsn_code,tax_category_id',
            'items.productVariant.product.taxCategory:id,tax_percent',
            'items.stockUnit:id,product_variant_id,manual_item_name,imei1,imei2,serial_number,device_condition,overall_health,landed_cost,is_margin_scheme,selling_price,wholesale_price,remaining_warranty,status',
            'items.batchAllocations.stockBatch:id,batch_number,product_condition,remaining_warranty',
        ])
            ->where('id', $row->sale_invoice_id)
            ->firstOrFail();

        return Inertia::render('Billing/StockTransfer/Edit', [
            'store' => [
                'id'                => $store->id,
                'code'              => $store->code,
                'name'              => $store->name,
                'gstin'             => $store->gstin,
                'is_gst_registered' => (bool) $store->is_gst_registered,
                'state_code'        => $store->gstin ? substr($store->gstin, 0, 2) : $store->address?->state_code,
            ],
            'transfer' => [
                'uuid'            => $row->uuid,
                'transfer_number' => $row->transfer_number,
                'to_store'        => $row->toStore ? [
                    'id'   => $row->toStore->id,
                    'name' => $row->toStore->name,
                    'code' => $row->toStore->code,
                ] : null,
            ],
            'invoice' => $this->serializeInvoiceForEdit($invoice, $store),
        ]);
    }

    /**
     * Save the transfer edit. PIN-gated, like create — money and stock
     * move in two stores.
     */
    public function update(UpdateStockTransferRequest $request, string $transfer): RedirectResponse
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $row = StockTransfer::query()
            ->where('uuid', $transfer)
            ->where('from_store_id', $store->id)
            ->firstOrFail();

        $pinData = $request->validate([
            'security_pin' => ['required', 'string', 'size:6'],
        ]);
        $this->verifySecurityPin($store, $pinData['security_pin']);

        try {
            $updated = $this->transfers->updateTransfer($store, $user, $row, $request->validated());
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors())->withInput();
        } catch (MonthLockedException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        } catch (AccountingException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        }

        return redirect()
            ->route('app.transfers.show', $updated->uuid)
            ->with('success', 'Stock transfer updated: '
                . $updated->transfer_number . ' — sale '
                . $updated->saleInvoice->invoice_number . ' (revision ' . $updated->saleInvoice->revision . ') + purchase '
                . $updated->purchaseOrder->po_number . ' (revision ' . $updated->purchaseOrder->revision . ').');
    }

    /**
     * Delete a transfer outright — full revert of both halves (see
     * StockTransferService::deleteTransfer). PIN-gated like create/edit,
     * source store only, and only while every transferred item is still
     * untouched in the target store and no money moved outside the
     * transfer settlement — the service enforces all of it.
     */
    public function destroy(Request $request, string $transfer): RedirectResponse
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $row = StockTransfer::query()
            ->where('uuid', $transfer)
            ->where('from_store_id', $store->id)
            ->firstOrFail();

        $pinData = $request->validate([
            'security_pin' => ['required', 'string', 'size:6'],
        ]);
        $this->verifySecurityPin($store, $pinData['security_pin']);

        $number = $row->transfer_number;

        try {
            $this->transfers->deleteTransfer($store, $user, $row);
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors())->withInput();
        } catch (MonthLockedException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        } catch (AccountingException $e) {
            return back()->withErrors(['transfer' => $e->getMessage()])->withInput();
        }

        return redirect()
            ->route('app.transfers.index')
            ->with('success', 'Stock transfer deleted: ' . $number
                . ' — sale and purchase fully reversed, stock restored to '
                . $store->name . '.');
    }

    /**
     * Serialize the transfer's sale for the edit form — the same shape the
     * sale edit screen hydrates from (SaleEntryController::serializeForEdit),
     * so the POS components behave identically.
     */
    private function serializeInvoiceForEdit(Invoice $invoice, Store $store): array
    {
        $party = $invoice->party;
        $partyType = $invoice->party_type === \App\Models\Supplier::class ? 'supplier' : 'customer';

        $lines = [];
        foreach ($invoice->items as $item) {
            $variant  = $item->productVariant;
            $product  = $variant?->product;
            $isSer    = (bool) $item->stock_unit_id;
            $taxPct   = (float) $item->tax_pct;

            $base = [
                'product_variant_id' => $item->product_variant_id,
                'manual_item_name'   => $item->manual_item_name,
                'product_name'       => $item->manual_item_name
                    ?? ($product ? trim($product->name . ($variant ? ' · ' . $variant->variant_name : '')) : '—'),
                'sku'                => $variant?->sku ?? '',
                'hsn_code'           => $product?->hsn_code,
                'is_serialized'      => $isSer,
                'qty'                => (int) $item->quantity,
                'unit_price'         => (float) $item->unit_price,
                'retail_price'       => (float) $item->unit_price,
                'min_selling_price'  => (float) ($variant?->min_selling_price ?? 0),
                'warranty'           => $item->warranty,
                'discount_amount'    => (float) $item->discount_amount,
                'tax_type'           => $item->tax_type,
                'tax_pct'            => $taxPct,
                'landed_cost_preview'      => (float) ($item->landed_cost ?? 0),
                'is_margin_scheme_preview' => (bool) $item->is_margin_scheme,
                'img'                => null,
            ];

            if ($isSer && $item->stockUnit) {
                $u = $item->stockUnit;
                $meta = [
                    'id'               => $u->id,
                    'variant_id'       => $u->product_variant_id,
                    'name'             => $u->manual_item_name ?? $base['product_name'],
                    'imei1'            => $u->imei1,
                    'imei2'            => $u->imei2,
                    'serial_number'    => $u->serial_number,
                    'device_condition' => $u->device_condition,
                    'overall_health'   => $u->overall_health,
                    'landed_cost'      => (float) $u->landed_cost,
                    'is_margin_scheme' => (bool) $u->is_margin_scheme,
                    'selling_price'    => $u->selling_price !== null ? (float) $u->selling_price : null,
                    'wholesale_price'  => $u->wholesale_price !== null ? (float) $u->wholesale_price : null,
                    'variant_price'    => (float) ($variant?->selling_price ?? 0),
                    'tax_pct'          => $taxPct,
                    'warranty'         => $u->remaining_warranty,
                ];
                $lines[] = array_merge($base, [
                    'unit_ids'            => [$u->id],
                    'unit_metas'          => [$meta],
                    'units_pool'          => [],
                    'available_qty'       => 1,
                    'preferred_batch_id'  => null,
                    'batch_label'         => null,
                    'batch_retail_price'  => null,
                    'batch_wholesale_price' => null,
                ]);
            } else {
                $alloc = $item->batchAllocations->first();
                $batch = $alloc?->stockBatch;
                $lines[] = array_merge($base, [
                    'unit_ids'            => [],
                    'unit_metas'          => [],
                    'units_pool'          => [],
                    // A transfer edit can only give stock back, never add:
                    // the cap is exactly what this invoice transferred (the
                    // service rejects a larger quantity as well).
                    'available_qty'       => (int) $item->quantity,
                    'preferred_batch_id'  => $batch?->id,
                    'batch_label'         => $batch ? ($batch->batch_number . ' · ' . $batch->product_condition) : null,
                    'batch_retail_price'  => null,
                    'batch_wholesale_price' => null,
                ]);
            }
        }

        return [
            'uuid'            => $invoice->uuid,
            'invoice_number'  => $invoice->invoice_number,
            'invoice_date'    => $invoice->invoice_date->format('Y-m-d'),
            'party'           => $party ? [
                'type'  => $partyType,
                'id'    => $party->id,
                'name'  => $party->name ?? $party->company_name ?? '—',
                'phone' => $party->phone ?? null,
            ] : null,
            'saleMode'        => $invoice->invoice_type,
            'taxMovement'     => $invoice->is_intra_state ? 'intra' : 'inter',
            'isGstBilled'     => (bool) $invoice->is_gst_billed,
            'billDiscount'    => (float) $invoice->discount_amount,
            'shippingCharge'  => (float) $invoice->shipping_charge,
            'paidAmount'      => (float) $invoice->paid_amount,
            'paidInFull'      => $invoice->payment_status === 'paid' && (float) $invoice->due_amount <= 0.009,
            'paymentMode'     => $invoice->payment_mode,
            'payments'        => $invoice->payments->map(fn ($pay) => [
                'id'                => (string) $pay->id,
                'mode'              => $pay->payment_mode,
                'amount'            => (float) $pay->amount,
                'reference'         => $pay->reference,
                'purchase_order_id' => $pay->purchase_order_id,
            ])->values()->all(),
            'notes'           => $invoice->notes ?? '',
            'lines'           => $lines,
        ];
    }

    private function serializeRow(StockTransfer $t, int $currentStoreId): array
    {
        return [
            'uuid'            => $t->uuid,
            'transfer_number' => $t->transfer_number,
            'status'          => $t->status,
            'direction'       => $t->from_store_id === $currentStoreId ? 'outgoing' : 'incoming',
            'from_store'      => $t->fromStore ? ['id' => $t->fromStore->id, 'name' => $t->fromStore->name, 'code' => $t->fromStore->code] : null,
            'to_store'        => $t->toStore ? ['id' => $t->toStore->id, 'name' => $t->toStore->name, 'code' => $t->toStore->code] : null,
            'created_at'      => $t->created_at?->toIso8601String(),
            'sale'            => $t->saleInvoice ? [
                'uuid'           => $t->saleInvoice->uuid,
                'invoice_number' => $t->saleInvoice->invoice_number,
                'grand_total'    => (float) $t->saleInvoice->grand_total,
                'payment_status' => $t->saleInvoice->payment_status,
            ] : null,
            'purchase'        => $t->purchaseOrder ? [
                'uuid'      => $t->purchaseOrder->uuid,
                'po_number' => $t->purchaseOrder->po_number,
            ] : null,
        ];
    }

    private function ownedStore(): Store
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        return $store;
    }

    private function verifySecurityPin(Store $store, ?string $pin): void
    {
        if (empty($store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Set a security PIN for this store first (Store settings → Security PIN).',
            ]);
        }
        if (empty($pin) || ! Hash::check($pin, $store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Incorrect security PIN.',
            ]);
        }
    }
}

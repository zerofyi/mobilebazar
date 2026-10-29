<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Exceptions\AccountingException;
use App\Exceptions\MonthLockedException;
use App\Http\Requests\Billing\StoreStockTransferRequest;
use App\Models\CreditNote;
use App\Models\DebitNote;
use App\Models\StockTransfer;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\SaleService;
use App\Services\StockTransferService;
use Illuminate\Http\RedirectResponse;
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

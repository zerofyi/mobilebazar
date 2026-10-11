<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Billing\StoreDebitNoteRequest;
use App\Models\DebitNote;
use App\Models\PurchaseOrder;
use App\Models\StockBatch;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\DebitNoteService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Purchase returns / debit notes.
 *
 * LIMITATION (by design): debit_notes.supplier_id is a non-polymorphic FK to
 * suppliers, so returns are supported for Supplier vendors only. A purchase
 * billed by a Customer (unregistered vendor) is rejected with a 422 from
 * DebitNoteService.
 */
class DebitNoteController extends Controller
{
    public function __construct(
        private readonly DebitNoteService $debitNoteService,
    ) {}

    /*
    |--------------------------------------------------------------------------
    | index — debit note list
    |--------------------------------------------------------------------------
    */
    public function index(): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $filters = request()->only(['search', 'date_from', 'date_to']);

        $notes = DebitNote::with(['supplier:id,name,company_name', 'purchaseOrder:id,uuid,po_number'])
            ->withCount('items')
            ->where('store_id', $store->id)
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                ->where('debit_note_number', 'like', "%{$v}%")
                ->orWhere('reason', 'like', "%{$v}%")
                ->orWhereHas('supplier', fn ($q3) => $q3
                    ->where('name', 'like', "%{$v}%")
                    ->orWhere('company_name', 'like', "%{$v}%"))
                ->orWhereHas('purchaseOrder', fn ($q3) => $q3->where('po_number', 'like', "%{$v}%"))))
            ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->whereDate('debit_note_date', '>=', $v))
            ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->whereDate('debit_note_date', '<=', $v))
            ->latest('debit_note_date')->latest('id')
            ->paginate(25)
            ->withQueryString();

        $summary = [
            'note_count'   => $notes->total(),
            'total_returned' => (float) DebitNote::where('store_id', $store->id)->sum('grand_total'),
            'total_tax_reversed' => (float) DebitNote::where('store_id', $store->id)->sum('tax_amount'),
        ];

        return Inertia::render('App/DebitNotes/Index', [
            'notes'   => $notes->through(fn (DebitNote $dn) => $this->serializeForIndex($dn)),
            'summary' => $summary,
            'filters' => $filters,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | create — return builder; ?purchase=<uuid> preloads one purchase
    |--------------------------------------------------------------------------
    */
    public function create(Request $request): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $preselected = null;
        if ($request->filled('purchase')) {
            $po = PurchaseOrder::with('vendor')
                ->where('store_id', $store->id)
                ->where('uuid', $request->query('purchase'))
                ->first();

            if ($po) {
                $preselected = $this->purchaseStockPayload($store, $po);
            }
        }

        return Inertia::render('App/DebitNotes/Create', [
            'preselectedPurchase' => $preselected,
            'defaultDate'         => now()->toDateString(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | store — validate → service → redirect
    |--------------------------------------------------------------------------
    */
    public function store(StoreDebitNoteRequest $request): RedirectResponse
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $dn = $this->debitNoteService->createDebitNote(
            store: $store,
            user:  $user,
            data:  $request->validated(),
        );

        return redirect()
            ->route('app.debit-notes.show', $dn->uuid)
            ->with('flash', ['type' => 'success', 'message' => "Debit note {$dn->debit_note_number} issued."]);
    }

    /*
    |--------------------------------------------------------------------------
    | show — debit note document
    |--------------------------------------------------------------------------
    */
    public function show(string $debitNote): Response
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $dn = DebitNote::with([
            'supplier:id,name,company_name,phone,gstin',
            'purchaseOrder:id,uuid,po_number,order_date,vendor_invoice_no',
            'createdBy:id,name',
            'items.productVariant:id,variant_name,sku',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $debitNote)
            ->firstOrFail();

        return Inertia::render('App/DebitNotes/Show', [
            'debitNote' => $this->serializeForShow($dn),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | JSON: purchase search (returnable purchases for this store)
    |--------------------------------------------------------------------------
    */
    public function searchPurchases(Request $request): JsonResponse
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $q = trim((string) $request->query('q', ''));

        $purchases = PurchaseOrder::with('vendor')
            ->where('store_id', $store->id)
            ->where('status', 'completed')
            ->where('vendor_type', Supplier::class)
            ->when(strlen($q) >= 2, fn ($qb) => $qb->where(fn ($w) => $w
                ->where('po_number', 'like', "%{$q}%")
                ->orWhere('vendor_invoice_no', 'like', "%{$q}%")
                ->orWhereHasMorph('vendor', [Supplier::class], fn ($q2) => $q2
                    ->where('name', 'like', "%{$q}%")
                    ->orWhere('company_name', 'like', "%{$q}%"))))
            ->latest('order_date')->latest('id')
            ->limit(15)
            ->get()
            ->map(fn (PurchaseOrder $po) => [
                'id'               => $po->id,
                'uuid'             => $po->uuid,
                'po_number'        => $po->po_number,
                'order_date'       => $po->order_date?->toDateString(),
                'grand_total'      => (float) $po->grand_total,
                'vendor_invoice_no' => $po->vendor_invoice_no,
                'supplier_name'    => $po->vendor?->company_name ?: $po->vendor?->name,
            ]);

        return response()->json(['purchases' => $purchases]);
    }

    /*
    |--------------------------------------------------------------------------
    | JSON: returnable stock for one purchase (available units + batches)
    |--------------------------------------------------------------------------
    */
    public function purchaseStock(string $purchase): JsonResponse
    {
        $user  = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        $po = PurchaseOrder::where('store_id', $store->id)
            ->where('uuid', $purchase)
            ->firstOrFail();

        return response()->json($this->purchaseStockPayload($store, $po));
    }

    /**
     * Purchase + its returnable stock, shaped for the Create page.
     */
    private function purchaseStockPayload(Store $store, PurchaseOrder $po): array
    {
        $po->loadMissing('vendor');

        $isSupplier = $po->vendor_type === Supplier::class;

        // Tax % per originating PO line — the return reverses each line's ITC.
        $itemTax = $po->items()->pluck('tax_pct', 'id')->map(fn ($v) => (float) $v);

        $units = $isSupplier
            ? StockUnit::where('store_id', $store->id)
                ->where('purchase_order_id', $po->id)
                ->where('status', 'available')
                ->orderBy('id')
                ->get(['id', 'product_variant_id', 'purchase_order_item_id', 'manual_item_name', 'imei1', 'imei2', 'serial_number', 'device_condition', 'base_cost', 'landed_cost'])
                ->map(fn (StockUnit $u) => [
                    'id'               => $u->id,
                    'variant_id'       => $u->product_variant_id,
                    'name'             => $u->manual_item_name ?? '—',
                    'imei1'            => $u->imei1,
                    'imei2'            => $u->imei2,
                    'serial_number'    => $u->serial_number,
                    'device_condition' => $u->device_condition,
                    'base_cost'        => (float) $u->base_cost,
                    'landed_cost'      => (float) $u->landed_cost,
                    'tax_pct'          => (float) ($itemTax[$u->purchase_order_item_id] ?? 0),
                ])->all()
            : [];

        $batches = $isSupplier
            ? StockBatch::where('store_id', $store->id)
                ->where('purchase_order_id', $po->id)
                ->where('remaining_qty', '>', 0)
                ->orderBy('id')
                ->get(['id', 'product_variant_id', 'purchase_order_item_id', 'manual_item_name', 'batch_number', 'remaining_qty', 'received_qty', 'base_cost', 'landed_cost'])
                ->map(fn (StockBatch $b) => [
                    'id'            => $b->id,
                    'variant_id'    => $b->product_variant_id,
                    'name'          => $b->manual_item_name ?? '—',
                    'batch_number'  => $b->batch_number,
                    'remaining_qty' => (int) $b->remaining_qty,
                    'received_qty'  => (int) $b->received_qty,
                    'base_cost'     => (float) $b->base_cost,
                    'landed_cost'   => (float) $b->landed_cost,
                    'tax_pct'       => (float) ($itemTax[$b->purchase_order_item_id] ?? 0),
                ])->all()
            : [];

        return [
            'purchase' => [
                'id'                => $po->id,
                'uuid'              => $po->uuid,
                'po_number'         => $po->po_number,
                'order_date'        => $po->order_date?->toDateString(),
                'grand_total'       => (float) $po->grand_total,
                'vendor_invoice_no' => $po->vendor_invoice_no,
                'supplier_name'     => $po->vendor?->company_name ?: $po->vendor?->name,
                'is_supplier'       => $isSupplier,
            ],
            'units'   => $units,
            'batches' => $batches,
        ];
    }

    private function serializeForIndex(DebitNote $dn): array
    {
        $s = $dn->supplier;

        return [
            'id'                => $dn->id,
            'uuid'              => $dn->uuid,
            'debit_note_number' => $dn->debit_note_number,
            'debit_note_date'   => $dn->debit_note_date?->format('Y-m-d'),
            'status'            => $dn->status,
            'reason'            => $dn->reason,
            'subtotal'          => (float) $dn->subtotal,
            'tax_amount'        => (float) $dn->tax_amount,
            'grand_total'       => (float) $dn->grand_total,
            'item_count'        => (int) ($dn->items_count ?? 0),
            'supplier_name'     => $s ? ($s->company_name ?: $s->name) : '—',
            'po_number'         => $dn->purchaseOrder?->po_number,
        ];
    }

    private function serializeForShow(DebitNote $dn): array
    {
        $s = $dn->supplier;

        return [
            'id'                => $dn->id,
            'uuid'              => $dn->uuid,
            'debit_note_number' => $dn->debit_note_number,
            'debit_note_date'   => $dn->debit_note_date?->format('Y-m-d'),
            'status'            => $dn->status,
            'reason'            => $dn->reason,
            'notes'             => $dn->notes,
            'subtotal'          => (float) $dn->subtotal,
            'tax_amount'        => (float) $dn->tax_amount,
            'grand_total'       => (float) $dn->grand_total,
            'created_at'        => $dn->created_at?->toIso8601String(),
            'created_by'        => $dn->createdBy?->name,
            'supplier'          => $s ? [
                'name'   => $s->company_name ?: $s->name,
                'phone'  => $s->phone,
                'gstin'  => $s->gstin,
            ] : null,
            'purchase_order'    => $dn->purchaseOrder ? [
                'uuid'              => $dn->purchaseOrder->uuid,
                'po_number'         => $dn->purchaseOrder->po_number,
                'order_date'        => $dn->purchaseOrder->order_date?->toDateString(),
                'vendor_invoice_no' => $dn->purchaseOrder->vendor_invoice_no,
            ] : null,
            'items' => $dn->items->map(fn ($item) => [
                'id'           => $item->id,
                'product_name' => $item->productVariant?->variant_name ?? $item->manual_item_name ?? '—',
                'sku'          => $item->productVariant?->sku,
                'quantity'     => (int) $item->quantity,
                'unit_cost'    => (float) $item->unit_cost,
                'tax_pct'      => (float) $item->tax_pct,
                'tax_amount'   => (float) $item->tax_amount,
                'line_total'   => (float) $item->line_total,
            ])->values()->all(),
        ];
    }
}

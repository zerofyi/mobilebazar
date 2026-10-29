<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Billing\StoreSupplierPaymentRequest;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\SupplierPaymentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

class SupplierPaymentController extends Controller
{
    public function __construct(
        private readonly SupplierPaymentService $paymentService
    ) {}

    /*
    |--------------------------------------------------------------------------
    | index — supplier payment history
    |--------------------------------------------------------------------------
    */
    public function index(): Response
    {
        $store = $this->ownedStore();

        $filters = request()->only(['search', 'supplier_id', 'payment_mode', 'date_from', 'date_to']);

        $base = Payment::with(['payable.vendor', 'payer', 'createdBy'])
            ->where('store_id', $store->id)
            ->where('payable_type', PurchaseOrder::class)
            ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                ->where('txn_reference', 'like', "%{$v}%")
                ->orWhereHasMorph('payable', [PurchaseOrder::class], fn ($q3) => $q3->where('po_number', 'like', "%{$v}%"))))
            ->when($filters['supplier_id'] ?? null, fn ($q, $v) => $q
                ->where('payer_type', Supplier::class)->where('payer_id', $v))
            ->when($filters['payment_mode'] ?? null, fn ($q, $v) => $q->where('payment_mode', $v))
            ->when($filters['date_from'] ?? null, fn ($q, $v) => $q->whereDate('paid_at', '>=', $v))
            ->when($filters['date_to'] ?? null, fn ($q, $v) => $q->whereDate('paid_at', '<=', $v))
            ->latest('paid_at')->latest('id');

        $payments = (clone $base)->paginate(25)->withQueryString();

        $summary = [
            'payment_count' => $payments->total(),
            'total_paid'    => (float) (clone $base)->sum('amount'),
        ];

        return Inertia::render('App/SupplierPayments/Index', [
            'payments'  => $payments->through(fn (Payment $p) => $this->serializePayment($p)),
            'summary'   => $summary,
            'filters'   => $filters,
            'suppliers' => $this->suppliersWithDues($store),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | create — record a supplier payment
    |--------------------------------------------------------------------------
    */
    public function create(): Response
    {
        $store = $this->ownedStore();

        $preloadUuid   = request()->query('purchase');
        $supplierId    = request()->query('supplier');
        $outstanding   = $this->outstandingPos($store);

        $preloaded = null;
        if ($preloadUuid) {
            $preloaded = $outstanding->firstWhere('uuid', (string) $preloadUuid)?->uuid;
        }

        $preselect = [];
        if ($supplierId) {
            $preselect = $outstanding
                ->filter(fn (PurchaseOrder $po) => $po->vendor_type === Supplier::class && (int) $po->vendor_id === (int) $supplierId)
                ->map(fn (PurchaseOrder $po) => $po->uuid)
                ->values()->all();
        }

        return Inertia::render('App/SupplierPayments/Create', [
            'outstandingPos' => $outstanding->map(fn (PurchaseOrder $po) => $this->serializePoOption($po))->values(),
            'preloaded'      => $preloaded,
            'preselect'      => $preselect,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | store — validate and record the payment(s)
    |--------------------------------------------------------------------------
    */
    public function store(StoreSupplierPaymentRequest $request): JsonResponse|RedirectResponse
    {
        $store = $this->ownedStore();
        $user  = Auth::user();

        $payments = $this->paymentService->recordPayment($store, $user, $request->validated());

        $payload = [
            'payments' => array_map(fn (Payment $p) => $this->serializePayment($p->load(['payable.vendor', 'payer', 'createdBy'])), $payments),
            'message'  => count($payments) === 1
                ? 'Payment recorded.'
                : count($payments) . ' payments recorded.',
        ];

        if ($request->wantsJson()) {
            return response()->json($payload, 201);
        }

        return redirect()
            ->route('app.supplier-payments.index')
            ->with('success', $payload['message']);
    }

    /*
    |--------------------------------------------------------------------------
    | outstanding — per-supplier dues: totals + overdue/open PO lists
    |--------------------------------------------------------------------------
    */
    public function outstanding(Supplier $supplier): Response
    {
        $store = $this->ownedStore();

        abort_if((int) $supplier->store_id !== (int) $store->id, 404);

        $pos = PurchaseOrder::query()
            ->where('store_id', $store->id)
            ->where('vendor_type', Supplier::class)
            ->where('vendor_id', $supplier->id)
            ->where('status', '!=', 'draft')
            ->orderBy('due_date')
            ->orderBy('order_date')
            ->get();

        $today = $store->businessToday();

        $overdue = $pos->filter(fn (PurchaseOrder $po) =>
            (float) $po->due_amount > 0 && $po->due_date && $po->due_date->toDateString() < $today)->values();

        $open = $pos->filter(fn (PurchaseOrder $po) => (float) $po->due_amount > 0)->values();

        return Inertia::render('App/SupplierPayments/Outstanding', [
            'supplier' => [
                'id'           => $supplier->id,
                'name'         => $supplier->name,
                'company_name' => $supplier->company_name,
                'phone'        => $supplier->phone,
            ],
            'summary' => [
                'total_purchased' => (float) $pos->sum('grand_total'),
                'total_paid'      => (float) $pos->sum('paid_amount'),
                'total_due'       => (float) $pos->sum('due_amount'),
                'overdue_count'   => $overdue->count(),
                'overdue_total'   => (float) $overdue->sum('due_amount'),
                'open_count'      => $open->count(),
            ],
            'overduePos' => $overdue->map(fn (PurchaseOrder $po) => $this->serializePoRow($po))->values(),
            'openPos'    => $open->map(fn (PurchaseOrder $po) => $this->serializePoRow($po))->values(),
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    private function ownedStore(): Store
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        return $store;
    }

    /** Outstanding (non-draft, due > 0) POs for the payment selector. */
    private function outstandingPos(Store $store)
    {
        return PurchaseOrder::with(['vendor'])
            ->where('store_id', $store->id)
            ->where('status', '!=', 'draft')
            ->where('due_amount', '>', 0)
            ->orderByRaw('due_date IS NULL')
            ->orderBy('due_date')
            ->orderBy('order_date')
            ->get();
    }

    private function serializePoOption(PurchaseOrder $po): array
    {
        return [
            'uuid'         => $po->uuid,
            'po_number'    => $po->po_number,
            'vendor_name'  => $this->vendorName($po),
            'order_date'   => $po->order_date?->toDateString(),
            'due_date'     => $po->due_date?->toDateString(),
            'grand_total'  => (float) $po->grand_total,
            'paid_amount'  => (float) $po->paid_amount,
            'due_amount'   => (float) $po->due_amount,
        ];
    }

    private function serializePoRow(PurchaseOrder $po): array
    {
        return [
            'uuid'           => $po->uuid,
            'po_number'      => $po->po_number,
            'order_date'     => $po->order_date?->toDateString(),
            'due_date'       => $po->due_date?->toDateString(),
            'payment_status' => $po->payment_status,
            'grand_total'    => (float) $po->grand_total,
            'paid_amount'    => (float) $po->paid_amount,
            'due_amount'     => (float) $po->due_amount,
        ];
    }

    private function serializePayment(Payment $payment): array
    {
        /** @var PurchaseOrder|null $po */
        $po = $payment->payable;

        return [
            'id'            => $payment->id,
            'uuid'          => $payment->uuid,
            'amount'        => (float) $payment->amount,
            'payment_mode'  => $payment->payment_mode,
            'txn_reference' => $payment->txn_reference,
            'status'        => $payment->status,
            'paid_at'       => $payment->paid_at?->toDateString(),
            'po_number'     => $po?->po_number,
            'po_uuid'       => $po?->uuid,
            'vendor_name'   => $this->vendorName($po),
            'recorded_by'   => $payment->createdBy?->name,
        ];
    }

    private function vendorName(?PurchaseOrder $po): ?string
    {
        if (! $po) {
            return null;
        }

        $vendor = $po->relationLoaded('vendor') ? $po->vendor : $po->vendor()->first();

        if ($vendor instanceof Supplier) {
            return $vendor->name ?: $vendor->company_name;
        }
        if ($vendor instanceof Customer) {
            return $vendor->name;
        }

        return null;
    }

    /** Suppliers with outstanding dues, for the index filter dropdown. */
    private function suppliersWithDues(Store $store): array
    {
        return Supplier::query()
            ->where('suppliers.store_id', $store->id)
            ->whereExists(fn ($q) => $q->selectRaw('1')->from('purchase_orders')
                ->whereColumn('purchase_orders.vendor_id', 'suppliers.id')
                ->where('purchase_orders.store_id', $store->id)
                ->where('purchase_orders.vendor_type', Supplier::class)
                ->where('purchase_orders.status', '!=', 'draft')
                ->where('purchase_orders.due_amount', '>', 0))
            ->orderBy('name')
            ->get(['id', 'name', 'company_name'])
            ->map(fn (Supplier $s) => [
                'id'   => $s->id,
                'name' => $s->name ?: $s->company_name,
            ])
            ->all();
    }
}

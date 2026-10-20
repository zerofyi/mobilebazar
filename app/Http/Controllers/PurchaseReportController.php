<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\PurchaseOrder;
use App\Models\PurchaseOrderItem;
use App\Models\Store;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Purchase reports — READ-ONLY. No writes, no journals.
 *
 * - register      → Purchase Register (date range / supplier / bill type, CSV export)
 * - itemHistory   → Item Purchase History per product variant (CSV export)
 * - payables      → Supplier Payables Summary (CSV export)
 */
class PurchaseReportController extends Controller
{
    private const CSV_CAP = 5000;

    /*
    |--------------------------------------------------------------------------
    | register — Purchase Register
    |--------------------------------------------------------------------------
    */
    public function register(Request $request): Response|StreamedResponse
    {
        $store = $this->resolveStore();

        $validated = $request->validate([
            'from'        => ['nullable', 'date'],
            'to'          => ['nullable', 'date'],
            'supplier_id' => ['nullable', 'integer'],
            'bill_type'   => ['nullable', Rule::in(['po', 'pv'])],
            'export'      => ['nullable', Rule::in(['csv'])],
        ]);

        $from = $validated['from'] ?? now()->startOfMonth()->toDateString();
        $to   = $validated['to'] ?? now()->toDateString();

        $query = $this->registerQuery($store, $from, $to, $validated['supplier_id'] ?? null, $validated['bill_type'] ?? null);

        if (($validated['export'] ?? null) === 'csv') {
            return $this->csvDownload(
                "purchase-register-{$from}-to-{$to}.csv",
                ['Date', 'PO Number', 'Vendor Bill No', 'Supplier', 'Bill Type', 'Subtotal', 'Tax', 'Grand Total', 'Paid', 'Due', 'Status'],
                $query->limit(self::CSV_CAP)->get()->map(fn (PurchaseOrder $po) => $this->registerCsvRow($po))->all(),
            );
        }

        $orders = (clone $query)
            ->latest('order_date')->latest('id')
            ->paginate(25)
            ->withQueryString()
            ->through(fn (PurchaseOrder $po) => $this->serializeRegisterRow($po));

        $summaryRow = (clone $query)
            ->selectRaw('COUNT(*) as total_count, SUM(subtotal) as subtotal, SUM(tax_amount) as tax_amount, SUM(grand_total) as grand_total, SUM(paid_amount) as paid_amount, SUM(due_amount) as due_amount')
            ->first();

        $summary = [
            'total_count'  => (int) ($summaryRow->total_count ?? 0),
            'subtotal'     => (float) ($summaryRow->subtotal ?? 0),
            'tax_amount'   => (float) ($summaryRow->tax_amount ?? 0),
            'grand_total'  => (float) ($summaryRow->grand_total ?? 0),
            'paid_amount'  => (float) ($summaryRow->paid_amount ?? 0),
            'due_amount'   => (float) ($summaryRow->due_amount ?? 0),
        ];

        $supplier = isset($validated['supplier_id'])
            ? Supplier::where('id', $validated['supplier_id'])->where('store_id', $store->id)->first()
            : null;

        return Inertia::render('App/Reports/Purchases/Register', [
            'orders'   => $orders,
            'summary'  => $summary,
            'filters'  => [
                'from'        => $from,
                'to'          => $to,
                'supplier_id' => $validated['supplier_id'] ?? null,
                'bill_type'   => $validated['bill_type'] ?? null,
            ],
            'supplier' => $supplier ? ['id' => $supplier->id, 'name' => $supplier->company_name ?: $supplier->name] : null,
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | itemHistory — Item Purchase History per product variant
    |--------------------------------------------------------------------------
    */
    public function itemHistory(Request $request): Response|StreamedResponse
    {
        $store = $this->resolveStore();

        $validated = $request->validate([
            'product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'export'             => ['nullable', Rule::in(['csv'])],
        ]);

        $variantId = $validated['product_variant_id'] ?? null;

        $rows = collect();
        $summary = [
            'last_cost'        => null,
            'lowest_cost'      => null,
            'highest_cost'     => null,
            'supplier_count'   => 0,
            'purchase_count'   => 0,
        ];
        $variant = null;

        if ($variantId) {
            $variant = \App\Models\ProductVariant::with('product:id,name')
                ->select('id', 'uuid', 'product_id', 'variant_name', 'sku')
                ->find($variantId);

            $query = $this->itemHistoryQuery($store, $variantId);

            if (($validated['export'] ?? null) === 'csv') {
                return $this->csvDownload(
                    "item-purchase-history-{$variantId}.csv",
                    ['Date', 'Supplier', 'PO Number', 'Qty', 'Unit Cost', 'Landed Cost'],
                    $query->limit(self::CSV_CAP)->get()->map(fn (PurchaseOrderItem $i) => $this->itemHistoryCsvRow($i))->all(),
                );
            }

            $items = (clone $query)->paginate(25)->withQueryString();

            $rows = $items->through(fn (PurchaseOrderItem $item) => $this->serializeItemHistoryRow($item));

            $all = (clone $query)->get(['purchase_order_items.id', 'purchase_order_items.unit_cost']);
            if ($all->isNotEmpty()) {
                // Query is already ordered by order_date desc → first() is the latest purchase.
                $latest = (clone $query)->first();
                $summary = [
                    'last_cost'      => $latest ? (float) $latest->unit_cost : null,
                    'lowest_cost'    => (float) $all->min('unit_cost'),
                    'highest_cost'   => (float) $all->max('unit_cost'),
                    'supplier_count' => (int) (clone $query)->distinct('purchase_orders.vendor_id')->count('purchase_orders.vendor_id'),
                    'purchase_count' => $all->count(),
                ];
            }

            return Inertia::render('App/Reports/Purchases/ItemHistory', [
                'rows'     => $rows,
                'summary'  => $summary,
                'variant'  => $variant ? [
                    'id'           => $variant->id,
                    'variant_name' => $variant->variant_name,
                    'sku'          => $variant->sku,
                    'product_name' => $variant->product?->name,
                ] : null,
                'filters'  => ['product_variant_id' => $variantId],
            ]);
        }

        return Inertia::render('App/Reports/Purchases/ItemHistory', [
            'rows'    => ['data' => [], 'total' => 0, 'current_page' => 1, 'last_page' => 1, 'per_page' => 25, 'from' => null, 'to' => null, 'links' => []],
            'summary' => $summary,
            'variant' => null,
            'filters' => ['product_variant_id' => null],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | payables — Supplier Payables Summary
    |--------------------------------------------------------------------------
    */
    public function payables(Request $request): Response|StreamedResponse
    {
        $store = $this->resolveStore();

        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:60'],
            'export' => ['nullable', Rule::in(['csv'])],
        ]);

        $today = now()->toDateString();

        $base = PurchaseOrder::query()
            ->forStore($store->id)
            ->where('vendor_type', Supplier::class)
            ->when($validated['search'] ?? null, fn ($q, $v) => $q->whereHasMorph('vendor', [Supplier::class], fn ($q2) => $q2
                ->where('name', 'like', "%{$v}%")
                ->orWhere('company_name', 'like', "%{$v}%")));

        $aggregates = (clone $base)
            ->selectRaw('
                vendor_id,
                COUNT(*) as purchase_count,
                COALESCE(SUM(grand_total), 0) as total_purchased,
                COALESCE(SUM(paid_amount), 0) as total_paid,
                COALESCE(SUM(due_amount), 0) as total_due,
                COALESCE(SUM(CASE WHEN due_date < ? AND due_amount > 0 THEN due_amount ELSE 0 END), 0) as overdue_amount
            ', [$today])
            ->groupBy('vendor_id')
            ->orderByDesc('total_due')
            ->orderBy('vendor_id')
            ->get();

        $suppliers = Supplier::whereIn('id', $aggregates->pluck('vendor_id')->all())
            ->select('id', 'company_name', 'name', 'phone', 'gstin')
            ->get()
            ->keyBy('id');

        $rows = $aggregates->map(function ($a) use ($suppliers) {
            $s = $suppliers[$a->vendor_id] ?? null;

            return [
                'supplier_id'     => (int) $a->vendor_id,
                'supplier_name'   => $s ? ($s->company_name ?: $s->name) : '—',
                'phone'           => $s?->phone,
                'gstin'           => $s?->gstin,
                'purchase_count'  => (int) $a->purchase_count,
                'total_purchased' => (float) $a->total_purchased,
                'total_paid'      => (float) $a->total_paid,
                'total_due'       => (float) $a->total_due,
                'overdue_amount'  => (float) $a->overdue_amount,
            ];
        })->values();

        if (($validated['export'] ?? null) === 'csv') {
            return $this->csvDownload(
                "supplier-payables-{$today}.csv",
                ['Supplier', 'Phone', 'GSTIN', 'Purchases', 'Total Purchased', 'Total Paid', 'Total Due', 'Overdue'],
                $rows->take(self::CSV_CAP)->map(fn (array $r) => [
                    $r['supplier_name'], $r['phone'], $r['gstin'], $r['purchase_count'],
                    $r['total_purchased'], $r['total_paid'], $r['total_due'], $r['overdue_amount'],
                ])->all(),
            );
        }

        $summary = [
            'supplier_count'  => $rows->count(),
            'total_purchased' => round($rows->sum('total_purchased'), 2),
            'total_paid'      => round($rows->sum('total_paid'), 2),
            'total_due'       => round($rows->sum('total_due'), 2),
            'overdue_amount'  => round($rows->sum('overdue_amount'), 2),
        ];

        // Paginate the aggregated rows in memory (aggregation happens in SQL; 25/page),
        // shaped like a Laravel paginator so the frontend pagination UI stays identical.
        $perPage = 25;
        $total = $rows->count();
        $lastPage = max(1, (int) ceil($total / $perPage));
        $page = min(max(1, (int) $request->integer('page', 1)), $lastPage);
        $paged = $rows->forPage($page, $perPage)->values();

        $urlFor = fn (int $p) => $request->fullUrlWithQuery(['page' => $p]);

        $links = [
            ['url' => $page > 1 ? $urlFor($page - 1) : null, 'label' => 'Previous', 'active' => false],
            ...range(1, $lastPage)->map(fn (int $p) => [
                'url' => $p === $page ? null : $urlFor($p),
                'label' => (string) $p,
                'active' => $p === $page,
            ]),
            ['url' => $page < $lastPage ? $urlFor($page + 1) : null, 'label' => 'Next', 'active' => false],
        ];

        return Inertia::render('App/Reports/Purchases/Payables', [
            'rows'    => [
                'data'         => $paged->all(),
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => $lastPage,
                'from'         => $total === 0 ? null : ($page - 1) * $perPage + 1,
                'to'           => min($page * $perPage, $total),
                'links'        => $links,
            ],
            'summary' => $summary,
            'filters' => ['search' => $validated['search'] ?? null],
        ]);
    }

    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    private function resolveStore(): Store
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403);

        return $store;
    }

    /**
     * Uniform vendor card. Purchase vendor is polymorphic: Supplier (registered
     * B2B) or Customer (unregistered seller).
     */
    private function vendorCard(PurchaseOrder $po): array
    {
        $v = $po->vendor;

        if (! $v) {
            return ['type' => null, 'id' => null, 'name' => '—', 'phone' => null, 'gstin' => null];
        }

        $isSupplier = $v instanceof Supplier;

        return [
            'type'  => $isSupplier ? 'supplier' : 'customer',
            'id'    => $v->id,
            'name'  => $isSupplier ? ($v->company_name ?: $v->name) : $v->name,
            'phone' => $isSupplier ? $v->phone : ($v->phone_primary ?? null),
            'gstin' => $v->gstin ?? null,
        ];
    }

    private function registerQuery(Store $store, string $from, string $to, ?int $supplierId, ?string $billType)
    {
        return PurchaseOrder::query()
            ->with(['vendor'])
            ->forStore($store->id)
            ->whereDate('order_date', '>=', $from)
            ->whereDate('order_date', '<=', $to)
            ->when($supplierId, fn ($q) => $q->where('vendor_type', Supplier::class)->where('vendor_id', $supplierId))
            ->when($billType, fn ($q, $v) => $q->where('bill_type', $v))
            ->select([
                'id', 'uuid', 'order_date', 'po_number', 'vendor_invoice_no', 'bill_type',
                'vendor_type', 'vendor_id', 'subtotal', 'tax_amount', 'grand_total',
                'paid_amount', 'due_amount', 'status',
            ]);
    }

    private function serializeRegisterRow(PurchaseOrder $po): array
    {
        return [
            'id'               => $po->id,
            'uuid'             => $po->uuid,
            'order_date'       => $po->order_date?->format('Y-m-d'),
            'po_number'        => $po->po_number,
            'vendor_invoice_no'=> $po->vendor_invoice_no,
            'bill_type'        => $po->bill_type,
            'subtotal'         => (float) $po->subtotal,
            'tax_amount'       => (float) $po->tax_amount,
            'grand_total'      => (float) $po->grand_total,
            'paid_amount'      => (float) $po->paid_amount,
            'due_amount'       => (float) $po->due_amount,
            'status'           => $po->status,
            'vendor'           => $this->vendorCard($po),
        ];
    }

    private function registerCsvRow(PurchaseOrder $po): array
    {
        $v = $this->vendorCard($po);

        return [
            $po->order_date?->format('Y-m-d'),
            $po->po_number,
            $po->vendor_invoice_no,
            $v['name'],
            $po->bill_type === 'po' ? 'PO (Tax B2B)' : 'PV (Voucher)',
            $po->subtotal,
            $po->tax_amount,
            $po->grand_total,
            $po->paid_amount,
            $po->due_amount,
            $po->status,
        ];
    }

    private function itemHistoryQuery(Store $store, int $variantId)
    {
        return PurchaseOrderItem::query()
            ->join('purchase_orders', 'purchase_orders.id', '=', 'purchase_order_items.purchase_order_id')
            ->where('purchase_orders.store_id', $store->id)
            ->whereNull('purchase_orders.deleted_at')
            ->where('purchase_order_items.product_variant_id', $variantId)
            ->whereNull('purchase_order_items.deleted_at')
            ->with(['purchaseOrder.vendor'])
            ->select([
                'purchase_order_items.id',
                'purchase_order_items.purchase_order_id',
                'purchase_order_items.ordered_qty',
                'purchase_order_items.unit_cost',
                'purchase_order_items.landed_cost',
            ])
            ->orderByDesc('purchase_orders.order_date')
            ->orderByDesc('purchase_orders.id');
    }

    private function serializeItemHistoryRow(PurchaseOrderItem $item): array
    {
        $po = $item->purchaseOrder;

        return [
            'id'          => $item->id,
            'order_date'  => $po?->order_date?->format('Y-m-d'),
            'po_number'   => $po?->po_number,
            'qty'         => (int) $item->ordered_qty,
            'unit_cost'   => (float) $item->unit_cost,
            'landed_cost' => (float) $item->landed_cost,
            'vendor'      => $po ? $this->vendorCard($po) : null,
        ];
    }

    private function itemHistoryCsvRow(PurchaseOrderItem $item): array
    {
        $po = $item->purchaseOrder;
        $v = $po ? $this->vendorCard($po) : ['name' => '—'];

        return [
            $po?->order_date?->format('Y-m-d'),
            $v['name'],
            $po?->po_number,
            $item->ordered_qty,
            $item->unit_cost,
            $item->landed_cost,
        ];
    }

    private function csvDownload(string $filename, array $headers, array $rows): StreamedResponse
    {
        return response()->streamDownload(function () use ($headers, $rows) {
            $out = fopen('php://output', 'w');
            // UTF-8 BOM so Excel opens the file correctly.
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, $headers);
            foreach ($rows as $row) {
                fputcsv($out, $row);
            }
            fclose($out);
        }, $filename, ['Content-Type' => 'text/csv; charset=UTF-8']);
    }
}

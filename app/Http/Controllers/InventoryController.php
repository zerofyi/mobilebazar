<?php

namespace App\Http\Controllers;

use App\Models\StockBatch;
use App\Models\StockUnit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Response;

class InventoryController extends Controller
{
    /**
     * Store-wide stock inventory — serialized units + non-serialized batches.
     */
    public function index(Request $request): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;

        abort_unless($store && $store->is_active, 403, 'No active store assigned to this user.');

        $tab = $request->query('tab', 'serialized');
        if (! in_array($tab, ['serialized', 'batches'], true)) {
            $tab = 'serialized';
        }

        $filters = $request->only(['search', 'status', 'condition']);

        // ── Summary (store-wide, unfiltered) ──────────────────────────────
        $unitBase = StockUnit::where('store_id', $store->id)->whereIn('status', ['available', 'reserved']);
        $batchBase = StockBatch::where('store_id', $store->id)->where('remaining_qty', '>', 0);

        $summary = [
            'units_available'      => (clone $unitBase)->where('status', 'available')->count(),
            'units_reserved'       => (clone $unitBase)->where('status', 'reserved')->count(),
            'units_value'          => round((clone $unitBase)->sum('landed_cost'), 2),
            'batches_count'        => (clone $batchBase)->count(),
            'batches_remaining'    => (int) (clone $batchBase)->sum('remaining_qty'),
            'batches_value'        => round(StockBatch::where('store_id', $store->id)
                ->where('remaining_qty', '>', 0)
                ->selectRaw('COALESCE(SUM(remaining_qty * landed_cost), 0) as v')
                ->value('v'), 2),
        ];

        // ── Serialized units ──────────────────────────────────────────────
        $units = null;
        if ($tab === 'serialized') {
            $units = StockUnit::with(['productVariant:id,product_id,variant_name,sku,barcode', 'productVariant.product:id,name'])
                ->where('store_id', $store->id)
                ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                    ->where('manual_item_name', 'like', "%{$v}%")
                    ->orWhere('imei1', 'like', "%{$v}%")
                    ->orWhere('imei2', 'like', "%{$v}%")
                    ->orWhere('serial_number', 'like', "%{$v}%")
                    ->orWhereHas('productVariant', fn ($q3) => $q3
                        ->where('variant_name', 'like', "%{$v}%")
                        ->orWhere('sku', 'like', "%{$v}%")
                        ->orWhere('barcode', 'like', "%{$v}%"))))
                ->when($filters['status'] ?? null, fn ($q, $v) => $q->where('status', $v))
                ->when($filters['condition'] ?? null, fn ($q, $v) => $q->where('device_condition', $v))
                ->latest('id')
                ->paginate(25)
                ->withQueryString();
        }

        // ── Non-serialized batches ────────────────────────────────────────
        $batches = null;
        if ($tab === 'batches') {
            $batches = StockBatch::with(['productVariant:id,product_id,variant_name,sku,barcode', 'productVariant.product:id,name'])
                ->where('store_id', $store->id)
                ->when($filters['search'] ?? null, fn ($q, $v) => $q->where(fn ($q2) => $q2
                    ->where('manual_item_name', 'like', "%{$v}%")
                    ->orWhere('batch_number', 'like', "%{$v}%")
                    ->orWhereHas('productVariant', fn ($q3) => $q3
                        ->where('variant_name', 'like', "%{$v}%")
                        ->orWhere('sku', 'like', "%{$v}%")
                        ->orWhere('barcode', 'like', "%{$v}%"))))
                ->when($filters['condition'] ?? null, fn ($q, $v) => $q->where('product_condition', $v))
                ->orderByDesc('remaining_qty')
                ->paginate(25)
                ->withQueryString();
        }

        return inertia('App/Inventory/Index', [
            'tab'     => $tab,
            'filters' => $filters,
            'summary' => $summary,
            'units'   => $units,
            'batches' => $batches,
        ]);
    }
}

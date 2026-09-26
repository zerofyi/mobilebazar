<?php

namespace App\Http\Controllers;

use App\Http\Requests\StorePurchaseRequest;
use App\Models\Customer;
use App\Models\DeviceCondition;
use App\Models\ProductVariant;
use App\Models\Store;
use App\Models\Supplier;
use App\Services\PurchaseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Throwable;

class PurchaseController extends Controller
{
    public function __construct(private readonly PurchaseService $purchases)
    {
    }

    public function index(Request $request)
    {
        $store = $request->user()->ownedStore;
        $storeAddress = $store?->address;

        return Inertia::render('Billing/PurchaseEntrys/Index', [
            // 'store' => [
            //     'id' => $store->id,
            //     'is_gst_registered' => (bool) $store->is_gst_registered,
            //     'state' => $storeAddress->state ?? 'x',
            // ],
            // 'deviceConditions' => DeviceCondition::select('id', 'code', 'label', 'grade_multiplier')
            //     ->orderBy('id')
            //     ->get(),
            // 'permissions' => [
            //     'can_override_gst' => true,
            //     'can_view_wholesale' => true,
            //     'can_override_tax_state' => true,
            // ],
            'initialPoNumber' => "PV/2026/001",

            'store' => [
                'id'               => $store->id,
                'name'             => $store->name,
                'code'             => $store->code,
                'gst_number'       => $store->gst_number ?? null,
                'state_code'       => $store->state_code ?? '',
                'state_name'       => $store->state_name ?? '',
                'is_gst_registered' => (bool) $store->is_gst_registered,
                'currency'         => $store->currency ?? 'INR',
            ],

            // Small lookup — ~20 rows, never changes in production
            'deviceConditions' => DeviceCondition::select('id', 'code', 'label', 'grade_multiplier')
                ->orderBy('id')
                ->get(),

            // Spatie permission flags — drives what the UI shows/hides/allows
            'permissions' => [
                'can_toggle_gst'   => true,
                'can_see_wholesale' => true,
                'can_save_draft'   => true,
                'can_post'         => true,
            ],

            // Pre-generated display number — backend overwrites with the real
            // sequential number on store(). Client shows it as a preview only.
            // 'initialPoNumber' => $this->previewPoNumber($store->id, 'pv'),
        ]);
    }

    /**
     * API: Async Vendor Search (B2B Suppliers & B2C Customers).
     * Previously the Customer branch had NO store scoping at all — any
     * store's users could search and pick any other store's customers.
     */
    public function searchVendors(Request $request)
    {
        $request->validate([
            'q' => 'nullable|string|max:100',
            'type' => 'required|in:supplier,customer',
        ]);

        $store = $this->currentStore($request);
        $query = trim((string) $request->input('q', ''));

        if (mb_strlen($query) < 2) {
            return response()->json([]);
        }

        if ($request->input('type') === 'supplier') {
            return Supplier::query()
                ->where('store_id', $store->id)
                ->where('is_active', true)
                ->where(function ($q) use ($query) {
                    $q->where('name', 'like', "%{$query}%")
                        ->orWhere('phone', 'like', "%{$query}%")
                        ->orWhere('gstin', 'like', "%{$query}%");
                })
                ->orderBy('name')
                ->limit(15)
                ->get(['id', 'name', 'phone', 'gstin', DB::raw('true as is_b2b')]);
        }

        return Customer::query()
            ->where('store_id', $store->id)
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                    ->orWhere('phone_primary', 'like', "%{$query}%");
            })
            ->orderBy('name')
            ->limit(15)
            ->get(['id', 'name', 'phone_primary as phone', DB::raw('false as is_b2b')]);
    }

    /**
     * API: Async Product Search, scoped to the current store's catalog.
     */
    public function searchProducts(Request $request)
    {
        $request->validate(['q' => 'nullable|string|max:100']);

        $store = $this->currentStore($request);
        $query = trim((string) $request->input('q', ''));

        if (mb_strlen($query) < 2) {
            return response()->json([]);
        }

        return ProductVariant::with('product')
            ->where('store_id', $store->id)
            ->where('is_active', true)
            ->where(function ($q) use ($query) {
                $q->where('variant_name', 'like', "%{$query}%")
                    ->orWhere('sku', 'like', "%{$query}%");
            })
            ->limit(15)
            ->get()
            ->map(fn ($v) => [
                'value' => $v->id,
                'label' => trim($v->product->name . ' ' . $v->variant_name),
                'isSerialized' => (bool) $v->product->is_serialized,
                'cost' => $v->cost_price,
                'selling' => $v->selling_price,
            ]);
    }

    /**
     * Process an Instant Purchase (Flowchart Path A). All business logic
     * — GST routing, margin-scheme evaluation, stock generation, totals —
     * lives in PurchaseService so it's unit-testable independent of HTTP.
     */
    public function store(StorePurchaseRequest $request)
    {
        $store = $this->currentStore($request);

        try {
            $purchaseOrder = $this->purchases->createInstantPurchase(
                $request->validated(),
                $store,
                $request->user()
            );
        } catch (ValidationException $e) {
            throw $e;
        } catch (Throwable $e) {
            Log::error('Instant purchase failed', [
                'store_id' => $store->id,
                'user_id' => $request->user()->id,
                'error' => $e->getMessage(),
            ]);

            return back()->withErrors([
                'items' => 'Could not process this purchase. No changes were saved — please try again.',
            ])->withInput();
        }

        return redirect()->route('app.purchases.index')->with('success', [
            'message' => 'Purchase processed successfully.',
            'po_number' => $purchaseOrder->po_number,
        ]);
    }

}

<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\Billing\StoreSaleRequest;
use App\Models\Customer;
use App\Models\ProductVariant;
use App\Services\BuybackService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Buyback: purchase (old device) + sale (new device) in one atomic UI.
 */
class BuybackController extends Controller
{
    public function __construct(private readonly BuybackService $buybacks) {}

    /**
     * The combined buyback POS: the sale cart plus the old-device form.
     */
    public function create(): Response
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore.address');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        return Inertia::render('Billing/Buyback/Create', [
            'store' => [
                'id'                => $store->id,
                'code'              => $store->code,
                'name'              => $store->name,
                'gstin'             => $store->gstin,
                'is_gst_registered' => (bool) $store->is_gst_registered,
                'state_code'        => $store->gstin ? substr($store->gstin, 0, 2) : $store->address?->state_code,
            ],
            'today' => $store->businessToday(),
        ]);
    }

    /**
     * Search catalog variants for the old device (by name/SKU/barcode).
     */
    public function variantSearch(\Illuminate\Http\Request $request): \Illuminate\Http\JsonResponse
    {
        $q = trim((string) $request->input('q', ''));
        if (mb_strlen($q) < 2) {
            return response()->json(['results' => []]);
        }

        $like = '%' . $q . '%';
        $variants = \App\Models\ProductVariant::query()
            ->join('products', 'products.id', '=', 'product_variants.product_id')
            ->where('product_variants.is_active', true)
            ->whereNull('product_variants.deleted_at')
            ->where('products.is_active', true)
            ->whereNull('products.deleted_at')
            ->where(fn ($w) => $w
                ->where('product_variants.sku', 'like', $q . '%')
                ->orWhere('product_variants.barcode', 'like', $q . '%')
                ->orWhere('product_variants.variant_name', 'like', $like)
                ->orWhere('products.name', 'like', $like))
            ->select('product_variants.id', 'product_variants.variant_name', 'product_variants.sku', 'products.name as product_name')
            ->limit(10)
            ->get();

        return response()->json([
            'results' => $variants->map(fn ($v) => [
                'id'    => $v->id,
                'label' => $v->product_name . ($v->variant_name ? ' · ' . $v->variant_name : '') . ($v->sku ? ' (' . $v->sku . ')' : ''),
            ])->all(),
        ]);
    }

    /**
     * Process the atomic buyback. PIN-gated — money and stock move on both sides.
     */
    public function store(StoreSaleRequest $request): RedirectResponse
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        $saleData = $request->validated();

        $pinData = $request->validate([
            'security_pin' => ['required', 'string', 'size:6'],
        ]);
        $this->verifySecurityPin($store, $pinData['security_pin']);

        $buyback = $request->validate([
            'buyback.customer_id'        => ['required', 'integer', 'exists:customers,id'],
            'buyback.product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'buyback.manual_item_name'   => ['nullable', 'string', 'max:255'],
            'buyback.imei1'              => ['nullable', 'string', 'max:30'],
            'buyback.imei2'              => ['nullable', 'string', 'max:30'],
            'buyback.serial_number'      => ['nullable', 'string', 'max:60'],
            'buyback.device_condition'   => ['required', 'string', 'max:20'],
            'buyback.agreed_value'       => ['required', 'numeric', 'min:0.01'],
            'buyback.notes'              => ['nullable', 'string', 'max:1000'],
        ])['buyback'];

        // The sale's party must be the same customer selling the old device.
        // Buyback only supports customer sales — reject supplier parties outright.
        if (($saleData['party_type'] ?? null) !== 'customer') {
            throw ValidationException::withMessages([
                'party_type' => 'Buyback is only available for customer sales.',
            ]);
        }
        $saleCustomerId = (int) $saleData['party_id'];
        if ($saleCustomerId !== (int) $buyback['customer_id']) {
            throw ValidationException::withMessages([
                'buyback.customer_id' => 'The buyback customer must match the sale customer.',
            ]);
        }

        // The old device's IMEI must not already be in active stock.
        $this->assertIdentifierFree($store->id, $buyback);

        // The old device should be a real catalog item or a named manual item.
        if (empty($buyback['product_variant_id']) && empty($buyback['manual_item_name'])) {
            throw ValidationException::withMessages([
                'buyback.manual_item_name' => 'Select a product or enter the device name.',
            ]);
        }

        try {
            $result = $this->buybacks->process($store, $user, $saleData, $buyback);
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors())->withInput();
        } catch (\App\Exceptions\AccountingException $e) {
            return back()->withErrors(['buyback' => $e->getMessage()])->withInput();
        }

        return redirect()
            ->route('app.sales.show', $result['invoice']->uuid)
            ->with('success', 'Buyback completed: ' . $result['invoice']->invoice_number . ' + ' . $result['purchase']->po_number . '.');
    }

    private function verifySecurityPin($store, ?string $pin): void
    {
        if (empty($store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Set a security PIN for this store first (Store settings → Security PIN).',
            ]);
        }
        if (empty($pin) || ! \Hash::check($pin, $store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Incorrect security PIN.',
            ]);
        }
    }

    private function assertIdentifierFree(int $storeId, array $buyback): void
    {
        foreach (['imei1' => 'IMEI 1', 'imei2' => 'IMEI 2', 'serial_number' => 'serial'] as $field => $label) {
            $value = trim((string) ($buyback[$field] ?? ''));
            if ($value === '') {
                continue;
            }
            $exists = \App\Models\StockUnit::where('store_id', $storeId)
                ->where($field, $value)
                ->whereIn('status', ['available', 'reserved'])
                ->exists();
            if ($exists) {
                throw ValidationException::withMessages([
                    "buyback.$field" => "$label $value is already in active stock.",
                ]);
            }
        }
    }
}

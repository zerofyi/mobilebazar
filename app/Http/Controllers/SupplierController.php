<?php

namespace App\Http\Controllers;

use App\Http\Requests\Supplier\StoreSupplierRequest;
use App\Http\Requests\Supplier\UpdateSupplierRequest;
use App\Models\Store;
use App\Models\Supplier;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('suppliers.index');

        $user = $request->user();
        $query = Supplier::query()->with(['address', 'store:id,name', 'linkedStore:id,name,code']);

        // Scope to store if user belongs to a specific outlet
        if ($user->store_id) {
            $query->where('store_id', $user->store_id);
        }

        if ($request->input('trashed') === 'only') {
            $query->onlyTrashed();
        } elseif ($request->input('trashed') === 'with') {
            $query->withTrashed();
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('company_name', 'like', "%{$search}%")
                  ->orWhere('phone', 'like', "%{$search}%")
                  ->orWhere('gstin', 'like', "%{$search}%");
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $suppliers = $query->orderBy('name', 'asc')
            ->paginate(15)
            ->withQueryString();

        $stats = [
            'total'          => Supplier::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->count(),
            'active'         => Supplier::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->where('is_active', true)->count(),
            'total_payables' => Supplier::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->sum('current_balance'),
            'trashed'        => Supplier::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->onlyTrashed()->count(),
        ];

        // Fetch store choices for top-level admin/system users without a bound store_id
        $stores = $user->store_id
            ? []
            : Store::select('id', 'name')->orderBy('name')->get();

        // Stores that can be attached to a supplier (Suppliers → Attach Store).
        // The supplier's own store is excluded per-row in the picker.
        $attachableStores = Store::where('is_active', true)
            ->select('id', 'name', 'code')
            ->orderBy('name')
            ->get();

        return Inertia::render('App/Suppliers/Index', [
            'suppliers' => $suppliers,
            'stats'     => $stats,
            'stores'    => $stores,
            'attachableStores' => $attachableStores,
            'filters'   => $request->only(['search', 'is_active', 'trashed']),
        ]);
    }

    public function store(StoreSupplierRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated) {
            $supplier = Supplier::create([
                'store_id'        => $validated['store_id'],
                'name'            => $validated['name'],
                'company_name'    => $validated['company_name'] ?? null,
                'phone'           => $validated['phone'],
                'email'           => $validated['email'] ?? null,
                'gstin'           => $validated['gstin'] ?? null,
                'opening_balance' => $validated['opening_balance'] ?? 0,
                'current_balance' => $validated['opening_balance'] ?? 0,
                'is_active'       => $validated['is_active'] ?? true,
            ]);

            if (!empty($validated['address'])) {
                $supplier->address()->create(array_filter($validated['address']));
            }
        });

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Supplier created successfully.');
    }

    public function show(Supplier $supplier): Response
    {
        Gate::authorize('suppliers.view');

        $supplier->load(['address', 'store']);

        return Inertia::render('App/Suppliers/Show', [
            'supplier' => $supplier,
        ]);
    }

    public function update(UpdateSupplierRequest $request, Supplier $supplier): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $supplier) {
            $supplier->update([
                'name'         => $validated['name'],
                'company_name' => $validated['company_name'] ?? null,
                'phone'        => $validated['phone'],
                'email'        => $validated['email'] ?? null,
                'gstin'        => $validated['gstin'] ?? null,
                'is_active'    => $validated['is_active'] ?? true,
            ]);

            if (!empty($validated['address'])) {
                $addressData = array_filter($validated['address']);
                if ($supplier->address) {
                    $supplier->address()->update($addressData);
                } else if (!empty($addressData)) {
                    $supplier->address()->create($addressData);
                }
            }
        });

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Supplier updated successfully.');
    }

    /**
     * Attach a chain store to this supplier (one-time setup for stock
     * transfers). The supplier record becomes the store's identity in this
     * store's books: GSTIN / email / address are synced from the stores
     * table, and linked_store_id marks the pairing. One supplier per
     * linked store within an owner store.
     */
    public function attachStore(Request $request, Supplier $supplier): RedirectResponse
    {
        Gate::authorize('suppliers.update');

        // A store-bound user can only attach stores on their own suppliers.
        if ($request->user()->store_id && (int) $supplier->store_id !== (int) $request->user()->store_id) {
            abort(403);
        }

        $validated = $request->validate([
            'store_id' => ['required', 'integer', 'exists:stores,id'],
        ]);

        $store = Store::with('address')->findOrFail($validated['store_id']);

        if (! $store->is_active) {
            return back()->withErrors(['store_id' => 'The selected store is not active.']);
        }
        if ((int) $store->id === (int) $supplier->store_id) {
            return back()->withErrors(['store_id' => 'A supplier cannot be attached to its own store.']);
        }

        $alreadyAttached = Supplier::where('store_id', $supplier->store_id)
            ->where('linked_store_id', $store->id)
            ->where('id', '!=', $supplier->id)
            ->exists();
        if ($alreadyAttached) {
            return back()->withErrors(['store_id' => "Store {$store->name} is already attached to another supplier in this store."]);
        }

        DB::transaction(function () use ($supplier, $store) {
            $supplier->update([
                'linked_store_id' => $store->id,
                // Identity facts come from the store record — the supplier
                // now represents that store.
                'gstin'           => $store->gstin,
                'email'           => $store->email,
                'phone'           => $store->phone ?: $supplier->phone,
            ]);

            if ($store->address) {
                $a = $store->address;
                $supplier->address()->updateOrCreate(
                    ['addressable_type' => Supplier::class, 'addressable_id' => $supplier->id],
                    array_filter([
                        'line1'          => $a->line1,
                        'line2'          => $a->line2,
                        'village_or_area' => $a->village_or_area,
                        'post_office'    => $a->post_office,
                        'police_station' => $a->police_station,
                        'city'           => $a->city,
                        'district'       => $a->district,
                        'state'          => $a->state,
                        'postal_code'    => $a->postal_code,
                        'country'        => $a->country,
                    ], fn ($v) => $v !== null)
                );
            }
        });

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', "Supplier attached to store {$store->name}. GSTIN and address synced from the store.");
    }

    /**
     * Detach the linked store. Synced GSTIN/address stay as the supplier's
     * own data — detaching only removes the transfer pairing.
     */
    public function detachStore(Request $request, Supplier $supplier): RedirectResponse
    {
        Gate::authorize('suppliers.update');

        if ($request->user()->store_id && (int) $supplier->store_id !== (int) $request->user()->store_id) {
            abort(403);
        }

        $supplier->update(['linked_store_id' => null]);

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Store detached from supplier.');
    }

    public function destroy(Supplier $supplier): RedirectResponse
    {
        Gate::authorize('suppliers.delete');

        $supplier->delete();

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Supplier moved to trash.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('suppliers.delete');

        $supplier = Supplier::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $supplier->restore();

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Supplier restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('suppliers.delete');

        $supplier = Supplier::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($supplier) {
            $supplier->address()?->delete();
            $supplier->forceDelete();
        });

        return redirect()
            ->route('app.suppliers.index')
            ->with('success', 'Supplier permanently deleted.');
    }
}

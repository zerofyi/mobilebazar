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
        $query = Supplier::query()->with(['address', 'store:id,name']);

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

        return Inertia::render('App/Suppliers/Index', [
            'suppliers' => $suppliers,
            'stats'     => $stats,
            'stores'    => $stores,
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

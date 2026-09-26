<?php

namespace App\Http\Controllers;

use App\Enums\UserRole;
use App\Http\Requests\Store\StoreStoreRequest;
use App\Http\Requests\Store\StoreUpdateRequest;
use App\Models\Store;
use App\Models\StoreUser;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;
use Inertia\Response;
use Zerofyi\Media\Facades\Media;

class StoreController extends Controller
{
    /**
     * Display a paginated listing of stores with metrics and trashed scopes.
     */
    public function index(Request $request): Response
    {
        Gate::authorize('stores.index');

        $query = Store::query()
            ->with(['owner:id,name,email,mobile', 'address'])
            ->withCount('storeUsers');

        // Apply Trashed View Scopes
        if ($request->input('trashed') === 'only') {
            $query->onlyTrashed();
        } elseif ($request->input('trashed') === 'with') {
            $query->withTrashed();
        }

        // Apply Search Filter
        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('code', 'like', "%{$search}%")
                    ->orWhere('gstin', 'like', "%{$search}%");
            });
        }

        // Apply Type Filter
        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        $stores = $query->latest()->paginate(15)->withQueryString();

        $stats = [
            'total'     => Store::count(),
            'active'    => Store::where('is_active', true)->count(),
            'own'       => Store::where('type', 'own')->count(),
            'franchise' => Store::where('type', 'franchise')->count(),
            'trashed'   => Store::onlyTrashed()->count(),
        ];

        return Inertia::render('App/Stores/Index', [
            'stores'  => $stores,
            'stats'   => $stats,
            'filters' => $request->only(['search', 'type', 'status', 'trashed']),
        ]);
    }

    /**
     * Show the form for creating a new store location.
     */
    public function create(): Response
    {
        Gate::authorize('stores.create');

        return Inertia::render('App/Stores/Create');
    }

    /**
     * Store a newly created store and provision primary owner user in storage.
     */
    public function store(StoreStoreRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated) {
            // 1. Create Primary Store Owner Account (1-to-1 Relationship)
            $owner = User::create([
                'name'               => $validated['owner_name'],
                'email'              => $validated['email'],
                'mobile'             => $validated['mobile'],
                'password'           => Hash::make($validated['password']),
                'role'               => UserRole::STORE,
                'is_active'          => true,
                'email_verified_at'  => now(),
                'mobile_verified_at' => now(),
            ]);

            $owner->assignRole(UserRole::STORE);

            // 2. Create Store Record
            $store = Store::create([
                'user_id'           => $owner->id,
                'name'              => $validated['name'],
                'code'              => $validated['code'],
                'type'              => $validated['type'],
                'security_pin_hash' => Hash::make($validated['security_pin']),
                'phone'             => $validated['phone'] ?? null,
                'email'             => $validated['store_email'] ?? null,
                'gstin'             => $validated['gstin'] ?? null,
                'bank_name'         => $validated['bank_name'] ?? null,
                'account_holder'    => $validated['account_holder'] ?? null,
                'account_number'    => $validated['account_number'] ?? null,
                'ifsc_code'         => $validated['ifsc_code'] ?? null,
                'upi_id'            => $validated['upi_id'] ?? null,
                'is_active'         => $validated['is_active'] ?? true,
                'is_public'         => $validated['is_public'] ?? true,
                'is_gst_registered' => $validated['is_gst_registered'] ?? false,
                'is_iws_allowed'    => $validated['is_iws_allowed'] ?? false, // IWS = Internal Wholesale System
            ]);

            // 3. Create Polymorphic Address linked to Store
            $store->address()->create([
                'village_or_area' => $validated['village_or_area'],
                'post_office'     => $validated['post_office'],
                'police_station'  => $validated['police_station'],
                'district'        => $validated['district'],
                'postal_code'     => $validated['pincode'],
                'state'           => $validated['state'],
                'country'         => 'India',
                'lat'             => $validated['lat'] ?? null,
                'lng'             => $validated['lng'] ?? null,
                'is_default'      => true,
            ]);

            // 4. Assign Primary Store FK back to Owner User
            $owner->update(['store_id' => $store->id]);

            // 5. Instantiate StoreUser Pivot Model Directly
            StoreUser::create([
                'user_id'     => $owner->id,
                'store_id'    => $store->id,
                'role'        => 'owner',
                'is_active'   => true,
                'joined_at'   => now(),
                'base_salary' => 0.00,
                'commission'  => 0.00,
            ]);
        });

        return redirect()
            ->route('app.stores.index')
            ->with('success', 'Store location and Owner account created successfully.');
    }

    /**
     * Display detailed store profile, address, compliance, and linked staff roster.
     */
    public function show(Store $store): Response
    {
        Gate::authorize('stores.view');

        $store->load([
            'owner:id,name,email,mobile',
            'address',
            'imageAsset',
            'logoAsset',
            'signatureAsset',
            'storeUsers.user:id,name,email,mobile,role',
        ]);

        return Inertia::render('App/Stores/Show', [
            'store' => $store,
        ]);
    }

    /**
     * Show the form for editing store details.
     */
    public function edit(Store $store): Response
    {
        Gate::authorize('stores.update');

        $store->load(['owner', 'address']);

        return Inertia::render('App/Stores/Edit', [
            'store' => $store,
        ]);
    }

    /**
     * Update the specified store profile in storage.
     */
    public function update(StoreUpdateRequest $request, Store $store): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $store) {
            // Optional Security PIN Update
            if (!empty($validated['security_pin'])) {
                $validated['security_pin_hash'] = Hash::make($validated['security_pin']);
            }
            unset($validated['security_pin']);

            // Remap Public Contact Email
            if (isset($validated['store_email'])) {
                $validated['email'] = $validated['store_email'];
                unset($validated['store_email']);
            }

            // Sync Polymorphic Address
            $store->address()->updateOrCreate(
                [],
                [
                    'village_or_area' => $validated['village_or_area'],
                    'post_office'     => $validated['post_office'],
                    'police_station'  => $validated['police_station'],
                    'district'        => $validated['district'],
                    'postal_code'     => $validated['pincode'],
                    'state'           => $validated['state'],
                    'country'         => 'India',
                    'lat'             => $validated['lat'] ?? null,
                    'lng'             => $validated['lng'] ?? null,
                    'is_default'      => true,
                ]
            );

            // Update Core Store Attributes
            $store->update($validated);
        });

        return redirect()
            ->route('app.stores.index')
            ->with('success', 'Store details updated successfully.');
    }

    /**
     * Soft-delete the specified store location.
     */
    public function destroy(Store $store): RedirectResponse
    {
        Gate::authorize('stores.delete');

        $store->delete();

        return redirect()
            ->route('app.stores.index')
            ->with('success', 'Store location moved to trash.');
    }

    /**
     * Restore a soft-deleted store location by UUID.
     */
    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('stores.delete');

        $store = Store::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $store->restore();

        return redirect()
            ->route('app.stores.index')
            ->with('success', 'Store location restored successfully.');
    }

    /**
     * Permanently purge store and clean up physical branding media.
     */
    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('stores.delete');

        $store = Store::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($store) {
            // Safely delete physical asset files using zerofyi/media
            if ($store->imageAsset) {
                Media::delete($store->imageAsset);
            }
            if ($store->logoAsset) {
                Media::delete($store->logoAsset);
            }
            if ($store->signatureAsset) {
                Media::delete($store->signatureAsset);
            }

            // Purge linked polymorphic address
            $store->address()?->delete();

            // Permanent database purge
            $store->forceDelete();
        });

        return redirect()
            ->route('app.stores.index')
            ->with('success', 'Store location permanently deleted.');
    }
}

<?php

namespace App\Http\Controllers;

use App\Http\Requests\Customer\StoreCustomerRequest;
use App\Http\Requests\Customer\UpdateCustomerRequest;
use App\Models\Customer;
use App\Services\CustomerIdentityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Zerofyi\Media\Exceptions\ImageStorageException;

class CustomerController extends Controller
{
    public function __construct(
        protected CustomerIdentityService $identityService
    ) {}

    public function index(Request $request): Response
    {
        Gate::authorize('customers.index');

        $query = Customer::query()->with(['address', 'user', 'assets']);

        if ($request->input('trashed') === 'only') {
            $query->onlyTrashed();
        } elseif ($request->input('trashed') === 'with') {
            $query->withTrashed();
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('phone_primary', 'like', "%{$search}%")
                  ->orWhere('phone_secondary', 'like', "%{$search}%")
                  ->orWhere('aadhaar_number', 'like', "%{$search}%")
                  ->orWhere('pan_number', 'like', "%{$search}%")
                  ->orWhere('address_snapshot', 'like', "%{$search}%");
            });
        }

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }

        if ($request->filled('is_verified')) {
            $query->where('is_verified', $request->boolean('is_verified'));
        }

        $customers = $query->orderBy('created_at', 'desc')
            ->paginate(15)
            ->withQueryString();

        $customers->through(function ($customer) {
            $assetsMap = [];
            foreach ($customer->assets as $asset) {
                if ($asset->type) {
                    $assetsMap[$asset->type] = $asset->url;
                }
            }
            $customer->assets_map = $assetsMap;
            $customer->display_address = $customer->display_address;
            return $customer;
        });

        $stats = [
            'total'         => Customer::count(),
            'active'        => Customer::where('status', 'active')->count(),
            'verified'      => Customer::where('is_verified', true)->count(),
            'total_loyalty' => Customer::sum('loyalty_points'),
            'total_spent'   => Customer::sum('total_spent'),
            'trashed'       => Customer::onlyTrashed()->count(),
        ];

        return Inertia::render('App/Customers/Index', [
            'customers' => $customers,
            'stats'     => $stats,
            'filters'   => $request->only(['search', 'status', 'is_verified', 'trashed']),
        ]);
    }

    public function create(): Response
    {
        Gate::authorize('customers.create');

        return Inertia::render('App/Customers/Create');
    }

    public function store(StoreCustomerRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        $identityMatch = $this->identityService->evaluateIdentity(
            $validated['phone_primary'],
            $validated['name']
        );

        // JSON-encode array payload into withErrors to prevent PHP Undefined array key 0 error
        if ($identityMatch['has_name_conflict'] && empty($validated['preferred_name'])) {
            return back()->withErrors([
                'identity_conflict' => json_encode([
                    'matched'       => true,
                    'user_id'       => $identityMatch['user']->id,
                    'customer_name' => $validated['name'],
                    'user_name'     => $identityMatch['user']->name,
                    'phone'         => $validated['phone_primary'],
                ]),
            ]);
        }

        try {
            DB::transaction(function () use ($request, $validated, $identityMatch) {
                $finalName = $validated['preferred_name']
                    ?? ($identityMatch['matched'] ? $identityMatch['user']->name : $validated['name']);

                $customer = Customer::create([
                    'user_id'          => $identityMatch['user']?->id,
                    'name'             => $finalName,
                    'care_of'          => $validated['care_of'] ?? null,
                    'phone_primary'    => $validated['phone_primary'],
                    'phone_secondary'  => $validated['phone_secondary'] ?? null,
                    'aadhaar_number'   => $validated['aadhaar_number'] ?? null,
                    'pan_number'       => $validated['pan_number'] ?? null,
                    'voter_number'     => $validated['voter_number'] ?? null,
                    'credit_limit'     => $validated['credit_limit'] ?? 0.00,
                    'status'           => $validated['status'] ?? 'active',
                    'is_verified'      => $validated['is_verified'] ?? false,
                    'address_snapshot' => $validated['address_snapshot'] ?? null,
                ]);

                if ($identityMatch['matched']) {
                    $this->identityService->syncIdentity($customer, $identityMatch['user'], $finalName);
                }

                if (!empty($validated['address']) && array_filter($validated['address'])) {
                    $addressData = array_filter($validated['address']);
                    $customer->address()->create($addressData);

                    $snapshotParts = array_filter([
                        $validated['address']['line1'] ?? null,
                        $validated['address']['line2'] ?? null,
                        $validated['address']['village_or_area'] ?? null,
                        $validated['address']['post_office'] ?? null,
                        $validated['address']['police_station'] ?? null,
                        $validated['address']['city'] ?? null,
                        $validated['address']['district'] ?? null,
                        $validated['address']['state'] ?? null,
                        $validated['address']['postal_code'] ?? null,
                    ]);

                    $customer->update(['address_snapshot' => implode(', ', $snapshotParts)]);
                }

                $this->handleMediaUploads($request, $customer);
            });
        } catch (ImageStorageException $e) {
            return back()->withErrors(['photo_file' => 'Media processing failed: ' . $e->getMessage()]);
        }

        if ($request->boolean('quick_mode')) {
            return back()->with([
                'success'  => 'Customer profile registered successfully.',
            ]);
        }

        return redirect()
            ->route('app.customers.index')
            ->with('success', 'Customer profile registered successfully.');
    }

    public function show(Customer $customer): Response
    {
        Gate::authorize('customers.view');

        $customer->load(['address', 'user', 'assets']);

        $assetsMap = [];
        foreach ($customer->assets as $asset) {
            if ($asset->type) {
                $assetsMap[$asset->type] = $asset->url;
            }
        }
        $customer->assets_map = $assetsMap;

        return Inertia::render('App/Customers/Show', [
            'customer' => $customer,
        ]);
    }

    public function edit(Customer $customer): Response
    {
        Gate::authorize('customers.update');

        $customer->load(['address', 'assets']);

        $assetsMap = [];
        foreach ($customer->assets as $asset) {
            if ($asset->type) {
                $assetsMap[$asset->type] = $asset->url;
            }
        }
        $customer->assets_map = $assetsMap;

        return Inertia::render('App/Customers/Edit', [
            'customer' => $customer,
        ]);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): RedirectResponse
    {
        $validated = $request->validated();

        try {
            DB::transaction(function () use ($request, $validated, $customer) {
                $customer->update([
                    'name'             => $validated['name'],
                    'care_of'          => $validated['care_of'] ?? null,
                    'phone_primary'    => $validated['phone_primary'],
                    'phone_secondary'  => $validated['phone_secondary'] ?? null,
                    'aadhaar_number'   => $validated['aadhaar_number'] ?? null,
                    'pan_number'       => $validated['pan_number'] ?? null,
                    'voter_number'     => $validated['voter_number'] ?? null,
                    'credit_limit'     => $validated['credit_limit'] ?? 0.00,
                    'status'           => $validated['status'] ?? 'active',
                    'is_verified'      => $validated['is_verified'] ?? false,
                    'address_snapshot' => $validated['address_snapshot'] ?? $customer->address_snapshot,
                ]);

                if ($customer->user && $customer->user->name !== $validated['name']) {
                    $customer->user->update(['name' => $validated['name']]);
                }

                if (!empty($validated['address']) && array_filter($validated['address'])) {
                    $addressData = array_filter($validated['address']);
                    if ($customer->address) {
                        $customer->address()->update($addressData);
                    } else {
                        $customer->address()->create($addressData);
                    }

                    $snapshotParts = array_filter([
                        $validated['address']['line1'] ?? null,
                        $validated['address']['line2'] ?? null,
                        $validated['address']['village_or_area'] ?? null,
                        $validated['address']['post_office'] ?? null,
                        $validated['address']['police_station'] ?? null,
                        $validated['address']['city'] ?? null,
                        $validated['address']['district'] ?? null,
                        $validated['address']['state'] ?? null,
                        $validated['address']['postal_code'] ?? null,
                    ]);

                    $customer->update(['address_snapshot' => implode(', ', $snapshotParts)]);
                }

                $this->handleMediaUploads($request, $customer);
            });
        } catch (ImageStorageException $e) {
            return back()->withErrors(['photo_file' => 'Media processing failed: ' . $e->getMessage()]);
        }

        return redirect()
            ->route('app.customers.index')
            ->with('success', 'Customer profile updated successfully.');
    }

    public function resolveIdentity(Request $request): JsonResponse
    {
        Gate::authorize('customers.update');

        $request->validate([
            'customer_id'    => ['required', 'exists:customers,id'],
            'user_id'        => ['required', 'exists:users,id'],
            'preferred_name' => ['required', 'string', 'max:255'],
        ]);

        $customer = Customer::findOrFail($request->integer('customer_id'));
        $user     = \App\Models\User::findOrFail($request->integer('user_id'));

        $this->identityService->syncIdentity($customer, $user, $request->string('preferred_name'));

        return response()->json([
            'success' => true,
            'message' => 'Identity successfully synchronized across channels.',
        ]);
    }

    public function destroy(Customer $customer): RedirectResponse
    {
        Gate::authorize('customers.delete');

        $customer->delete();

        return redirect()
            ->route('app.customers.index')
            ->with('success', 'Customer moved to trash.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('customers.delete');

        $customer = Customer::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $customer->restore();

        return redirect()
            ->route('app.customers.index')
            ->with('success', 'Customer restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('customers.delete');

        $customer = Customer::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($customer) {
            $customer->assets->each(fn ($asset) => $customer->deleteAsset($asset));
            $customer->address()?->delete();
            $customer->forceDelete();
        });

        return redirect()
            ->route('app.customers.index')
            ->with('success', 'Customer permanently purged.');
    }

    protected function handleMediaUploads(Request $request, Customer $customer): void
    {
        $mediaInputs = [
            'photo_file'         => ['type' => 'customer_photo', 'variants' => ['thumb']],
            'aadhaar_front_file' => ['type' => 'aadhaar_front', 'variants' => ['thumb']],
            'aadhaar_back_file'  => ['type' => 'aadhaar_back',  'variants' => ['thumb']],
            'voter_front_file'   => ['type' => 'voter_front',   'variants' => ['thumb']],
            'voter_back_file'    => ['type' => 'voter_back',    'variants' => ['thumb']],
            'pan_file'           => ['type' => 'pan_card',      'variants' => ['thumb']],
        ];

        foreach ($mediaInputs as $inputKey => $config) {
            if ($request->hasFile($inputKey)) {
                $type = $config['type'];
                $existing = $customer->assets()->where('type', $type)->first();

                if ($existing) {
                    $customer->replaceAsset(
                        asset: $existing,
                        file: $request->file($inputKey),
                        slug: "{$type}-{$customer->uuid}",
                        folder: "customers/{$type}",
                        type: $type,
                        variants: $config['variants'],
                        uploadedBy: $request->user()->id
                    );
                } else {
                    $customer->uploadAsset(
                        file: $request->file($inputKey),
                        slug: "{$type}-{$customer->uuid}",
                        folder: "customers/{$type}",
                        type: $type,
                        variants: $config['variants'],
                        uploadedBy: $request->user()->id
                    );
                }
            }
        }
    }
}

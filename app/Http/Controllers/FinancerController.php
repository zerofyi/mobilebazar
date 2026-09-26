<?php

namespace App\Http\Controllers;

use App\Http\Requests\Financer\StoreFinancerRequest;
use App\Http\Requests\Financer\UpdateFinancerRequest;
use App\Models\Financer;
use App\Models\Store;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;
use Zerofyi\Media\Exceptions\ImageStorageException;

class FinancerController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('financers.index');

        $user = $request->user();
        $query = Financer::query()->with(['address', 'store:id,name', 'primaryAsset']);

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
                  ->orWhere('mobile', 'like', "%{$search}%");
            });
        }

        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $financers = $query->orderBy('name', 'asc')
            ->paginate(15)
            ->withQueryString();

        // Transform collection to append signature URL using zerofyi/media accessors
        $financers->through(function ($financer) {
            $financer->signature_url = $financer->primaryAsset?->url
                ?? ($financer->signature_path ? asset('storage/' . $financer->signature_path) : null);
            return $financer;
        });

        $stats = [
            'total'         => Financer::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->count(),
            'active'        => Financer::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->where('is_active', true)->count(),
            'total_limit'   => Financer::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->sum('limit'),
            'total_balance' => Financer::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->sum('balance'),
            'trashed'       => Financer::when($user->store_id, fn($q) => $q->where('store_id', $user->store_id))->onlyTrashed()->count(),
        ];

        $stores = $user->store_id
            ? []
            : Store::select('id', 'name')->orderBy('name')->get();

        return Inertia::render('App/Financers/Index', [
            'financers' => $financers,
            'stats'     => $stats,
            'stores'    => $stores,
            'filters'   => $request->only(['search', 'type', 'is_active', 'trashed']),
        ]);
    }

    public function store(StoreFinancerRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        try {
            DB::transaction(function () use ($request, $validated) {
                $financer = Financer::create([
                    'store_id'  => $validated['store_id'],
                    'name'      => $validated['name'],
                    'mobile'    => $validated['mobile'],
                    'type'      => $validated['type'],
                    'limit'     => $validated['limit'] ?? null,
                    'balance'   => 0.00,
                    'is_active' => $validated['is_active'] ?? true,
                ]);

                if ($request->hasFile('signature')) {
                    $financer->uploadAsset(
                        file: $request->file('signature'),
                        slug: 'signature-' . $financer->uuid,
                        folder: 'signatures',
                        type: 'signature',
                        variants: ['thumb'],
                        uploadedBy: $request->user()->id
                    );
                }

                if (!empty($validated['address'])) {
                    $financer->address()->create(array_filter($validated['address']));
                }
            });
        } catch (ImageStorageException $e) {
            return back()->withErrors(['signature' => 'Signature upload failed: ' . $e->getMessage()]);
        }

        return redirect()
            ->route('app.financers.index')
            ->with('success', 'Financer registered successfully.');
    }

    public function show(Financer $financer): Response
    {
        Gate::authorize('financers.view');

        $financer->load(['address', 'store', 'primaryAsset']);
        $financer->signature_url = $financer->primaryAsset?->url
            ?? ($financer->signature_path ? asset('storage/' . $financer->signature_path) : null);

        return Inertia::render('App/Financers/Show', [
            'financer' => $financer,
        ]);
    }

    public function update(UpdateFinancerRequest $request, Financer $financer): RedirectResponse
    {
        $validated = $request->validated();

        try {
            DB::transaction(function () use ($request, $validated, $financer) {
                $financer->update([
                    'name'      => $validated['name'],
                    'mobile'    => $validated['mobile'],
                    'type'      => $validated['type'],
                    'limit'     => $validated['limit'] ?? null,
                    'is_active' => $validated['is_active'] ?? true,
                ]);

                if ($request->hasFile('signature')) {
                    if ($existingAsset = $financer->primaryAsset) {
                        $financer->replaceAsset(
                            asset: $existingAsset,
                            file: $request->file('signature'),
                            slug: 'signature-' . $financer->uuid,
                            folder: 'signatures',
                            type: 'signature',
                            variants: ['thumb'],
                            uploadedBy: $request->user()->id
                        );
                    } else {
                        $financer->uploadAsset(
                            file: $request->file('signature'),
                            slug: 'signature-' . $financer->uuid,
                            folder: 'signatures',
                            type: 'signature',
                            variants: ['thumb'],
                            uploadedBy: $request->user()->id
                        );
                    }
                }

                if (!empty($validated['address'])) {
                    $addressData = array_filter($validated['address']);
                    if ($financer->address) {
                        $financer->address()->update($addressData);
                    } else if (!empty($addressData)) {
                        $financer->address()->create($addressData);
                    }
                }
            });
        } catch (ImageStorageException $e) {
            return back()->withErrors(['signature' => 'Signature update failed: ' . $e->getMessage()]);
        }

        return redirect()
            ->route('app.financers.index')
            ->with('success', 'Financer profile updated successfully.');
    }

    public function destroy(Financer $financer): RedirectResponse
    {
        Gate::authorize('financers.delete');

        $financer->delete();

        return redirect()
            ->route('app.financers.index')
            ->with('success', 'Financer moved to trash.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('financers.delete');

        $financer = Financer::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $financer->restore();

        return redirect()
            ->route('app.financers.index')
            ->with('success', 'Financer restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('financers.delete');

        $financer = Financer::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($financer) {
            // Safely delete all associated physical asset files via HasAssets trait
            $financer->assets->each(fn ($asset) => $financer->deleteAsset($asset));

            $financer->address()?->delete();
            $financer->forceDelete();
        });

        return redirect()
            ->route('app.financers.index')
            ->with('success', 'Financer permanently purged.');
    }
}

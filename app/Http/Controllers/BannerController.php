<?php

namespace App\Http\Controllers;

use App\Http\Requests\Banner\StoreBannerRequest;
use App\Http\Requests\Banner\UpdateBannerRequest;
use App\Models\Banner;
use App\Models\Store;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class BannerController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('banners.manage');

        $user = Auth::user();
        $query = Banner::query()->with(['store:id,name']);

        // Multi-Tenant Scope Filtering
        if ($user->store_id !== null) {
            $query->where('store_id', $user->store_id);
        } elseif ($request->filled('store_id')) {
            $query->where('store_id', $request->input('store_id'));
        }

        if ($request->input('trashed') === 'only') {
            $query->onlyTrashed();
        } elseif ($request->input('trashed') === 'with') {
            $query->withTrashed();
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where('title', 'like', "%{$search}%");
        }

        if ($request->filled('position')) {
            $query->where('position', $request->input('position'));
        }

        $banners = $query->orderBy('sort_order', 'asc')
            ->latest()
            ->paginate(15)
            ->through(function ($banner) {
                // Append full URL accessor to image_path for client-side rendering
                $banner->image_url = $banner->image_path ? Storage::disk('public')->url($banner->image_path) : null;
                return $banner;
            })
            ->withQueryString();

        $trashedCount = Banner::query()
            ->when($user->store_id !== null, fn ($q) => $q->where('store_id', $user->store_id))
            ->onlyTrashed()
            ->count();

        return Inertia::render('App/Banners/Index', [
            'banners'      => $banners,
            'trashedCount' => $trashedCount,
            'filters'      => $request->only(['search', 'position', 'store_id', 'trashed']),
            'stores'       => $user->store_id === null ? Store::select('id', 'name')->get() : [],
        ]);
    }

    public function store(StoreBannerRequest $request): RedirectResponse
    {
        $validated = $request->validated();
        $user = Auth::user();

        $storeId = $user->store_id ?? ($validated['store_id'] ?? null);

        DB::transaction(function () use ($validated, $request, $storeId) {
            // 1. Create base model instance
            $banner = Banner::create([
                'store_id'   => $storeId,
                'title'      => $validated['title'],
                'image_path' => '', // Hydrated after processing
                'url_type'   => $validated['url_type'],
                'url'        => $validated['url'] ?? null,
                'position'   => $validated['position'],
                'sort_order' => $validated['sort_order'] ?? 0,
                'is_active'  => $validated['is_active'] ?? true,
                'starts_at'  => $validated['starts_at'] ?? null,
                'ends_at'    => $validated['ends_at'] ?? null,
            ]);

            // 2. Upload asset via HasAssets model trait (only generating 'thumb')
            $asset = $banner->uploadAsset(
                file: $request->file('image'),
                slug: Str::slug($validated['title']) . '-banner',
                folder: 'banners',
                type: 'banner',
                variants: ['thumb']
            );

            // 3. Store the relative path of the thumb variant in image_path
            $thumbPath = $asset->variants['thumb'] ?? $asset->path;
            $banner->update(['image_path' => $thumbPath]);
        });

        return redirect()
            ->route('app.banners.index')
            ->with('success', 'Banner created successfully.');
    }

    public function update(UpdateBannerRequest $request, Banner $banner): RedirectResponse
    {
        $this->ensureStoreAccess($banner);
        $validated = $request->validated();
        $user = Auth::user();

        DB::transaction(function () use ($validated, $request, $banner, $user) {
            if ($request->hasFile('image')) {
                if ($existingAsset = $banner->primaryAsset) {
                    $asset = $banner->replaceAsset(
                        asset: $existingAsset,
                        file: $request->file('image'),
                        slug: Str::slug($validated['title']) . '-banner',
                        folder: 'banners',
                        type: 'banner',
                        variants: ['thumb']
                    );
                } else {
                    $asset = $banner->uploadAsset(
                        file: $request->file('image'),
                        slug: Str::slug($validated['title']) . '-banner',
                        folder: 'banners',
                        type: 'banner',
                        variants: ['thumb']
                    );
                }

                // Assign relative path of thumbnail variant
                $validated['image_path'] = $asset->variants['thumb'] ?? $asset->path;
            }

            if ($user->store_id !== null) {
                unset($validated['store_id']);
            }

            $banner->update($validated);
        });

        return redirect()
            ->route('app.banners.index')
            ->with('success', 'Banner updated successfully.');
    }

    public function destroy(Banner $banner): RedirectResponse
    {
        Gate::authorize('banners.manage');
        $this->ensureStoreAccess($banner);

        $banner->delete();

        return redirect()
            ->route('app.banners.index')
            ->with('success', 'Banner soft-deleted successfully.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('banners.manage');

        $banner = Banner::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $this->ensureStoreAccess($banner);

        $banner->restore();

        return redirect()
            ->route('app.banners.index')
            ->with('success', 'Banner restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('banners.manage');

        $banner = Banner::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $this->ensureStoreAccess($banner);

        DB::transaction(function () use ($banner) {
            $banner->assets->each(fn ($asset) => $banner->deleteAsset($asset));
            $banner->forceDelete();
        });

        return redirect()
            ->route('app.banners.index')
            ->with('success', 'Banner permanently deleted.');
    }

    private function ensureStoreAccess(Banner $banner): void
    {
        $user = Auth::user();
        if ($user->store_id !== null && $banner->store_id !== $user->store_id) {
            abort(403, 'Unauthorized access to store banner.');
        }
    }
}

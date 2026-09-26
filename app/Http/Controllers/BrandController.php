<?php

namespace App\Http\Controllers;

use App\Http\Requests\Brand\StoreBrandRequest;
use App\Http\Requests\Brand\UpdateBrandRequest;
use App\Models\Brand;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class BrandController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('brands.view');

        $query = Brand::query();

        if ($request->input('trashed') === 'only') {
            $query->onlyTrashed();
        } elseif ($request->input('trashed') === 'with') {
            $query->withTrashed();
        }

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('slug', 'like', "%{$search}%");
            });
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $brands = $query->orderBy('name', 'asc')
            ->paginate(15)
            ->through(function ($brand) {
                // Generate public URL directly from the stored relative path
                $brand->logo_url = $brand->logo_path
                    ? Storage::disk('public')->url($brand->logo_path)
                    : null;
                return $brand;
            })
            ->withQueryString();

        $stats = [
            'total'    => Brand::count(),
            'active'   => Brand::where('is_active', true)->count(),
            'inactive' => Brand::where('is_active', false)->count(),
            'trashed'  => Brand::onlyTrashed()->count(),
        ];

        return Inertia::render('App/Brands/Index', [
            'brands'  => $brands,
            'stats'   => $stats,
            'filters' => $request->only(['search', 'is_active', 'trashed']),
        ]);
    }

    public function store(StoreBrandRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $request) {
            $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

            $brand = Brand::create([
                'name'      => $validated['name'],
                'slug'      => $slug,
                'logo_path' => null,
                'is_active' => $validated['is_active'] ?? true,
            ]);

            if ($request->hasFile('logo')) {
                // Upload polymorphic asset with thumb variant generator
                $asset = $brand->uploadAsset(
                    file: $request->file('logo'),
                    slug: $slug . '-logo',
                    folder: 'brands',
                    type: 'logo',
                    variants: ['thumb']
                );

                // Extract relative path of the thumbnail variant (or base path)
                $relativePath = $asset->variants['thumb'] ?? $asset->path;
                $brand->update(['logo_path' => $relativePath]);
            }
        });

        return redirect()
            ->route('app.brands.index')
            ->with('success', 'Brand created successfully.');
    }

    public function update(UpdateBrandRequest $request, Brand $brand): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $request, $brand) {
            $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

            if ($request->hasFile('logo')) {
                // Replace asset via HasAssets trait
                if ($existingAsset = $brand->primaryAsset) {
                    $asset = $brand->replaceAsset(
                        asset: $existingAsset,
                        file: $request->file('logo'),
                        slug: $slug . '-logo',
                        folder: 'brands',
                        type: 'logo',
                        variants: ['thumb']
                    );
                } else {
                    $asset = $brand->uploadAsset(
                        file: $request->file('logo'),
                        slug: $slug . '-logo',
                        folder: 'brands',
                        type: 'logo',
                        variants: ['thumb']
                    );
                }

                $validated['logo_path'] = $asset->variants['thumb'] ?? $asset->path;
            }

            $validated['slug'] = $slug;
            $brand->update($validated);
        });

        return redirect()
            ->route('app.brands.index')
            ->with('success', 'Brand updated successfully.');
    }

    public function destroy(Brand $brand): RedirectResponse
    {
        Gate::authorize('brands.delete');

        $brand->delete();

        return redirect()
            ->route('app.brands.index')
            ->with('success', 'Brand soft-deleted successfully.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('brands.delete');

        $brand = Brand::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $brand->restore();

        return redirect()
            ->route('app.brands.index')
            ->with('success', 'Brand restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('brands.delete');

        $brand = Brand::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($brand) {
            $brand->assets->each(fn ($asset) => $brand->deleteAsset($asset));
            $brand->forceDelete();
        });

        return redirect()
            ->route('app.brands.index')
            ->with('success', 'Brand permanently deleted.');
    }
}

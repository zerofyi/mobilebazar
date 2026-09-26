<?php

namespace App\Http\Controllers;

use App\Http\Requests\Category\StoreCategoryRequest;
use App\Http\Requests\Category\UpdateCategoryRequest;
use App\Models\Category;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class CategoryController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('categories.view');

        $query = Category::query()->with(['parent:id,uuid,name']);

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

        if ($request->filled('parent_id')) {
            if ($request->input('parent_id') === 'root') {
                $query->whereNull('parent_id');
            } else {
                $query->where('parent_id', $request->input('parent_id'));
            }
        }

        if ($request->filled('is_active')) {
            $query->where('is_active', $request->boolean('is_active'));
        }

        $categories = $query->orderBy('sort_order', 'asc')
            ->orderBy('name', 'asc')
            ->paginate(15)
            ->through(function ($category) {
                $category->image_url = $category->image_path
                    ? Storage::disk('public')->url($category->image_path)
                    : null;
                $category->icon_url = $category->icon_path
                    ? Storage::disk('public')->url($category->icon_path)
                    : null;
                return $category;
            })
            ->withQueryString();

        // Parents list for filter & modal dropdowns
        $parentCategories = Category::whereNull('parent_id')
            ->select('id', 'uuid', 'name')
            ->orderBy('name', 'asc')
            ->get();

        $stats = [
            'total'     => Category::count(),
            'root'      => Category::whereNull('parent_id')->count(),
            'sub'       => Category::whereNotNull('parent_id')->count(),
            'trashed'   => Category::onlyTrashed()->count(),
        ];

        return Inertia::render('App/Categories/Index', [
            'categories' => $categories,
            'parents'    => $parentCategories,
            'stats'      => $stats,
            'filters'    => $request->only(['search', 'parent_id', 'is_active', 'trashed']),
        ]);
    }

    public function store(StoreCategoryRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $request) {
            $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

            $category = Category::create([
                'parent_id'  => $validated['parent_id'] ?? null,
                'name'       => $validated['name'],
                'slug'       => $slug,
                'sort_order' => $validated['sort_order'] ?? 0,
                'is_active'  => $validated['is_active'] ?? true,
            ]);

            // Handle main image upload
            if ($request->hasFile('image')) {
                $imageAsset = $category->uploadAsset(
                    file: $request->file('image'),
                    slug: $slug . '-image',
                    folder: 'categories/images',
                    type: 'category_image',
                    variants: ['thumb']
                );
                $category->image_path = $imageAsset->variants['thumb'] ?? $imageAsset->path;
            }

            // Handle icon upload
            if ($request->hasFile('icon')) {
                $iconAsset = $category->uploadAsset(
                    file: $request->file('icon'),
                    slug: $slug . '-icon',
                    folder: 'categories/icons',
                    type: 'category_icon'
                );
                $category->icon_path = $iconAsset->path;
            }

            $category->save();
        });

        return redirect()
            ->route('app.categories.index')
            ->with('success', 'Category created successfully.');
    }

    public function update(UpdateCategoryRequest $request, Category $category): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $request, $category) {
            $slug = !empty($validated['slug']) ? Str::slug($validated['slug']) : Str::slug($validated['name']);

            // Update main image
            if ($request->hasFile('image')) {
                $existingAsset = $category->assets()->where('type', 'category_image')->first();
                if ($existingAsset) {
                    $imageAsset = $category->replaceAsset(
                        asset: $existingAsset,
                        file: $request->file('image'),
                        slug: $slug . '-image',
                        folder: 'categories/images',
                        type: 'category_image',
                        variants: ['thumb']
                    );
                } else {
                    $imageAsset = $category->uploadAsset(
                        file: $request->file('image'),
                        slug: $slug . '-image',
                        folder: 'categories/images',
                        type: 'category_image',
                        variants: ['thumb']
                    );
                }
                $validated['image_path'] = $imageAsset->variants['thumb'] ?? $imageAsset->path;
            }

            // Update icon
            if ($request->hasFile('icon')) {
                $existingIcon = $category->assets()->where('type', 'category_icon')->first();
                if ($existingIcon) {
                    $iconAsset = $category->replaceAsset(
                        asset: $existingIcon,
                        file: $request->file('icon'),
                        slug: $slug . '-icon',
                        folder: 'categories/icons',
                        type: 'category_icon'
                    );
                } else {
                    $iconAsset = $category->uploadAsset(
                        file: $request->file('icon'),
                        slug: $slug . '-icon',
                        folder: 'categories/icons',
                        type: 'category_icon'
                    );
                }
                $validated['icon_path'] = $iconAsset->path;
            }

            $validated['slug'] = $slug;
            $category->update($validated);
        });

        return redirect()
            ->route('app.categories.index')
            ->with('success', 'Category updated successfully.');
    }

    public function destroy(Category $category): RedirectResponse
    {
        Gate::authorize('categories.delete');

        $category->delete();

        return redirect()
            ->route('app.categories.index')
            ->with('success', 'Category soft-deleted successfully.');
    }

    public function restore(string $uuid): RedirectResponse
    {
        Gate::authorize('categories.delete');

        $category = Category::withTrashed()->where('uuid', $uuid)->firstOrFail();
        $category->restore();

        return redirect()
            ->route('app.categories.index')
            ->with('success', 'Category restored successfully.');
    }

    public function forceDelete(string $uuid): RedirectResponse
    {
        Gate::authorize('categories.delete');

        $category = Category::withTrashed()->where('uuid', $uuid)->firstOrFail();

        DB::transaction(function () use ($category) {
            $category->assets->each(fn ($asset) => $category->deleteAsset($asset));
            $category->forceDelete();
        });

        return redirect()
            ->route('app.categories.index')
            ->with('success', 'Category permanently deleted.');
    }
}

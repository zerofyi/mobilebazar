<?php

namespace App\Http\Controllers;

use App\Http\Requests\Attribute\StoreAttributeRequest;
use App\Http\Requests\Attribute\UpdateAttributeRequest;
use App\Http\Requests\Attribute\StoreAttributeValueRequest;
use App\Models\Attribute;
use App\Models\AttributeValue;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class AttributeController extends Controller
{
    public function index(Request $request): Response
    {
        Gate::authorize('attributes.manage');

        $query = Attribute::query()->with(['values:id,attribute_id,uuid,value']);

        if ($request->filled('search')) {
            $search = $request->input('search');
            $query->where('name', 'like', "%{$search}%");
        }

        if ($request->filled('is_variant_defining')) {
            $query->where('is_variant_defining', $request->boolean('is_variant_defining'));
        }

        $attributes = $query->orderBy('name', 'asc')
            ->paginate(15)
            ->withQueryString();

        $stats = [
            'total'    => Attribute::count(),
            'variant'  => Attribute::where('is_variant_defining', true)->count(),
            'spec'     => Attribute::where('is_variant_defining', false)->count(),
            'values'   => AttributeValue::count(),
        ];

        return Inertia::render('App/Attributes/Index', [
            'attributes' => $attributes,
            'stats'      => $stats,
            'filters'    => $request->only(['search', 'is_variant_defining']),
        ]);
    }

    public function store(StoreAttributeRequest $request): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated) {
            $attribute = Attribute::create([
                'name'                => $validated['name'],
                'type'                => $validated['type'] ?? null,
                'is_variant_defining' => $validated['is_variant_defining'] ?? true,
            ]);

            foreach ($validated['values'] as $valueData) {
                $attribute->values()->create([
                    'value' => $valueData['value'],
                ]);
            }
        });

        return redirect()
            ->route('app.attributes.index')
            ->with('success', 'Attribute and values created successfully.');
    }


    //Used in the product creation form to add a new value to an existing attribute
    public function storeValue(StoreAttributeValueRequest $request, Attribute $attribute): \Illuminate\Http\JsonResponse
    {
        $value = $attribute->values()->create([
            'value' => $request->validated('value'),
        ]);

        return response()->json([
            'id' => $value->id,
            'uuid' => $value->uuid,
            'attribute_id' => $value->attribute_id,
            'value' => $value->value,
        ], 201);
    }

    public function update(UpdateAttributeRequest $request, Attribute $attribute): RedirectResponse
    {
        $validated = $request->validated();

        DB::transaction(function () use ($validated, $attribute) {
            $attribute->update([
                'name'                => $validated['name'],
                'type'                => $validated['type'] ?? null,
                'is_variant_defining' => $validated['is_variant_defining'] ?? true,
            ]);

            // Sync values: remove omitted ones and add/update current
            $incomingValues = collect($validated['values'])->pluck('value')->filter()->toArray();
            $attribute->values()->whereNotIn('value', $incomingValues)->delete();

            foreach ($incomingValues as $val) {
                $attribute->values()->firstOrCreate(['value' => $val]);
            }
        });

        return redirect()
            ->route('app.attributes.index')
            ->with('success', 'Attribute updated successfully.');
    }

    public function destroy(Attribute $attribute): RedirectResponse
    {
        Gate::authorize('attributes.manage');

        // Note: Cascade deletes values via database constraint
        $attribute->delete();

        return redirect()
            ->route('app.attributes.index')
            ->with('success', 'Attribute deleted successfully.');
    }
}

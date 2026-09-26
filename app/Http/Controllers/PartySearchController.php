<?php

declare(strict_types=1);

namespace App\Http\Controllers; // Adjusted to match your route group namespace

use App\Http\Controllers\Controller;
use App\Models\Customer;
use App\Models\Supplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PartySearchController extends Controller
{
    /**
     * Search active customers globally.
     */
    public function customers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:50'],
        ]);

        $query = $validated['q'];

        $customers = Customer::query()
            ->active()
            // Eager load only necessary address fields for tax calculation and UI rendering
            ->with('address:id,addressable_type,addressable_id,line1,city,state,postal_code')
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('phone_primary', 'like', "{$query}%")
                  ->orWhere('phone_secondary', 'like', "{$query}%");
            })
            ->select([
                'id',
                'uuid',
                'name',
                'care_of',
                'phone_primary',
                'phone_secondary',
                'is_verified',
                'pan_number',
                'aadhaar_number',
                'address_snapshot'
            ])
            ->take(15)
            ->get();

        return response()->json($customers);
    }

    /**
     * Search active suppliers scoped to the user's active store.
     */
    public function suppliers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'q' => ['required', 'string', 'min:2', 'max:50'],
        ]);

        $query = $validated['q'];
        $storeId = $request->user()->store_id;

        $suppliers = Supplier::query()
            ->active()
            ->forStore($storeId)
            // Eager load only necessary address fields for tax calculation and UI rendering
            ->with('address:id,addressable_type,addressable_id,line1,city,state,postal_code')
            ->where(function ($q) use ($query) {
                $q->where('name', 'like', "%{$query}%")
                  ->orWhere('company_name', 'like', "%{$query}%")
                  ->orWhere('phone', 'like', "{$query}%")
                  ->orWhere('gstin', 'like', "{$query}%");
            })
            ->select([
                'id',
                'uuid',
                'name',
                'company_name',
                'phone',
                'email', // Added email for the UI contact grid
                'gstin',
                'current_balance'
            ])
            ->take(15)
            ->get();

        return response()->json($suppliers);
    }
}

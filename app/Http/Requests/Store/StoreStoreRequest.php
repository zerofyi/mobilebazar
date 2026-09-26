<?php

namespace App\Http\Requests\Store;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('stores.create');
    }

    public function rules(): array
    {
        return [
            // Owner Account Details (1-to-1 User Creation)
            'owner_name'     => ['required', 'string', 'max:255'],
            'email'          => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'mobile'         => ['required', 'string', 'digits:10', 'unique:users,mobile'],
            'password'       => ['required', 'string', 'min:8'],

            // Store Identity Details
            'name'           => ['required', 'string', 'max:255'],
            'code'           => ['required', 'string', 'digits:6', 'unique:stores,code'],
            'type'           => ['required', 'string', Rule::in(['own', 'franchise'])],
            'security_pin'   => ['required', 'string', 'digits:6'],
            'phone'          => ['nullable', 'string', 'max:20'],
            'store_email'    => ['nullable', 'string', 'email', 'max:255'],

            // Physical Address
            'village_or_area'=> ['required', 'string', 'max:255'],
            'post_office'    => ['required', 'string', 'max:255'],
            'police_station' => ['required', 'string', 'max:255'],
            'district'       => ['required', 'string', 'max:255'],
            'pincode'        => ['required', 'string', 'digits:6'],
            'state'          => ['required', 'string', 'max:255'],
            'lat'            => ['nullable', 'numeric', 'between:-90,90'],
            'lng'            => ['nullable', 'numeric', 'between:-180,180'],

            // Financial & Compliance
            'gstin'          => ['nullable', 'string', 'size:15'],
            'bank_name'      => ['nullable', 'string', 'max:255'],
            'account_holder' => ['nullable', 'string', 'max:255'],
            'account_number' => ['nullable', 'string', 'max:50'],
            'ifsc_code'      => ['nullable', 'string', 'max:20'],
            'upi_id'         => ['nullable', 'string', 'max:255'],

            // Configuration Flags
            'is_active'      => ['boolean'],
            'is_public'      => ['boolean'],
            'is_gst_registered' => ['boolean'],
            'is_iws_allowed' => ['boolean'],
        ];
    }
}

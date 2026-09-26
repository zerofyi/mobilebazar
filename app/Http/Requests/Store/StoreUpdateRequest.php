<?php

namespace App\Http\Requests\Store;

use App\Models\Store;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreUpdateRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('stores.update');
    }

    public function rules(): array
    {
        $storeParam = $this->route('store');
        $storeId = $storeParam instanceof Store ? $storeParam->id : Store::where('uuid', $storeParam)->value('id');

        return [
            // Store Identity
            'name'           => ['required', 'string', 'max:255'],
            'code'           => ['required', 'string', 'digits:6', Rule::unique('stores', 'code')->ignore($storeId)],
            'type'           => ['required', 'string', Rule::in(['own', 'franchise'])],
            'security_pin'   => ['nullable', 'string', 'digits:6'],
            'phone'          => ['nullable', 'string', 'max:20'],
            'store_email'    => ['nullable', 'string', 'email', 'max:255'],
            'gstin'          => ['nullable', 'string', 'size:15'],

            // Address Details
            'village_or_area'=> ['required', 'string', 'max:255'],
            'post_office'    => ['required', 'string', 'max:255'],
            'police_station' => ['required', 'string', 'max:255'],
            'district'       => ['required', 'string', 'max:255'],
            'pincode'        => ['required', 'string', 'digits:6'],
            'state'          => ['required', 'string', 'max:255'],
            'lat'            => ['nullable', 'numeric', 'between:-90,90'],
            'lng'            => ['nullable', 'numeric', 'between:-180,180'],

            // Bank Compliance
            'bank_name'      => ['nullable', 'string', 'max:255'],
            'account_holder' => ['nullable', 'string', 'max:255'],
            'account_number' => ['nullable', 'string', 'max:50'],
            'ifsc_code'      => ['nullable', 'string', 'max:20'],
            'upi_id'         => ['nullable', 'string', 'max:255'],

            // Configurations
            'is_active'      => ['boolean'],
            'is_public'      => ['boolean'],
            'is_gst_registered' => ['boolean'],
            'is_iws_allowed'   => ['boolean'],
        ];
    }
}

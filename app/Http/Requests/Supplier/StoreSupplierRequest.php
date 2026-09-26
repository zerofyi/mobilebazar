<?php

namespace App\Http\Requests\Supplier;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('suppliers.create');
    }

    public function rules(): array
    {
        $user = $this->user();

        return [
            'store_id'        => [$user->store_id ? 'nullable' : 'required', 'integer', 'exists:stores,id'],
            'name'            => ['required', 'string', 'max:255'],
            'company_name'    => ['nullable', 'string', 'max:255'],
            'phone'           => ['required', 'string', 'max:20'],
            'email'           => ['nullable', 'email', 'max:255'],
            'gstin'           => ['nullable', 'string', 'max:20'],
            'opening_balance' => ['nullable', 'numeric'],
            'is_active'       => ['required', 'boolean'],

            // Address fields
            'address'                 => ['nullable', 'array'],
            'address.line1'           => ['nullable', 'string', 'max:255'],
            'address.village_or_area' => ['nullable', 'string', 'max:255'],
            'address.district'        => ['nullable', 'string', 'max:255'],
            'address.state'           => ['nullable', 'string', 'max:255'],
            'address.postal_code'     => ['nullable', 'string', 'max:20'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'store_id'        => $this->user()->store_id ?? $this->input('store_id'),
            'is_active'       => filter_var($this->is_active ?? true, FILTER_VALIDATE_BOOLEAN),
            'opening_balance' => (float) ($this->opening_balance ?? 0),
        ]);
    }
}

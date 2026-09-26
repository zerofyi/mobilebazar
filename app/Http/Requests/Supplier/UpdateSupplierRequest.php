<?php

namespace App\Http\Requests\Supplier;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSupplierRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('suppliers.update');
    }

    public function rules(): array
    {
        return [
            'name'         => ['required', 'string', 'max:255'],
            'company_name' => ['nullable', 'string', 'max:255'],
            'phone'        => ['required', 'string', 'max:20'],
            'email'        => ['nullable', 'email', 'max:255'],
            'gstin'        => ['nullable', 'string', 'max:20'],
            'is_active'    => ['required', 'boolean'],

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
        if ($this->has('is_active')) {
            $this->merge([
                'is_active' => filter_var($this->is_active, FILTER_VALIDATE_BOOLEAN),
            ]);
        }
    }
}

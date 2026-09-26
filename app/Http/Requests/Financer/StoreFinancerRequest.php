<?php

namespace App\Http\Requests\Financer;

use Illuminate\Foundation\Http\FormRequest;

class StoreFinancerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('financers.create');
    }

    public function rules(): array
    {
        $user = $this->user();

        return [
            'store_id'  => [$user->store_id ? 'nullable' : 'required', 'integer', 'exists:stores,id'],
            'name'      => ['required', 'string', 'max:255'],
            'mobile'    => ['required', 'string', 'max:20'],
            'type'      => ['required', 'string', 'in:individual,institution,company'],
            'limit'     => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['required', 'boolean'],
            'signature' => ['nullable', 'image', 'max:2048'], // 2MB max signature asset

            // Optional Polymorphic Address Fields
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
            'store_id'  => $this->user()->store_id ?? $this->input('store_id'),
            'type'      => $this->type ?? 'individual',
            'is_active' => filter_var($this->is_active ?? true, FILTER_VALIDATE_BOOLEAN),
            'limit'     => $this->filled('limit') ? (float) $this->limit : null,
        ]);
    }
}

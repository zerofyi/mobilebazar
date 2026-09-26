<?php

namespace App\Http\Requests\Financer;

use Illuminate\Foundation\Http\FormRequest;

class UpdateFinancerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('financers.update');
    }

    public function rules(): array
    {
        return [
            'name'      => ['required', 'string', 'max:255'],
            'mobile'    => ['required', 'string', 'max:20'],
            'type'      => ['required', 'string', 'in:individual,institution,company'],
            'limit'     => ['nullable', 'numeric', 'min:0'],
            'is_active' => ['required', 'boolean'],
            'signature' => ['nullable', 'image', 'max:2048'],

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
        if ($this->has('is_active')) {
            $this->merge([
                'is_active' => filter_var($this->is_active, FILTER_VALIDATE_BOOLEAN),
            ]);
        }
        if ($this->has('limit')) {
            $this->merge([
                'limit' => $this->filled('limit') ? (float) $this->limit : null,
            ]);
        }
    }
}

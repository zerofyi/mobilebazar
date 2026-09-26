<?php

namespace App\Http\Requests\Attribute;

use Illuminate\Foundation\Http\FormRequest;

class StoreAttributeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('attributes.manage');
    }

    public function rules(): array
    {
        return [
            'name'                 => ['required', 'string', 'max:255', 'unique:attributes,name'],
            'type'                 => ['nullable', 'string', 'max:255'],
            'is_variant_defining'  => ['required', 'boolean'],
            'values'               => ['required', 'array', 'min:1'],
            'values.*.value'       => ['required', 'string', 'max:255', 'distinct'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('is_variant_defining')) {
            $this->merge([
                'is_variant_defining' => filter_var($this->is_variant_defining, FILTER_VALIDATE_BOOLEAN),
            ]);
        }
    }
}

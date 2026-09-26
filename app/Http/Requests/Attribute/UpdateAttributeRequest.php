<?php

namespace App\Http\Requests\Attribute;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAttributeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('attributes.manage');
    }

    public function rules(): array
    {
        $attribute = $this->route('attribute');

        return [
            'name'                 => [
                'required',
                'string',
                'max:255',
                Rule::unique('attributes', 'name')->ignore($attribute?->id),
            ],
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

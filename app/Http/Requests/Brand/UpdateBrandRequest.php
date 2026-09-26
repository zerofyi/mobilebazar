<?php

namespace App\Http\Requests\Brand;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBrandRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('brands.manage');
    }

    public function rules(): array
    {
        // Get model instance via route parameter (using UUID route key)
        $brand = $this->route('brand');

        return [
            'name'      => ['required', 'string', 'max:255'],
            'slug'      => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('brands', 'slug')->ignore($brand?->id),
            ],
            'logo'      => [
                'nullable',
                'sometimes',
                function ($attribute, $value, $fail) {
                    // Accepts new File instance or pre-existing image URL string
                    if (!is_null($value) && !is_string($value) && !($value instanceof \Illuminate\Http\UploadedFile)) {
                        $fail('The ' . $attribute . ' must be a valid image file or URL.');
                    }
                },
                'max:2048', // 2MB max
            ],
            'is_active' => ['required', 'boolean'],
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

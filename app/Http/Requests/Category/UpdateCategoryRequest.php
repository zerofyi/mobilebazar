<?php

namespace App\Http\Requests\Category;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCategoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('categories.manage');
    }

    public function rules(): array
    {
        $category = $this->route('category');

        return [
            'parent_id'  => [
                'nullable',
                'integer',
                'exists:categories,id',
                Rule::notIn([$category?->id]), // Prevent self-referencing hierarchy
            ],
            'name'       => ['required', 'string', 'max:255'],
            'slug'       => [
                'nullable',
                'string',
                'max:255',
                Rule::unique('categories', 'slug')->ignore($category?->id),
            ],
            'image'      => [
                'nullable',
                'sometimes',
                function ($attribute, $value, $fail) {
                    if (!is_null($value) && !is_string($value) && !($value instanceof \Illuminate\Http\UploadedFile)) {
                        $fail('The ' . $attribute . ' must be a valid image file or URL.');
                    }
                },
                'max:2048',
            ],
            'icon'       => [
                'nullable',
                'sometimes',
                function ($attribute, $value, $fail) {
                    if (!is_null($value) && !is_string($value) && !($value instanceof \Illuminate\Http\UploadedFile)) {
                        $fail('The ' . $attribute . ' must be a valid icon file or URL.');
                    }
                },
                'max:2048',
            ],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['required', 'boolean'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('is_active')) {
            $this->merge([
                'is_active' => filter_var($this->is_active, FILTER_VALIDATE_BOOLEAN),
            ]);
        }

        if ($this->has('sort_order')) {
            $this->merge([
                'sort_order' => (int) $this->sort_order,
            ]);
        }
    }
}

<?php

namespace App\Http\Requests\Banner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateBannerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('banners.manage');
    }

    public function rules(): array
    {
        return [
            'title'      => ['required', 'string', 'max:255'],
            'image'      => [
                'nullable',
                'sometimes',
                function ($attribute, $value, $fail) {
                    // Allow uploaded files or pre-existing image string URLs
                    if (!is_null($value) && !is_string($value) && !($value instanceof \Illuminate\Http\UploadedFile)) {
                        $fail('The ' . $attribute . ' must be a valid image file or URL.');
                    }
                },
                'max:2048', // 2MB max
            ],
            'position'   => ['required', 'string', Rule::in(['main_slider', 'sidebar', 'popup', 'footer'])],
            'url_type'   => ['required', 'string', Rule::in(['product', 'category', 'custom', 'none'])],
            'url'        => ['nullable', 'required_unless:url_type,none', 'string', 'max:2048'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
            'is_active'  => ['required', 'boolean'],
            'starts_at'  => ['nullable', 'date'],
            'ends_at'    => ['nullable', 'date', 'after_or_equal:starts_at'],
            'store_id'   => ['nullable', 'integer', 'exists:stores,id'],
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

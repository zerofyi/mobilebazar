<?php

namespace App\Http\Requests\Banner;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

class StoreBannerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return Gate::allows('banners.manage');
    }

    public function rules(): array
    {
        $rules = [
            'title'      => ['required', 'string', 'max:255'],
            'image'      => ['nullable', 'file', 'mimes:jpg,jpeg,png,webp,svg', 'max:2048'],
            'url_type'   => ['required', 'string', Rule::in(['product', 'category', 'custom', 'none'])],
            'url'        => ['nullable', 'string', 'max:1000', Rule::requiredIf(fn () => in_array($this->url_type, ['product', 'category', 'custom']))],
            'position'   => ['required', 'string', Rule::in(['main_slider', 'sidebar', 'popup', 'footer'])],
            'sort_order' => ['required', 'integer', 'min:0'],
            'is_active'  => ['boolean'],
            'starts_at'  => ['nullable', 'date'],
            'ends_at'    => ['nullable', 'date', 'after_or_equal:starts_at'],
        ];

        // Global admins can assign specific store_id or leave null for global site-wide banner
        if ($this->user()?->store_id === null) {
            $rules['store_id'] = ['nullable', 'exists:stores,id'];
        }

        return $rules;
    }
}

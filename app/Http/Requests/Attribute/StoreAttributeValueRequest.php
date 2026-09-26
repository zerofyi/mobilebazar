<?php

declare(strict_types=1);

namespace App\Http\Requests\Attribute;

use App\Models\Attribute;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAttributeValueRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('products.create') || $this->user()->can('products.update');
    }

    public function rules(): array
    {
        /** @var Attribute $attribute */
        $attribute = $this->route('attribute');

        return [
            'value' => [
                'required',
                'string',
                'max:100',
                Rule::unique('attribute_values', 'value')->where('attribute_id', $attribute->id),
            ],
        ];
    }
}

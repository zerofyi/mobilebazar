<?php

namespace App\Http\Requests\Customer;

use Illuminate\Foundation\Http\FormRequest;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('customers.create');
    }

    public function rules(): array
    {
        return [
            'name'            => ['required', 'string', 'max:255'],
            'care_of'         => ['nullable', 'string', 'max:255'],
            'phone_primary'   => ['required', 'string', 'max:20', 'unique:customers,phone_primary'],
            'phone_secondary' => ['nullable', 'string', 'max:20'],
            'aadhaar_number'  => ['nullable', 'string', 'max:20', 'unique:customers,aadhaar_number'],
            'pan_number'      => ['nullable', 'string', 'max:20', 'unique:customers,pan_number'],
            'voter_number'    => ['nullable', 'string', 'max:20', 'unique:customers,voter_number'],
            'credit_limit'    => ['nullable', 'numeric', 'min:0'],
            'status'          => ['required', 'string', 'in:active,suspended,inactive'],
            'is_verified'     => ['required', 'boolean'],
            'address_snapshot' => ['nullable', 'string', 'max:1000'],

            'preferred_name'  => ['nullable', 'string', 'max:255'],

            // Media Assets
            'photo_file'         => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],
            'aadhaar_front_file' => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],
            'aadhaar_back_file'  => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],
            'voter_front_file'   => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],
            'voter_back_file'    => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],
            'pan_file'           => ['nullable', 'file', 'mimes:jpeg,png,webp,bmp', 'max:5120'],

            // Full Polymorphic Address Schema
            'address'                 => ['nullable', 'array'],
            'address.line1'           => ['nullable', 'string', 'max:255'],
            'address.line2'           => ['nullable', 'string', 'max:255'],
            'address.village_or_area' => ['nullable', 'string', 'max:255'],
            'address.post_office'     => ['nullable', 'string', 'max:255'],
            'address.police_station'  => ['nullable', 'string', 'max:255'],
            'address.city'            => ['nullable', 'string', 'max:255'],
            'address.district'        => ['nullable', 'string', 'max:255'],
            'address.state'           => ['nullable', 'string', 'max:255'],
            'address.postal_code'     => ['nullable', 'string', 'max:20'],
        ];
    }

    protected function prepareForValidation(): void
    {
        $this->merge([
            'status'       => $this->status ?? 'active',
            'is_verified'  => filter_var($this->is_verified ?? false, FILTER_VALIDATE_BOOLEAN),
            'credit_limit' => $this->filled('credit_limit') ? (float) $this->credit_limit : 0.00,
            'pan_number'   => $this->filled('pan_number') ? strtoupper($this->pan_number) : null,
            'voter_number' => $this->filled('voter_number') ? strtoupper($this->voter_number) : null,
        ]);
    }
}

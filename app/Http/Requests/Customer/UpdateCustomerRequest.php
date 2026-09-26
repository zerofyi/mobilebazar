<?php

namespace App\Http\Requests\Customer;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()->can('customers.update');
    }

    public function rules(): array
    {
        $customerId = $this->route('customer')?->id ?? $this->route('customer');

        // File validation rule that allows either a newly uploaded file or an existing URL string
        $mediaRule = [
            'nullable',
            function ($attribute, $value, $fail) {
                if ($value === null || is_string($value)) {
                    return;
                }

                if ($value instanceof UploadedFile) {
                    if (!$value->isValid()) {
                        $fail("The {$attribute} failed to upload properly.");
                        return;
                    }

                    $allowedMimes = ['jpeg', 'png', 'webp', 'bmp', 'jpg'];
                    $extension = strtolower($value->getClientOriginalExtension());

                    if (!in_array($extension, $allowedMimes)) {
                        $fail("The {$attribute} must be a file of type: " . implode(', ', $allowedMimes) . '.');
                    }

                    if ($value->getSize() > 5120 * 1024) { // 5MB limit
                        $fail("The {$attribute} must not be greater than 5 megabytes.");
                    }

                    return;
                }

                $fail("The {$attribute} must be a valid uploaded file or media URL.");
            },
        ];

        return [
            'name'             => ['required', 'string', 'max:255'],
            'care_of'          => ['nullable', 'string', 'max:255'],
            'phone_primary'    => ['required', 'string', 'max:20', 'unique:customers,phone_primary,' . $customerId],
            'phone_secondary'  => ['nullable', 'string', 'max:20'],
            'aadhaar_number'   => ['nullable', 'string', 'max:20', 'unique:customers,aadhaar_number,' . $customerId],
            'pan_number'       => ['nullable', 'string', 'max:20', 'unique:customers,pan_number,' . $customerId],
            'voter_number'     => ['nullable', 'string', 'max:20', 'unique:customers,voter_number,' . $customerId],
            'credit_limit'     => ['nullable', 'numeric', 'min:0'],
            'status'           => ['required', 'string', 'in:active,suspended,inactive'],
            'is_verified'      => ['required', 'boolean'],
            'address_snapshot' => ['nullable', 'string', 'max:1000'],

            // Media Assets - Accepts UploadedFile or existing URL string
            'photo_file'         => $mediaRule,
            'aadhaar_front_file' => $mediaRule,
            'aadhaar_back_file'  => $mediaRule,
            'voter_front_file'   => $mediaRule,
            'voter_back_file'    => $mediaRule,
            'pan_file'           => $mediaRule,

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
        if ($this->has('is_verified')) {
            $this->merge([
                'is_verified' => filter_var($this->is_verified, FILTER_VALIDATE_BOOLEAN),
            ]);
        }
        if ($this->has('pan_number')) {
            $this->merge([
                'pan_number' => $this->filled('pan_number') ? strtoupper($this->pan_number) : null,
            ]);
        }
        if ($this->has('voter_number')) {
            $this->merge([
                'voter_number' => $this->filled('voter_number') ? strtoupper($this->voter_number) : null,
            ]);
        }
    }
}

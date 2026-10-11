<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Validates a purchase-return (debit note) submission.
 *
 * Shape validation only — commercial validation (PO belongs to store, vendor
 * is a Supplier, units available / batch qty within remaining) lives in
 * DebitNoteService and returns 422 via ValidationException.
 */
class StoreDebitNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Store ownership is checked inside the controller (after store load).
        // Here we just confirm the user is authenticated and has a store.
        return $this->user() && $this->user()->ownedStore;
    }

    public function rules(): array
    {
        return [
            'purchase_order_id'       => ['required', 'integer', 'min:1'],
            'debit_note_date'         => ['required', 'date'],
            'reason'                  => ['required', 'string', 'max:255'],
            'notes'                   => ['nullable', 'string', 'max:2000'],

            'units'                   => ['nullable', 'array', 'max:500'],
            'units.*.stock_unit_id'   => ['required', 'integer', 'min:1'],

            'batches'                 => ['nullable', 'array', 'max:200'],
            'batches.*.stock_batch_id' => ['required', 'integer', 'min:1'],
            'batches.*.quantity'      => ['required', 'integer', 'min:1', 'max:100000'],
        ];
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if (empty($this->input('units')) && empty($this->input('batches'))) {
                $validator->errors()->add('items', 'Select at least one unit or batch to return.');
            }
        });
    }
}

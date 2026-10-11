<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

/**
 * Edit payload = the create payload shape, plus optional existing-row IDs
 * (purchase_order_item_id, stock_unit_id, stock_batch_id) so the backend can
 * apply row-level guards. No revision reason — revision increments silently.
 *
 * Immutable document fields (vendor, order_date, bill_type, is_gst_billed,
 * is_intra_state, type) are accepted but ignored on update; the service keeps
 * the posted originals.
 */
class UpdatePurchaseRequest extends StorePurchaseRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'lines.*.purchase_order_item_id' => ['nullable', 'integer'],
            'lines.*.units.*.stock_unit_id'  => ['nullable', 'integer'],
            'lines.*.batches.*.stock_batch_id' => ['nullable', 'integer'],
            'lines.*.batches.*.quantity'      => ['nullable', 'integer', 'min:0'],
        ]);
    }

    public function withValidator($validator): void
    {
        parent::withValidator($validator);

        // Edits always re-post as a completed document; a posted purchase
        // can never go back to draft through the edit flow.
        $validator->after(function ($v) {
            if (! empty($this->input('is_draft'))) {
                $v->errors()->add('is_draft', 'A posted purchase cannot be converted back to a draft.');
            }
        });
    }
}

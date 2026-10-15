<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

/**
 * Edit payload = the create payload shape. The backend reverses the original
 * sale completely and re-posts, so no row-level IDs are needed.
 *
 * Immutable document fields (invoice_number, invoice_date) are accepted but
 * ignored on update; the service keeps the posted originals. The party CAN
 * be changed (customer correction); the sale stays in its original month.
 */
class UpdateSaleRequest extends StoreSaleRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'security_pin'    => ['required', 'string'],
            'revision_reason' => ['nullable', 'string', 'max:500'],
        ]);
    }
}

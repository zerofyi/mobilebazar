<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Customer;

/**
 * Validates a loan edit submission.
 *
 * Locked on edit (inherited from the loan itself, not the payload):
 *  - borrower_type / borrower_id — the loan stays with its invoice's party;
 *    only the profile fields (identity, address, KYC) are editable.
 *  - invoice_id — a loan never changes the invoice it finances.
 *  - down_payment / down_payment_mode — forced to 0. The edit gate only
 *    allows loans with zero repayments, and a down payment IS a repayment.
 *  - guarantors — left untouched by edit (no UI for them on the edit form).
 *
 * Everything else mirrors StoreLoanRequest: identity, address, KYC uploads,
 * financer, and the full financial terms (which regenerate the schedule).
 */
class UpdateLoanRequest extends StoreLoanRequest
{
    /**
     * The invoice never changes on edit, but StoreLoanRequest's
     * principal-cap closure reads invoice_id from the input — feed it
     * from the loan so the cap (principal ≤ invoice due) still applies.
     */
    protected function prepareForValidation(): void
    {
        $loan = $this->route('loan');

        if ($loan) {
            $this->merge(['invoice_id' => $loan->invoice_id]);
        }
    }

    protected function isCustomerBorrower(): bool
    {
        return $this->route('loan')?->borrower_type === Customer::class;
    }

    protected function borrowerIdForUnique(): mixed
    {
        return $this->route('loan')?->borrower_id;
    }

    public function rules(): array
    {
        $rules = parent::rules();

        unset(
            $rules['borrower_type'],
            $rules['borrower_id'],
            $rules['invoice_id'],
            $rules['down_payment'],
            $rules['down_payment_mode'],
            $rules['guarantors'],
            $rules['guarantors.*.name'],
            $rules['guarantors.*.phone'],
            $rules['guarantors.*.relation'],
            $rules['guarantors.*.aadhaar_number'],
            $rules['guarantors.*.pan_number'],
        );

        return $rules;
    }

    /**
     * @return array<string, mixed>
     */
    public function validated($key = null, $default = null)
    {
        $data = parent::validated($key, $default);

        if ($key !== null || $default !== null) {
            return $data;
        }

        // The service works off these keys; on edit they always come from
        // the loan, never from the payload.
        $loan = $this->route('loan');
        $data['borrower_type'] = $loan->borrower_type;
        $data['borrower_id']   = $loan->borrower_id;
        $data['invoice_id']    = $loan->invoice_id;
        $data['down_payment']  = 0.0;
        unset($data['down_payment_mode'], $data['guarantors']);

        return $data;
    }
}

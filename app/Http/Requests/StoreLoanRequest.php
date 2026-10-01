<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\Customer;
use App\Models\Supplier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Validates a loan disbursal submission.
 *
 * Contract:
 *  - Every loan has a REAL borrower: borrower_type (Customer|Supplier FQCN)
 *    + borrower_id. No walk-ins.
 *  - invoice_id is required: the loan finances a posted invoice. The invoice
 *    must belong to the user's store, have due_amount > 0, and carry no other
 *    ACTIVE loan (one active loan per invoice — decision B). The invoice
 *    itself is never mutated by loan creation (decision D).
 *  - principal_amount defaults to the invoice due on the frontend and is
 *    editable here; down_payment must not exceed it.
 *  - interest_rate is a MONTHLY percent (flat interest, D1), 0–48.
 *  - tenure_months 1–84 (E cap), processing_fee ≥ 0,
 *    file_charge_mode upfront|spread (D2).
 *  - first_emi_date must be on/after disbursed_date.
 *  - Guarantors are optional in v1 (decision G): name + phone required per
 *    row, aadhaar/pan optional.
 */
class StoreLoanRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() && $this->user()->ownedStore;
    }

    public function rules(): array
    {
        $isCustomer = $this->input('borrower_type') === Customer::class;
        $borrowerId = $this->input('borrower_id');

        return [
            // ── Borrower (polymorphic party) ───────────────────────────────
            'borrower_type' => ['required', Rule::in([Customer::class, Supplier::class])],
            'borrower_id'   => [
                'required',
                'integer',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $table = $this->input('borrower_type') === Supplier::class
                        ? 'suppliers'
                        : 'customers';

                    $query = DB::table($table)->where('id', $value);

                    // Suppliers are store-scoped; customers are a global master.
                    if ($table === 'suppliers') {
                        $storeId = $this->user()?->ownedStore?->id ?? $this->user()?->store_id;
                        $query->where('store_id', $storeId);
                    }

                    if (! $query->exists()) {
                        $fail('The selected borrower is invalid.');
                    }
                },
            ],

            // ── Borrower identity (editable on the loan form) ──────────────
            // Customer: full identity card. Supplier: name + phone only —
            // suppliers carry no photo and no ID numbers.
            'customer.name' => [Rule::requiredIf($isCustomer), 'nullable', 'string', 'max:150'],
            'customer.care_of' => ['nullable', 'string', 'max:150'],
            'customer.phone_primary' => [
                Rule::requiredIf($isCustomer),
                'nullable',
                'string',
                'max:20',
                Rule::unique('customers', 'phone_primary')->ignore($borrowerId),
            ],
            'customer.phone_secondary' => ['nullable', 'string', 'max:20'],
            'customer.aadhaar_number'  => [
                'nullable', 'string', 'max:20',
                Rule::unique('customers', 'aadhaar_number')->ignore($borrowerId),
            ],
            'customer.pan_number' => [
                'nullable', 'string', 'max:20',
                Rule::unique('customers', 'pan_number')->ignore($borrowerId),
            ],
            'customer.voter_number' => [
                'nullable', 'string', 'max:20',
                Rule::unique('customers', 'voter_number')->ignore($borrowerId),
            ],
            'supplier.name'  => [Rule::requiredIf(! $isCustomer), 'nullable', 'string', 'max:150'],
            'supplier.phone' => ['nullable', 'string', 'max:20'],

            // ── Borrower address (morph; editable on the loan form) ────────
            'address.line1'           => ['nullable', 'string', 'max:255'],
            'address.line2'           => ['nullable', 'string', 'max:255'],
            'address.village_or_area' => ['required', 'string', 'max:150'],
            'address.post_office'     => ['required', 'string', 'max:150'],
            'address.police_station'  => ['required', 'string', 'max:150'],
            'address.city'            => ['nullable', 'string', 'max:150'],
            'address.district'        => ['required', 'string', 'max:150'],
            'address.state'           => ['required', 'string', 'max:100'],
            'address.postal_code'     => ['required', 'string', 'max:20'],

            // ── Identity assets (all via the HasAssets media pipeline) ─────
            // ssm-exact: customer photo + 5 KYC doc slots. Uploads create NEW
            // asset rows; nothing already on file is ever replaced or deleted.
            'photo'            => ['nullable', 'file', 'image', 'max:2048'],
            'doc_aadhaar_front' => ['nullable', 'file', 'image', 'max:2048'],
            'doc_aadhaar_back'  => ['nullable', 'file', 'image', 'max:2048'],
            'doc_pan'           => ['nullable', 'file', 'image', 'max:2048'],
            'doc_voter_front'   => ['nullable', 'file', 'image', 'max:2048'],
            'doc_voter_back'    => ['nullable', 'file', 'image', 'max:2048'],

            // ── Invoice being financed ─────────────────────────────────────
            'invoice_id' => [
                'required',
                'integer',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $storeId = $this->user()?->ownedStore?->id ?? $this->user()?->store_id;

                    $invoice = DB::table('invoices')
                        ->where('id', $value)
                        ->where('store_id', $storeId)
                        ->first(['due_amount']);

                    if (! $invoice) {
                        $fail('The selected invoice is invalid.');

                        return;
                    }

                    if ((float) $invoice->due_amount <= 0) {
                        $fail('The invoice has no outstanding due to finance.');
                    }
                },
            ],

            // ── Financer (every loan is under a financer) ────────────────────
            'financer_id' => [
                'required',
                'integer',
                function (string $attribute, mixed $value, \Closure $fail) {
                    $storeId = $this->user()?->ownedStore?->id ?? $this->user()?->store_id;
                    $exists  = DB::table('financers')
                        ->where('id', $value)
                        ->where('store_id', $storeId)
                        ->where('is_active', true)
                        ->exists();

                    if (! $exists) {
                        $fail('The selected financer is invalid.');
                    }
                },
            ],

            // ── Financials ─────────────────────────────────────────────────
            'principal_amount' => ['required', 'numeric', 'min:0.01', 'max:99999999.99'],
            'down_payment'     => ['required', 'numeric', 'min:0', 'lte:principal_amount'],
            'down_payment_mode' => ['required', Rule::in(['cash', 'upi', 'bank', 'card', 'neft', 'cheque'])],
            'interest_rate'    => ['nullable', 'numeric', 'min:0', 'max:48'],
            'tenure_months'    => ['required', 'integer', 'min:1', 'max:84'],
            'processing_fee'   => ['nullable', 'numeric', 'min:0', 'max:99999999.99'],
            'file_charge_mode' => ['required', Rule::in(['upfront', 'spread'])],
            'collection_slab'  => ['nullable', 'string', 'max:50'],

            // ── Dates ──────────────────────────────────────────────────────
            'disbursed_date' => ['required', 'date'],
            'first_emi_date' => ['nullable', 'date', 'after_or_equal:disbursed_date'],

            // ── Ops ────────────────────────────────────────────────────────
            'assigned_agent_id' => ['nullable', 'integer', 'exists:users,id'],
            'notes'             => ['nullable', 'string', 'max:2000'],

            // ── Guarantors (optional, v1) ──────────────────────────────────
            'guarantors'               => ['nullable', 'array', 'max:5'],
            'guarantors.*.name'        => ['required_with:guarantors', 'string', 'max:150'],
            'guarantors.*.phone'       => ['required_with:guarantors', 'string', 'max:20'],
            'guarantors.*.relation'    => ['nullable', 'string', 'max:50'],
            'guarantors.*.aadhaar_number' => ['nullable', 'string', 'max:20'],
            'guarantors.*.pan_number'  => ['nullable', 'string', 'max:20'],
        ];
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

        // Normalize optionals the service expects as concrete values.
        $data['interest_rate']  = $data['interest_rate'] ?? null; // null → store default
        $data['processing_fee'] = $data['processing_fee'] ?? null; // null → store default
        $data['down_payment']   = (float) ($data['down_payment'] ?? 0);

        return $data;
    }
}

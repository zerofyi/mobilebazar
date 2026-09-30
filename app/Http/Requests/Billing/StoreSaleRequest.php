<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validates a POS sale submission.
 *
 * Design contract (mirrors StorePurchaseRequest, adapted for sales):
 *  - Every sale has a REAL party: party_type (customer|supplier) + party_id.
 *    Walk-in sales without a master record are not supported — the UI offers
 *    the global customer/supplier quick-add modals instead.
 *  - invoice_type retail|wholesale comes from the header toggle. Wholesale
 *    pricing is resolved client-side from stock_units.wholesale_price
 *    (serialized) / product_variants.min_selling_price (bulk); the backend
 *    honors the submitted unit prices as the user's choice.
 *  - The request carries the USER'S CHOICES: prices, discounts, is_gst_billed,
 *    is_intra_state, tax_type per line. These are honored, never overridden.
 *  - The backend (SaleGstEvaluationService) computes the MONEY from database
 *    truth (each unit's / batch's landed_cost + is_margin_scheme) and rejects
 *    the submission if the client preview differs beyond 5 paise.
 *  - Serialized lines reference EXACT stock units (stock_unit_ids); the
 *    service locks and verifies each one inside the transaction.
 */
class StoreSaleRequest extends FormRequest
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
            // ── Idempotency ───────────────────────────────────────────────
            // Client generates a UUID once per sale and reuses it across retries.
            'idempotency_key' => ['required', 'uuid'],

            // ── Document meta ─────────────────────────────────────────────
            // invoice_number is nullable — the server reserves it authoritatively
            // inside the sale transaction; any frontend preview is discarded.
            'invoice_number' => ['nullable', 'string', 'max:50'],
            'invoice_date'   => ['required', 'date'],

            // ── Party (every sale needs a real master record) ───────────────
            // customer = retail buyer | supplier = "party" table, wholesale/B2B.
            // No walk-ins: the POS offers the global quick-add modals instead.
            'party_type'     => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'       => [
                'required',
                'integer',
                // Table depends on party_type: customers for retail buyers,
                // suppliers (the "party" table) for wholesale/B2B buyers.
                // Store-scoped for suppliers only: a tampered request cannot
                // bill to another store's party. Customers are a global master
                // (no store_id column on the customers table).
                function (string $attribute, mixed $value, \Closure $fail) {
                    $table = $this->input('party_type') === 'supplier' ? 'suppliers' : 'customers';
                    $query = \Illuminate\Support\Facades\DB::table($table)->where('id', $value);
                    if ($table === 'suppliers') {
                        $storeId = $this->user()?->ownedStore?->id ?? $this->user()?->store_id;
                        $query->where('store_id', $storeId);
                    }
                    if (! $query->exists()) {
                        $fail('The selected party is invalid.');
                    }
                },
            ],

            // ── Sale mode ───────────────────────────────────────────────────
            'invoice_type'   => ['required', Rule::in(['retail', 'wholesale'])],

            // ── User's GST choices (honored as sent) ──────────────────────
            'is_gst_billed'  => ['required', 'boolean'],
            'is_intra_state' => ['required', 'boolean'],

            // ── Financials (client preview; backend recomputes + checks) ──
            'subtotal'        => ['required', 'numeric', 'min:0'],
            'tax_amount'      => ['required', 'numeric', 'min:0'],
            'discount_amount' => ['required', 'numeric', 'min:0'],
            'shipping_charge' => ['sometimes', 'numeric', 'min:0'],
            'round_off'       => ['required', 'numeric'],
            'grand_total'     => ['required', 'numeric', 'min:0.01'],
            'paid_amount'     => ['required', 'numeric', 'min:0'],
            'due_amount'      => ['required', 'numeric', 'min:0'],

            // ── Payment ───────────────────────────────────────────────────
            'payment_status' => ['required', Rule::in(['paid', 'partial', 'unpaid'])],
            'payment_mode'   => ['required', Rule::in(['cash', 'upi', 'neft', 'cheque', 'card', 'bank'])],

            // ── Misc ──────────────────────────────────────────────────────
            'notes' => ['nullable', 'string', 'max:1000'],

            // ── Lines ─────────────────────────────────────────────────────
            'lines'                          => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id'     => ['nullable', 'integer', 'exists:product_variants,id'],
            'lines.*.manual_item_name'       => ['nullable', 'string', 'max:200'],
            'lines.*.warranty'               => ['nullable', 'string', 'max:100'],
            'lines.*.manual_hsn'             => ['nullable', 'string', 'max:20'],
            'lines.*.is_serialized'          => ['required', 'boolean'],
            'lines.*.qty'                    => ['required', 'integer', 'min:1'],
            'lines.*.stock_unit_ids'         => ['nullable', 'array'],
            'lines.*.stock_unit_ids.*'       => ['integer', 'min:1'],
            // Bulk lines: the cashier's chosen batch (POS batch picker).
            // The service allocates from it first, then continues FIFO.
            // A foreign/empty/QC-held id is rejected with 422 by the service.
            'lines.*.preferred_batch_id'    => ['nullable', 'integer', 'exists:stock_batches,id'],
            'lines.*.unit_price'             => ['required', 'numeric', 'min:0'],
            'lines.*.discount_amount'        => ['required', 'numeric', 'min:0'],
            'lines.*.tax_type'               => ['required', Rule::in(['inclusive', 'exclusive'])],
            'lines.*.tax_pct'                => ['required', 'numeric', 'min:0', 'max:100'],
            'lines.*.line_total'             => ['required', 'numeric', 'min:0'],
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Cross-field domain validation (things rules() can't express)
    |--------------------------------------------------------------------------
    */
    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            // ── Party is mandatory (no walk-ins) ──────────────────────────
            if (empty($this->input('party_id'))) {
                $v->errors()->add('party_id', 'Select a customer or party for this sale.');
            }

            // ── paid_amount can never exceed grand_total ──────────────────
            if ((float) $this->input('paid_amount', 0) > (float) $this->input('grand_total', 0) + 0.001) {
                $v->errors()->add('paid_amount', 'Paid amount cannot exceed the grand total.');
            }

            $lines = $this->input('lines', []);
            $seenUnits = [];

            foreach ($lines as $i => $line) {
                $isSerialized = (bool) ($line['is_serialized'] ?? false);
                $qty          = (int) ($line['qty'] ?? 0);
                $unitIds      = $line['stock_unit_ids'] ?? [];

                // ── Every line needs a catalog variant or a manual name ───
                $hasVariant = ! empty($line['product_variant_id']);
                $hasManual  = trim((string) ($line['manual_item_name'] ?? '')) !== '';
                if (! $hasVariant && ! $hasManual) {
                    $v->errors()->add("lines.{$i}", 'Each line must have a catalog product or a manual item name.');
                }

                if ($isSerialized) {
                    // Serialized: the exact units being sold must be listed,
                    // one id per qty, no repeats within the submission.
                    if (count($unitIds) !== $qty) {
                        $v->errors()->add(
                            "lines.{$i}.stock_unit_ids",
                            "A serialized line of qty {$qty} must list exactly {$qty} unit(s)."
                        );
                    }
                    foreach ($unitIds as $uid) {
                        $uid = (int) $uid;
                        if (isset($seenUnits[$uid])) {
                            $v->errors()->add("lines.{$i}.stock_unit_ids", "Unit #{$uid} is listed twice in this sale.");
                        }
                        $seenUnits[$uid] = true;
                    }
                } elseif (! empty($unitIds)) {
                    $v->errors()->add("lines.{$i}.stock_unit_ids", 'Bulk lines must not list stock units.');
                }

                // ── Line discount can never exceed the line gross ──────────
                $gross = (float) ($line['unit_price'] ?? 0) * $qty;
                if ((float) ($line['discount_amount'] ?? 0) > $gross + 0.001) {
                    $v->errors()->add("lines.{$i}.discount_amount", 'Line discount cannot exceed the line gross.');
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'lines.required'           => 'Add at least one line item.',
            'lines.min'                => 'Add at least one line item.',
            'grand_total.min'          => 'Grand total must be greater than zero.',
            'idempotency_key.required' => 'Submission key missing — please refresh and try again.',
            'idempotency_key.uuid'     => 'Invalid submission key.',
        ];
    }
}

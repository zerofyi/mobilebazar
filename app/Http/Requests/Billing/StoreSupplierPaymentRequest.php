<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSupplierPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Store ownership is checked inside the controller (after store load).
        // Here we just confirm the user is authenticated and has a store.
        return $this->user() && $this->user()->ownedStore;
    }

    public function rules(): array
    {
        // 'today' in a date rule resolves in the APP timezone (UTC) — before
        // 05:30 IST a payment dated today (store time) was rejected as being
        // in the future. Validate against the store's business date.
        $businessToday = $this->user()?->ownedStore?->businessToday()
            ?? now('Asia/Kolkata')->toDateString();

        return [
            // ── Target POs (v1): one of these must identify the purchase(s) ───
            'purchase_order_id'  => ['nullable', 'uuid', 'required_without:purchase_order_ids'],
            'purchase_order_ids' => ['nullable', 'array', 'min:1', 'required_without:purchase_order_id'],
            'purchase_order_ids.*' => ['uuid'],

            // ── Explicit per-PO split (optional; otherwise auto-allocated oldest-due-first)
            'allocations'                          => ['nullable', 'array', 'min:1'],
            'allocations.*.purchase_order_id'      => ['required', 'uuid'],
            'allocations.*.amount'                 => ['required', 'numeric', 'min:0.01'],

            // ── Money ─────────────────────────────────────────────────────────
            'amount'       => ['required', 'numeric', 'min:0.01'],
            'payment_mode' => ['required', Rule::in(['cash', 'bank', 'upi', 'card', 'neft', 'rtgs', 'imps', 'cheque'])],
            'paid_at'      => ['required', 'date', 'before_or_equal:' . $businessToday],

            'txn_reference' => ['nullable', 'string', 'max:100'],
            'notes'         => ['nullable', 'string', 'max:1000'],
            'idempotency_key' => ['nullable', 'uuid'],
        ];
    }

    public function messages(): array
    {
        return [
            'purchase_order_id.required_without'  => 'Select at least one purchase order.',
            'purchase_order_ids.required_without' => 'Select at least one purchase order.',
        ];
    }
}

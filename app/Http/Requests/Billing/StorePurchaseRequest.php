<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class StorePurchaseRequest extends FormRequest
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
            // ── Idempotency (Bug #3 fix: now required and used) ───────────────
            // The client generates a UUID once per form mount and includes it
            // with every submit. The controller checks this before processing.
            'idempotency_key'     => ['required', 'uuid'],

            // ── Document meta ─────────────────────────────────────────────────
            // po_number is now nullable — the server generates it authoritatively.
            // The frontend preview value is discarded; we only use the server one.
            'po_number'           => ['nullable', 'string', 'max:50'],
            'vendor_invoice_no'   => ['nullable', 'string', 'max:100'],
            'order_date'          => ['required', 'date'],

            // ── Party ─────────────────────────────────────────────────────────
            'party_type'          => ['required', Rule::in(['customer', 'supplier'])],
            'party_id'            => ['required', 'integer', 'min:1'],

            // ── Phase 2 GST flags ─────────────────────────────────────────────
            'bill_type'           => ['required', Rule::in(['po', 'pv'])],
            'is_gst_billed'       => ['required', 'boolean'],
            'is_intra_state'      => ['required', 'boolean'],

            // ── Financials ────────────────────────────────────────────────────
            'subtotal'            => ['required', 'numeric', 'min:0'],
            'tax_amount'          => ['required', 'numeric', 'min:0'],
            'discount_amount'     => ['required', 'numeric', 'min:0'],
            'shipping_charge'     => ['required', 'numeric', 'min:0'],
            'grand_total'         => ['required', 'numeric', 'min:0.01'],
            'paid_amount'         => ['required', 'numeric', 'min:0'],
            'due_amount'          => ['required', 'numeric', 'min:0'],

            // ── Payment ───────────────────────────────────────────────────────
            'payment_status'      => ['required', Rule::in(['paid', 'partial', 'unpaid', 'draft'])],
            // Bug #8 fix: payment_mode is nullable — drafts and unpaid purchases
            // have no payment mode yet. The client may send null/empty.
            'payment_mode'        => ['nullable', Rule::in(['cash', 'upi', 'neft', 'cheque', 'card'])],

            // ── Misc ──────────────────────────────────────────────────────────
            'notes'                    => ['nullable', 'string', 'max:1000'],
            'invoice_document_path'    => ['nullable', 'string', 'max:500'],
            'additional_document_path' => ['nullable', 'string', 'max:500'],
            'is_draft'                 => ['required', 'boolean'],
            'type'                     => ['required', 'string', Rule::in(['direct'])],

            // ── Lines ─────────────────────────────────────────────────────────
            'lines'                    => ['required', 'array', 'min:1'],
            'lines.*.product_variant_id' => ['nullable', 'integer', 'exists:product_variants,id'],
            'lines.*.manual_item_name'   => ['nullable', 'string', 'max:200'],
            'lines.*.manual_hsn'         => ['nullable', 'string', 'max:20'],
            'lines.*.is_serialized'      => ['required', 'boolean'],
            'lines.*.tax_type'           => ['required', Rule::in(['inclusive', 'exclusive'])],
            'lines.*.tax_pct'            => ['required', 'numeric', 'min:0', 'max:100'],
            'lines.*.is_margin_scheme'   => ['required', 'boolean'],
            'lines.*.base_cost'          => ['required', 'numeric', 'min:0'],
            'lines.*.landed_cost'        => ['required', 'numeric', 'min:0'],
            'lines.*.tax_amount'         => ['required', 'numeric', 'min:0'],
            'lines.*.discount_amount'    => ['required', 'numeric', 'min:0'],
            'lines.*.line_total'         => ['required', 'numeric', 'min:0'],

            // Bug #9 fix: ordered_qty / unit_cost are required only for bulk lines.
            // Serialized lines send null here; quantity is derived from units[].
            'lines.*.ordered_qty' => ['nullable', 'integer', 'min:1'],
            'lines.*.unit_cost'   => ['nullable', 'numeric',  'min:0'],
            'lines.*.wholesale_price' => ['nullable', 'numeric', 'min:0'],
            'lines.*.selling_price'   => ['nullable', 'numeric', 'min:0'],
            // Bulk lines carry their condition so the batch keeps it (previously dropped).
            'lines.*.condition_code'  => ['nullable', 'string', 'max:30', Rule::exists('device_conditions', 'code')],
            'lines.*.overall_health'  => ['nullable', 'string', 'max:50'],
            // Bulk batch warranty: duration-style only ('D' mode, e.g. '6 months'),
            // mirroring stock_units.remaining_warranty.
            'lines.*.remaining_warranty' => ['nullable', 'string', 'max:100'],

            // ── Units (serialized) ────────────────────────────────────────────
            'lines.*.units'                      => ['nullable', 'array'],
            'lines.*.units.*.imei1'              => ['nullable', 'string', 'max:20'],
            'lines.*.units.*.imei2'              => ['nullable', 'string', 'max:20'],
            'lines.*.units.*.serial_number'      => ['nullable', 'string', 'max:50'],
            'lines.*.units.*.device_condition_code' => ['nullable', 'string', 'max:30'],
            // Bug #10 fix: overall_health and warranty_mode are optional in the UI.
            'lines.*.units.*.overall_health'     => ['nullable', 'string', 'max:50'],
            'lines.*.units.*.battery_health_pct' => ['nullable', 'integer', 'min:0', 'max:100'],
            'lines.*.units.*.warranty_mode'      => ['nullable', Rule::in(['D', 'A', 'E'])],
            'lines.*.units.*.warranty_value'     => ['nullable', 'string', 'max:20'],
            'lines.*.units.*.unit_base_cost'     => ['nullable', 'numeric', 'min:0'],
            'lines.*.units.*.unit_landed_cost'   => ['nullable', 'numeric', 'min:0'],
            'lines.*.units.*.wholesale_price'    => ['nullable', 'numeric', 'min:0'],
            'lines.*.units.*.selling_price'      => ['nullable', 'numeric', 'min:0'],
            'lines.*.units.*.is_margin_scheme'   => ['nullable', 'boolean'],
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
            $lines = $this->input('lines', []);

            foreach ($lines as $i => $line) {
                $isSerialized = (bool) ($line['is_serialized'] ?? false);
                $units        = $line['units'] ?? [];

                // ── Every line must have a product or a manual name ───────────
                $hasVariant = !empty($line['product_variant_id']);
                $hasManual  = !empty(trim($line['manual_item_name'] ?? ''));
                if (!$hasVariant && !$hasManual) {
                    $v->errors()->add("lines.{$i}", 'Each line must have a catalog product or a manual item name.');
                }

                if ($isSerialized) {
                    // Serialized: units array must be present and non-empty
                    if (empty($units)) {
                        $v->errors()->add("lines.{$i}.units", 'A serialized line must have at least one unit.');
                    }

                    foreach ($units as $j => $unit) {
                        // Each unit must have IMEI 1 or a serial number
                        $hasImei   = !empty(trim($unit['imei1'] ?? ''));
                        $hasSerial = !empty(trim($unit['serial_number'] ?? ''));
                        if (!$hasImei && !$hasSerial) {
                            $v->errors()->add(
                                "lines.{$i}.units.{$j}",
                                'Every serialized unit needs IMEI 1 or a serial number.'
                            );
                        }
                    }
                } else {
                    // Bulk: ordered_qty and unit_cost are mandatory
                    if (empty($line['ordered_qty']) || (int) $line['ordered_qty'] < 1) {
                        $v->errors()->add("lines.{$i}.ordered_qty", 'Bulk lines require a quantity of at least 1.');
                    }
                    if (!isset($line['unit_cost']) || (float) $line['unit_cost'] < 0) {
                        $v->errors()->add("lines.{$i}.unit_cost", 'Bulk lines require a unit cost.');
                    }
                }
            }

            // ── Global IMEI / serial uniqueness within this submission ────────
            // Catches duplicates across different line groups before any DB write.
            $seen = [];
            foreach ($lines as $i => $line) {
                if (empty($line['is_serialized'])) {
                    continue;
                }
                foreach ($line['units'] ?? [] as $j => $unit) {
                    foreach (['imei1', 'imei2', 'serial_number'] as $field) {
                        $val = trim($unit[$field] ?? '');
                        if ($val === '') {
                            continue;
                        }
                        $key = "{$field}:{$val}";
                        if (isset($seen[$key])) {
                            $v->errors()->add(
                                "lines.{$i}.units.{$j}.{$field}",
                                "Duplicate {$field} '{$val}' in this purchase."
                            );
                        }
                        $seen[$key] = true;
                    }
                }
            }

            // ── Active-stock IMEI / serial conflicts ──────────────────────────
            // stock_units enforces active-only uniqueness (uniq_active_imei1/2/
            // uniq_active_serial). Catch conflicts here as 422 instead of letting
            // the insert blow up with a 500. (The service still translates the
            // concurrent-race case, where two purchases pass this check at once.)
            $identifiers = ['imei1' => [], 'imei2' => [], 'serial_number' => []];
            foreach ($lines as $line) {
                if (empty($line['is_serialized'])) {
                    continue;
                }
                foreach ($line['units'] ?? [] as $unit) {
                    foreach (['imei1', 'imei2', 'serial_number'] as $field) {
                        $val = trim($unit[$field] ?? '');
                        if ($val !== '') {
                            $identifiers[$field][] = $val;
                        }
                    }
                }
            }

            $columnMap = ['imei1' => 'active_imei1', 'imei2' => 'active_imei2', 'serial_number' => 'active_serial'];
            foreach ($identifiers as $field => $values) {
                $values = array_values(array_unique($values));
                if ($values === []) {
                    continue;
                }
                $taken = DB::table('stock_units')
                    ->whereIn($columnMap[$field], $values)
                    ->whereIn('status', ['available', 'reserved'])
                    ->pluck($columnMap[$field])
                    ->all();
                foreach ($taken as $dup) {
                    $v->errors()->add('lines', "Identifier '{$dup}' ({$field}) is already in active stock.");
                }
            }
        });
    }

    public function messages(): array
    {
        return [
            'lines.required'           => 'Add at least one line item.',
            'lines.min'                => 'Add at least one line item.',
            'party_id.required'        => 'Select a customer or supplier.',
            'grand_total.min'          => 'Grand total must be greater than zero.',
            'idempotency_key.required' => 'Submission key missing — please refresh and try again.',
            'idempotency_key.uuid'     => 'Invalid submission key.',
        ];
    }
}

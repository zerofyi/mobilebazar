<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

use Illuminate\Validation\Rule;

/**
 * Validates a stock-transfer submission.
 *
 * A transfer IS a sale (source store) + a purchase (target store), so the
 * payload is the POS sale payload, unchanged — StoreSaleRequest supplies
 * every rule. This subclass adds only what a transfer needs on top:
 *
 *  - the party must be a SUPPLIER (the record that can carry a GSTIN and a
 *    store attachment — customers have neither);
 *  - round_off must be 0: the mirrored purchase has no round-off field and
 *    its journal identity must hold to the paise in the target store;
 *  - no buyback payment splits and no payment→purchase links (those belong
 *    to the buyback flow; here the purchase is created by the transfer
 *    itself, after the sale);
 *  - no manual lines: only stock-backed items can move between stores.
 *
 * The attachment preconditions themselves (party has a store attached; the
 * target store attached this store back) are checked in
 * StockTransferService, where both supplier rows can be locked.
 */
class StoreStockTransferRequest extends StoreSaleRequest
{
    public function rules(): array
    {
        $rules = parent::rules();

        $rules['party_type'] = ['required', Rule::in(['supplier'])];

        return $rules;
    }

    public function withValidator($validator): void
    {
        parent::withValidator($validator);

        $validator->after(function ($v) {
            if (abs((float) $this->input('round_off', 0)) > 0.005) {
                $v->errors()->add(
                    'round_off',
                    'Round-off must be 0 for a stock transfer, so the sale and the purchase total match exactly in both stores.'
                );
            }

            if (strtolower((string) $this->input('payment_mode', '')) === 'buyback') {
                $v->errors()->add('payments', 'Buyback adjustment is not available on a stock transfer.');
            }

            foreach ($this->input('payments', []) as $i => $p) {
                if (strtolower((string) ($p['mode'] ?? '')) === 'buyback') {
                    $v->errors()->add("payments.{$i}.mode", 'Buyback adjustment is not available on a stock transfer.');
                }
                if (! empty($p['purchase_order_id'])) {
                    $v->errors()->add("payments.{$i}.purchase_order_id", 'Payments on a stock transfer cannot be linked to a purchase bill.');
                }
            }

            foreach ($this->input('lines', []) as $i => $line) {
                if (! empty($line['is_serialized'])) {
                    continue;
                }
                if (empty($line['product_variant_id']) && empty($line['preferred_batch_id'])) {
                    $v->errors()->add("lines.{$i}", 'Manual items cannot be transferred — only stock items move between stores.');
                }
            }
        });
    }

    public function messages(): array
    {
        return array_merge(parent::messages(), [
            'party_type.in' => 'A stock transfer must be billed to a supplier with a store attached.',
        ]);
    }
}

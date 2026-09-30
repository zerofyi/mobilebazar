<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Store;

/**
 * Server-side fiscal evaluation for sales.
 *
 * The frontend sends the USER'S CHOICES — unit prices, line discounts,
 * is_gst_billed, is_intra_state per line. Those are honored exactly
 * as sent; this service never flips them.
 *
 * What this service DOES compute, from database truth, is the MONEY:
 * every sold unit's / batch's landed_cost and is_margin_scheme flag live in
 * the DB, so only the backend can authoritatively work out taxable values,
 * GST, and COGS. The POS preview (sale-context.tsx) implements the identical
 * formulas, so preview and posting agree by construction; SaleService rejects
 * the submission if they drift beyond 5 paise (tamper / stale stock safety).
 *
 * GST is ALWAYS inclusive when it applies: the price the buyer pays already
 * contains the tax. (The legacy 'exclusive' tax_type is accepted in the
 * payload for history but no longer changes the math.)
 *
 * Per-unit math:
 *   discPerUnit = line.discount_amount / line.qty
 *   net         = line.unit_price - discPerUnit          (what the buyer pays)
 *   - GST not billed, or rate 0 : tax = 0, taxable = net, total = net
 *   - margin scheme row         : margin = max(0, net - landed_cost)
 *                                 tax = margin * r / (100 + r)   [embedded in price]
 *                                 taxable = net - tax, total = net
 *   - otherwise (inclusive)     : tax = net * r / (100 + r), taxable = net - tax, total = net
 *
 * Header: subtotal = Σ taxable, tax_amount = Σ tax,
 *         grand_total = subtotal + tax_amount - discount_amount(bill) + round_off.
 * taxable_value is always derivable as line_total - tax_amount, so no schema
 * change was needed on invoice_items.
 *
 * S1–S5 document classification lives in ::documentType() and is mirrored
 * by deriveDocument() in sale-context.tsx — keep the two in sync.
 */
final class SaleGstEvaluationService
{
    /**
     * @param array $data    Validated sale payload (StoreSaleRequest).
     * @param array $costings Per line-index, the locked stock behind the sale:
     *   $costings[$lineIndex] = list of [
     *     'qty' => int, 'landed_cost' => float, 'is_margin_scheme' => bool,
     *     'stock_unit_id' => ?int, 'stock_batch_id' => ?int,
     *     'device_condition' => ?string,          // serialized only, for new/used summary split
     *   ]
     *
     * @return array{
     *   rows: list<array{
     *     line_index: int, qty: int, stock_unit_id: ?int, stock_batch_id: ?int,
     *     unit_price: float, discount_amount: float, taxable_value: float,
     *     tax_pct: float, tax_amount: float, line_total: float,
     *     is_margin_scheme: bool, landed_cost: float, device_condition: ?string,
     *   }>,
     *   subtotal: float, tax_amount: float, discount_amount: float,
     *   round_off: float, grand_total: float, cogs_total: float,
     * }
     */
    public function evaluate(Store $store, array $data, array $costings): array
    {
        $isGstBilled = (bool) $data['is_gst_billed'];

        $rows      = [];
        $subtotal  = 0.0;
        $taxTotal  = 0.0;
        $cogsTotal = 0.0;

        foreach ($data['lines'] as $lineIndex => $line) {
            $qty          = max(1, (int) $line['qty']);
            $discPerUnit  = $this->r2(((float) $line['discount_amount']) / $qty);
            $unitPrice    = $this->r2($line['unit_price']);
            $net          = $this->r2($unitPrice - $discPerUnit);
            $rate         = (float) $line['tax_pct'];
            $entries      = $costings[$lineIndex] ?? [];

            // Manual (non-catalog) lines have no stock behind them.
            if ($entries === []) {
                $entries = [[
                    'qty' => $qty, 'landed_cost' => 0.0, 'is_margin_scheme' => false,
                    'stock_unit_id' => null, 'stock_batch_id' => null, 'device_condition' => null,
                ]];
            }

            foreach ($entries as $entry) {
                $entryQty = (int) $entry['qty'];
                $landed   = (float) $entry['landed_cost'];
                $margin   = (bool) $entry['is_margin_scheme'];

                [$taxable, $tax, $total] = $this->evaluateUnit($net, $rate, (string) $line['tax_type'], $landed, $margin, $isGstBilled);

                $rows[] = [
                    'line_index'       => $lineIndex,
                    'qty'              => $entryQty,
                    'stock_unit_id'    => $entry['stock_unit_id'],
                    'stock_batch_id'   => $entry['stock_batch_id'],
                    'unit_price'       => $unitPrice,
                    'discount_amount'  => $this->r2($discPerUnit * $entryQty),
                    'taxable_value'    => $this->r2($taxable * $entryQty),
                    'tax_pct'          => $rate,
                    'tax_amount'       => $this->r2($tax * $entryQty),
                    'line_total'       => $this->r2($total * $entryQty),
                    'is_margin_scheme' => $margin && $isGstBilled,
                    'landed_cost'      => $landed,
                    'device_condition' => $entry['device_condition'] ?? null,
                ];

                $subtotal  += $taxable * $entryQty;
                $taxTotal  += $tax * $entryQty;
                $cogsTotal += $landed * $entryQty;
            }
        }

        $subtotal       = $this->r2($subtotal);
        $taxTotal       = $this->r2($taxTotal);
        $discountAmount = $this->r2($data['discount_amount'] ?? 0);
        $shippingCharge = $this->r2($data['shipping_charge'] ?? 0);
        $roundOff       = $this->r2($data['round_off'] ?? 0);
        $grandTotal     = $this->r2($subtotal + $taxTotal - $discountAmount + $shippingCharge + $roundOff);

        return [
            'rows'            => $rows,
            'subtotal'        => $subtotal,
            'tax_amount'      => $taxTotal,
            'discount_amount' => $discountAmount,
            'shipping_charge' => $shippingCharge,
            'round_off'       => $roundOff,
            'grand_total'     => $grandTotal,
            'cogs_total'      => $this->r2($cogsTotal),
        ];
    }

    /**
     * S1–S5 GST sales document classification.
     *
     * B2B is decided by the buyer's GSTIN (suppliers carry one; customers do
     * not have a GSTIN column, so a customer party is always B2C retail).
     * $hasMargin is true when ANY invoice line is a margin-scheme line.
     *
     * Mirrors deriveDocument() in sale-context.tsx — keep the two in sync.
     *
     * @return array{code: string, label: string, buyer_kind: 'B2C'|'B2B', itc_eligible: bool, hsn_summary: bool, hide_tax: bool}
     */
    public static function documentType(bool $isGstBilled, ?string $partyGstin, bool $hasMargin): array
    {
        if (! $isGstBilled) {
            // S1 — no GST charged (store not registered, or GST bill toggled
            // off): Bill of Supply, 0% tax, no HSN summary, no ITC.
            return [
                'code' => 'BILL_OF_SUPPLY', 'label' => 'Bill of Supply',
                'buyer_kind' => 'B2C', 'itc_eligible' => false,
                'hsn_summary' => false, 'hide_tax' => false,
            ];
        }

        $isB2B = $partyGstin !== null && $partyGstin !== '';

        if ($isB2B && $hasMargin) {
            // S5 — B2B margin scheme: tax on profit margin only, no ITC.
            return [
                'code' => 'B2B_MARGIN_INVOICE', 'label' => 'B2B Margin Tax Invoice',
                'buyer_kind' => 'B2B', 'itc_eligible' => false,
                'hsn_summary' => true, 'hide_tax' => true,
            ];
        }

        if ($isB2B) {
            // S4 — standard B2B: full-rate tax, HSN mandatory, 100% ITC.
            return [
                'code' => 'B2B_TAX_INVOICE', 'label' => 'B2B Tax Invoice',
                'buyer_kind' => 'B2B', 'itc_eligible' => true,
                'hsn_summary' => true, 'hide_tax' => false,
            ];
        }

        if ($hasMargin) {
            // S3 — B2C margin scheme (Rule 32(5)): tax on positive margin only.
            // The printed receipt must NOT show the tax amount explicitly.
            return [
                'code' => 'B2C_MARGIN_INVOICE', 'label' => 'B2C Retail Invoice (Margin Scheme)',
                'buyer_kind' => 'B2C', 'itc_eligible' => false,
                'hsn_summary' => true, 'hide_tax' => true,
            ];
        }

        // S2 — standard B2C retail: full-rate inclusive tax on selling price.
        return [
            'code' => 'B2C_TAX_INVOICE', 'label' => 'B2C Tax Invoice',
            'buyer_kind' => 'B2C', 'itc_eligible' => false,
            'hsn_summary' => true, 'hide_tax' => false,
        ];
    }

    /**
     * @return array{0: float, 1: float, 2: float} [taxable, tax, total] per unit
     */
    private function evaluateUnit(float $net, float $rate, string $taxType, float $landed, bool $margin, bool $isGstBilled): array
    {
        if (! $isGstBilled || $rate <= 0) {
            return [$net, 0.0, $net];
        }

        if ($margin) {
            // Margin scheme (Rule 32(5)): GST only on (selling - purchase price),
            // embedded in the price the buyer pays. Margin <= 0 → no tax.
            $marginValue = max(0.0, $net - $landed);
            $tax         = $this->r2($marginValue * $rate / (100 + $rate));

            return [$this->r2($net - $tax), $tax, $net];
        }

        // GST is always inclusive: the price the buyer pays already contains it.
        // ($taxType is accepted for history but no longer changes the math.)
        $tax = $this->r2($net * $rate / (100 + $rate));

        return [$this->r2($net - $tax), $tax, $net];
    }

    private function r2(float|int|string|null $n): float
    {
        return round((float) $n + 1e-10, 2);
    }
}

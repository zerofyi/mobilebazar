<?php

declare(strict_types=1);

namespace App\Services\Summary;

use App\DTOs\SummaryDelta;

/**
 * Translates business payloads into SummaryDeltas.
 * Add forSale(), forRefund(), forExpense(), forLoan(), forEmi() here as those modules land,
 * so every module reports numbers with the same definitions.
 */
final class SummaryDeltaFactory
{
    /**
     * Definitions:
     *  - total_purchases            = grand_total (tax + freight - discount included)
     *  - new/used/serialized/non_serialized = split of LINE totals (before header-level freight/discount),
     *    so new + used may differ slightly from total_purchases. Bulk lines count as "new".
     *  - serialized lines are split new/used per unit by device_condition_code (NEW vs anything else).
     *  - purchase_items_count       = physical quantity (units + bulk qty)
     *
     * Use ->reversed() for a cancelled purchase.
     */
    public static function forPurchase(int $storeId, array $data): SummaryDelta
    {
        $new = $used = $serialized = $bulk = 0.0;
        $items = 0;

        foreach ($data['lines'] ?? [] as $line) {
            $lineTotal = (float) ($line['line_total'] ?? 0);

            if (! empty($line['is_serialized'])) {
                $units = $line['units'] ?? [];
                $n     = count($units);
                $items += $n;
                $serialized += $lineTotal;

                if ($n === 0) {
                    $new += $lineTotal;
                    continue;
                }

                $perUnit = $lineTotal / $n;
                foreach ($units as $u) {
                    $cond = strtoupper(trim((string) ($u['device_condition_code'] ?? 'NEW')));
                    $cond === 'NEW' ? $new += $perUnit : $used += $perUnit;
                }
            } else {
                $items += (int) ($line['ordered_qty'] ?? 1);
                $bulk  += $lineTotal;
                $new   += $lineTotal;
            }
        }

        return new SummaryDelta($storeId, $data['order_date'], [
            'total_purchases'                => $data['grand_total'] ?? 0,
            'new_purchases'                  => $new,
            'used_purchases'                 => $used,
            'total_purchases_serialized'     => $serialized,
            'total_purchases_non_serialized' => $bulk,
            'purchase_count'                 => 1,
            'purchase_items_count'           => $items,
        ]);
    }

    /**
     * Definitions (mirror forPurchase):
     *  - total_sales                        = grand_total (tax - discount included)
     *  - new/used/serialized/non_serialized = split of evaluated LINE totals.
     *    Serialized rows split new/used per unit by device_condition (NEW vs
     *    anything else); bulk lines count as "new".
     *  - total_tax_collected                = tax_amount
     *  - total_discounts                    = discount_amount (bill-level)
     *  - cash/upi/card/bank_collected       = paid_amount routed by payment_mode
     *  - gross_profit                       = total_sales - COGS (true landed cost)
     *  - invoice_count / invoice_items_count
     *
     * @param array{rows: list<array{line_total: float, qty: int, device_condition: ?string, stock_unit_id: ?int}>, subtotal: float, tax_amount: float, discount_amount: float, round_off: float, grand_total: float, cogs_total: float} $evaluated
     */
    public static function forSale(int $storeId, array $data, array $evaluated): SummaryDelta
    {
        $new = $used = $serialized = $bulk = 0.0;
        $items = 0;

        $paymentMode = strtolower((string) ($data['payment_mode'] ?? 'cash'));
        $paid        = (float) ($data['paid_amount'] ?? 0);

        $paidBuckets = [
            'cash_collected' => 0.0,
            'upi_collected'  => 0.0,
            'card_collected' => 0.0,
            'bank_collected' => 0.0,
        ];

        $bucketKey = match ($paymentMode) {
            'cash'                         => 'cash_collected',
            'upi'                          => 'upi_collected',
            'card', 'credit_card', 'debit_card' => 'card_collected',
            default                        => 'bank_collected',
        };
        $paidBuckets[$bucketKey] = $paid;

        foreach ($evaluated['rows'] ?? [] as $row) {
            $rowTotal = (float) ($row['line_total'] ?? 0);
            $items   += (int) ($row['qty'] ?? 1);

            if (! empty($row['stock_unit_id'])) {
                $serialized += $rowTotal;
                $cond = strtoupper(trim((string) ($row['device_condition'] ?? 'NEW')));
                $cond === 'NEW' ? $new += $rowTotal : $used += $rowTotal;
            } else {
                $bulk += $rowTotal;
                $new  += $rowTotal;
            }
        }

        return new SummaryDelta($storeId, $data['invoice_date'], array_merge([
            'total_sales'                => $evaluated['grand_total'] ?? 0,
            'new_sales'                  => $new,
            'used_sales'                 => $used,
            'total_sales_serialized'     => $serialized,
            'total_sales_non_serialized' => $bulk,
            'total_tax_collected'        => $evaluated['tax_amount'] ?? 0,
            'total_discounts'            => $evaluated['discount_amount'] ?? 0,
            'gross_profit'               => ($evaluated['grand_total'] ?? 0) - ($evaluated['cogs_total'] ?? 0),
            'invoice_count'              => 1,
            'invoice_items_count'        => $items,
        ], $paidBuckets));
    }

    /**
     * Definitions:
     *  - total_loan_given = amount financed into the loan book
     *    (net_principal + processing_fee when spread). Cash collected as down
     *    payment / upfront fee is NOT part of this — it lands in the
     *    cash/upi/card/bank_collected buckets below.
     *  - cash/upi/card/bank_collected = down_payment + upfront processing_fee
     *    routed by down_payment_mode.
     *  - loans_count = 1
     */
    public static function forLoanDisbursal(
        int $storeId,
        string $disbursedDate,
        float $loanGiven,
        float $cashCollected,
        string $paymentMode,
    ): SummaryDelta {
        return new SummaryDelta($storeId, $disbursedDate, array_merge([
            'total_loan_given' => $loanGiven,
            'loans_count'      => 1,
        ], self::collectionBuckets($paymentMode, $cashCollected)));
    }

    /**
     * Definitions:
     *  - total_emi_collected = full repayment amount (principal + interest).
     *  - cash/upi/card/bank_collected = same amount, routed by payment_mode,
     *    so the daily cash position stays correct.
     *
     * NOTE: no interest_earned bucket — interest belongs to the financer,
     * not the business, so it never lands in business summaries.
     */
    public static function forLoanRepayment(
        int $storeId,
        string $paidDate,
        string $paymentMode,
        float $amount,
    ): SummaryDelta {
        return new SummaryDelta($storeId, $paidDate, array_merge([
            'total_emi_collected' => $amount,
        ], self::collectionBuckets($paymentMode, $amount)));
    }

    /**
     * Down payment at disbursal: cash in, but NOT an EMI — it lands only in
     * the cash/upi/card/bank_collected buckets, never total_emi_collected.
     */
    public static function forLoanDownPayment(
        int $storeId,
        string $disbursedDate,
        string $paymentMode,
        float $amount,
    ): SummaryDelta {
        return new SummaryDelta($storeId, $disbursedDate, self::collectionBuckets($paymentMode, $amount));
    }

    /** @return array<string, float> */
    private static function collectionBuckets(string $paymentMode, float $amount): array
    {
        $buckets = [
            'cash_collected' => 0.0,
            'upi_collected'  => 0.0,
            'card_collected' => 0.0,
            'bank_collected' => 0.0,
        ];

        $bucketKey = match (strtolower($paymentMode)) {
            'cash'                         => 'cash_collected',
            'upi'                          => 'upi_collected',
            'card', 'credit_card', 'debit_card' => 'card_collected',
            default                        => 'bank_collected',
        };

        $buckets[$bucketKey] = $amount;

        return $buckets;
    }
}

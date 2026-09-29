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
}

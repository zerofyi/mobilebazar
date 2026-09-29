<?php

declare(strict_types=1);

namespace App\DTOs;

use Carbon\Carbon;
use InvalidArgumentException;

/**
 * An immutable "what changed" description for one store on one date.
 * Positive values add, negative values reverse (cancel / edit / refund).
 *
 * Column names are validated against whitelists — this is what makes the raw
 * SQL in SummaryService injection-proof.
 */
final readonly class SummaryDelta
{
    public const DAILY_DECIMALS = [
        'new_purchases', 'used_purchases', 'total_purchases',
        'total_purchases_serialized', 'total_purchases_non_serialized',
        'new_sales', 'used_sales', 'total_sales',
        'total_sales_serialized', 'total_sales_non_serialized',
        'total_refunds', 'total_tax_collected', 'total_expenses', 'total_discounts',
        'cash_collected', 'upi_collected', 'card_collected', 'bank_collected',
        'total_loan_given', 'total_emi_collected', 'gross_profit', 'net_profit',
    ];

    public const DAILY_COUNTS = [
        'purchase_count', 'purchase_items_count',
        'invoice_count', 'invoice_items_count',
        'return_count', 'return_items_count',
        'loans_count',
    ];

    public const MONTHLY_DECIMALS = [
        'total_sales', 'new_sales', 'used_sales',
        'total_purchases', 'new_purchases', 'used_purchases',
        'total_refunds', 'total_discounts', 'total_tax_collected',
        'total_expenses', 'total_loan_given', 'total_emi_collected',
        'gross_profit', 'net_profit',
    ];

    public const MONTHLY_COUNTS = [
        'purchase_count', 'invoice_count', 'return_count', 'loans_count',
    ];

    /** Normalised Y-m-d */
    public string $date;

    /** @var array<string, string|int> non-zero values only; decimals as "12.50" strings */
    public array $values;

    /**
     * @param array<string, int|float|string> $values column => amount
     */
    public function __construct(
        public int $storeId,
        string|\DateTimeInterface $date,
        array $values,
    ) {
        $this->date = Carbon::parse($date)->toDateString();

        $decimals = array_flip(self::DAILY_DECIMALS);
        $counts   = array_flip(self::DAILY_COUNTS);
        $clean    = [];

        foreach ($values as $column => $amount) {
            if (isset($decimals[$column])) {
                $v = round((float) $amount, 2);
                if ($v != 0.0) {
                    $clean[$column] = number_format($v, 2, '.', '');
                }
            } elseif (isset($counts[$column])) {
                $v = (int) $amount;
                if ($v !== 0) {
                    $clean[$column] = $v;
                }
            } else {
                throw new InvalidArgumentException("Unknown summary column [{$column}].");
            }
        }

        $this->values = $clean;
    }

    public function isEmpty(): bool
    {
        return $this->values === [];
    }

    public function yearMonth(): string
    {
        return substr($this->date, 0, 7);
    }

    /** Negated copy — use for cancellations, edits (reverse old + apply new), refunds. */
    public function reversed(): self
    {
        $neg = [];
        foreach ($this->values as $k => $v) {
            $neg[$k] = is_int($v) ? -$v : -1 * (float) $v;
        }

        return new self($this->storeId, $this->date, $neg);
    }

    /** @return array<string, string|int> */
    public function dailyValues(): array
    {
        return $this->values;
    }

    /** @return array<string, string|int> subset that exists on monthly_summaries */
    public function monthlyValues(): array
    {
        $allowed = array_flip([...self::MONTHLY_DECIMALS, ...self::MONTHLY_COUNTS]);

        return array_intersect_key($this->values, $allowed);
    }
}

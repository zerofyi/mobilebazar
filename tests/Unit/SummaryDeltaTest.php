<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\DTOs\SummaryDelta;
use InvalidArgumentException;
use PHPUnit\Framework\TestCase;

final class SummaryDeltaTest extends TestCase
{
    public function test_zero_values_are_dropped_and_decimals_formatted(): void
    {
        $d = new SummaryDelta(1, '2026-09-28', [
            'total_purchases' => 1234.5,
            'new_purchases'   => 0,
            'purchase_count'  => 1,
            'return_count'    => 0,
        ]);

        $this->assertSame(['total_purchases' => '1234.50', 'purchase_count' => 1], $d->values);
        $this->assertSame('2026-09', $d->yearMonth());
    }

    public function test_unknown_column_is_rejected(): void
    {
        $this->expectException(InvalidArgumentException::class);
        new SummaryDelta(1, '2026-09-28', ['drop_table; --' => 1]);
    }

    public function test_reversed_negates_everything(): void
    {
        $r = (new SummaryDelta(1, '2026-09-28', ['total_purchases' => 100, 'purchase_count' => 1]))->reversed();

        $this->assertSame(['total_purchases' => '-100.00', 'purchase_count' => -1], $r->values);
    }

    public function test_monthly_values_exclude_daily_only_columns(): void
    {
        $d = new SummaryDelta(1, '2026-09-28', [
            'total_purchases'            => 10,
            'total_purchases_serialized' => 10,
            'purchase_items_count'       => 3,
            'purchase_count'             => 1,
        ]);

        $this->assertSame(['total_purchases' => '10.00', 'purchase_count' => 1], $d->monthlyValues());
    }
}

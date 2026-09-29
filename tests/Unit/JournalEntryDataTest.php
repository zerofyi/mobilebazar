<?php

declare(strict_types=1);

namespace Tests\Unit;

use App\DTOs\JournalEntryData;
use App\Exceptions\AccountingException;
use PHPUnit\Framework\TestCase;

final class JournalEntryDataTest extends TestCase
{
    private function make(array $lines): JournalEntryData
    {
        return new JournalEntryData(1, 'JE-T1', '2026-09-28', 'X', 1, 'test', 1, $lines);
    }

    public function test_balanced_entry_is_accepted_and_totals_in_paise(): void
    {
        $e = $this->make([
            ['account' => '1040', 'debit' => 100.10],
            ['account' => '2010', 'credit' => '100.10'],
        ]);

        $this->assertSame(10010, $e->totalPaise);
        $this->assertSame(['1040', '2010'], $e->accountCodes());
    }

    public function test_float_drift_does_not_unbalance(): void
    {
        $e = $this->make([
            ['account' => '1040', 'debit' => 0.1],
            ['account' => '1040', 'debit' => 0.2],
            ['account' => '2010', 'credit' => 0.3],
        ]);

        $this->assertSame(30, $e->totalPaise);
    }

    public function test_unbalanced_entry_is_rejected(): void
    {
        $this->expectException(AccountingException::class);
        $this->make([
            ['account' => '1040', 'debit' => 100],
            ['account' => '2010', 'credit' => 99.99],
        ]);
    }

    public function test_line_with_both_sides_is_rejected(): void
    {
        $this->expectException(AccountingException::class);
        $this->make([
            ['account' => '1040', 'debit' => 10, 'credit' => 10],
            ['account' => '2010', 'credit' => 10],
        ]);
    }

    public function test_single_line_is_rejected(): void
    {
        $this->expectException(AccountingException::class);
        $this->make([['account' => '1040', 'debit' => 10]]);
    }
}

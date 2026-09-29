<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class AccountingException extends RuntimeException
{
    /** @param list<string> $codes */
    public static function accountNotFound(array $codes, int $storeId): self
    {
        return new self(
            'Missing/inactive accounts [' . implode(', ', $codes) . "] for store {$storeId}. Run AccountSeeder."
        );
    }

    public static function unbalanced(string $entry, int $debitPaise, int $creditPaise): self
    {
        return new self(sprintf(
            'Journal %s is unbalanced: debit %.2f vs credit %.2f.',
            $entry, $debitPaise / 100, $creditPaise / 100
        ));
    }

    public static function invalidLine(string $entry, int|string $index): self
    {
        return new self("Journal {$entry}, line {$index}: each line needs exactly one positive side (debit XOR credit).");
    }

    public static function tooFewLines(string $entry): self
    {
        return new self("Journal {$entry} needs at least two lines.");
    }

    public static function duplicateEntry(string $entry): self
    {
        return new self("Journal entry number {$entry} already exists for a different reference.");
    }

    public static function purchaseTotalsMismatch(string $po, int $diffPaise): self
    {
        return new self(sprintf(
            'Purchase %s totals do not reconcile: subtotal - discount + tax + freight differs from grand_total by %.2f.',
            $po, $diffPaise / 100
        ));
    }

    public static function saleTotalsMismatch(string $inv, int $diffPaise): self
    {
        return new self(sprintf(
            'Sale %s totals do not reconcile: client preview differs from server evaluation by %.2f.',
            $inv, $diffPaise / 100
        ));
    }

    public static function overpaid(string $po): self
    {
        return new self("Purchase {$po}: paid_amount exceeds grand_total.");
    }
}

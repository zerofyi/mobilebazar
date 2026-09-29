<?php

declare(strict_types=1);

namespace App\DTOs;

use App\Exceptions\AccountingException;
use Carbon\Carbon;

/**
 * Validated, immutable journal entry description. All arithmetic is done in integer
 * paise so balance checks are exact (no float drift).
 *
 * Each input line: ['account' => '1040', 'debit' => 100.5, 'memo' => '...']
 *               or ['account' => '2010', 'credit' => 100.5]
 */
final readonly class JournalEntryData
{
    public string $entryDate;

    /** @var list<array{account: string, debit: int, credit: int, memo: ?string}> */
    public array $lines;

    public int $totalPaise;

    /**
     * @param list<array{account: string, debit?: int|float|string, credit?: int|float|string, memo?: ?string}> $lines
     */
    public function __construct(
        public int $storeId,
        public string $entryNumber,
        string|\DateTimeInterface $entryDate,
        public string $referenceType,
        public int $referenceId,
        public string $narration,
        public int $createdBy,
        array $lines,
    ) {
        $this->entryDate = Carbon::parse($entryDate)->toDateString();

        if (count($lines) < 2) {
            throw AccountingException::tooFewLines($entryNumber);
        }

        $normalised = [];
        $debit = $credit = 0;

        foreach ($lines as $i => $line) {
            $d = self::toPaise($line['debit'] ?? 0);
            $c = self::toPaise($line['credit'] ?? 0);

            if ($d < 0 || $c < 0 || ($d > 0) === ($c > 0)) {
                throw AccountingException::invalidLine($entryNumber, $i);
            }

            $normalised[] = [
                'account' => (string) $line['account'],
                'debit'   => $d,
                'credit'  => $c,
                'memo'    => isset($line['memo']) ? mb_substr((string) $line['memo'], 0, 255) : null,
            ];
            $debit  += $d;
            $credit += $c;
        }

        if ($debit !== $credit) {
            throw AccountingException::unbalanced($entryNumber, $debit, $credit);
        }

        $this->lines      = $normalised;
        $this->totalPaise = $debit;
    }

    /** @return list<string> distinct account codes used */
    public function accountCodes(): array
    {
        return array_values(array_unique(array_column($this->lines, 'account')));
    }

    public static function toPaise(int|float|string $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }

    public static function fromPaise(int $paise): string
    {
        return number_format($paise / 100, 2, '.', '');
    }
}

<?php

declare(strict_types=1);

namespace App\Exceptions;

use RuntimeException;

final class MonthLockedException extends RuntimeException
{
    public static function for(int $storeId, string $yearMonth): self
    {
        return new self("Month {$yearMonth} is locked for store {$storeId}; no further postings allowed.");
    }
}

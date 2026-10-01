<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Setting;

/**
 * Typed reader for per-store loan settings (group 'loans').
 *
 * Setting values are stored as JSON scalars; this class normalizes them back
 * to plain strings/floats. Anything missing falls back to the seeder defaults.
 */
final class LoanSettings
{
    /** @var array<string, string> */
    private const DEFAULTS = [
        'loan_interest_rate'   => '4',
        'loan_collection_slab' => '1,10,20',
        'loan_processing_fee'  => '0',
        'loan_prefix'          => 'LN',
    ];

    public static function get(int $storeId, string $key): string
    {
        $row = Setting::query()
            ->where('store_id', $storeId)
            ->where('key', $key)
            ->first(['value']);

        if ($row === null) {
            return self::DEFAULTS[$key] ?? '';
        }

        $value = $row->value; // 'array' cast

        if (is_array($value)) {
            $value = $value['value'] ?? reset($value);
        }

        $scalar = is_scalar($value) ? (string) $value : '';

        return $scalar !== '' ? $scalar : (self::DEFAULTS[$key] ?? '');
    }

    public static function interestRate(int $storeId): float
    {
        return max(0.0, (float) self::get($storeId, 'loan_interest_rate'));
    }

    public static function collectionSlab(int $storeId): string
    {
        return self::get($storeId, 'loan_collection_slab');
    }

    public static function processingFee(int $storeId): float
    {
        return max(0.0, (float) self::get($storeId, 'loan_processing_fee'));
    }

    public static function prefix(int $storeId): string
    {
        return self::get($storeId, 'loan_prefix');
    }
}

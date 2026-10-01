<?php

declare(strict_types=1);

namespace App\Services;

use Carbon\Carbon;
use InvalidArgumentException;

/**
 * Loan EMI schedule engine — port of ssmobileshop's EmiSlabService.
 *
 * Interest is FLAT monthly (decision D1, ssm-exact):
 *   net_principal         = principal_amount − down_payment
 *   monthly_interest      = round(net_principal × rate/100, 2)
 *   total_interest        = round(monthly_interest × tenure, 2)
 *   total_payable         = round(net_principal + total_interest
 *                               + (spread ? processing_fee : 0), 2)
 *   base_emi              = floor(total_payable / tenure × 100) / 100
 *   remainder             = total_payable − base_emi × tenure → last EMI
 *
 * The schedule rows additionally split each installment into
 * principal_amount / interest_amount for loan_schedules (ssm kept a single
 * amount; mobilebazar's table has the split). The interest split is flat too:
 * total_interest spread evenly, last installment absorbing rounding.
 *
 * Collection slabs drive due dates:
 *   - fixed month-days, e.g. "1,10,20": the disbursement day is bucketed
 *     against midpoints between slab days (ssm rule: 1–5→1st next month,
 *     6–15→10th, 16–25→20th, 26–31→1st month-after-next), clamped to month
 *     length; subsequent EMIs repeat the same day monthly (clamped).
 *   - rolling, e.g. "every_30_days": first due = disbursed + N days,
 *     subsequent EMIs +N days each.
 *
 * All date arithmetic is anchored to Asia/Kolkata (IST).
 *
 * calculate() is PURE (no DB, no settings) — unit-testable. Use
 * forStore()/previewForStore() when store settings should fill defaults.
 */
final class LoanScheduleService
{
    private const ROLLING_PATTERN = '/^every_(\d+)_days$/';

    private const TIMEZONE = 'Asia/Kolkata';

    /*
    |----------------------------------------------------------------------
    | Slab parsing
    |----------------------------------------------------------------------
    */

    /**
     * @return array<int>|string sorted day list, or the rolling string as-is
     */
    public static function parseSlab(?string $slab): array|string
    {
        $raw = trim((string) $slab);

        if ($raw === '') {
            $raw = '1,10,20';
        }

        if (self::isRolling($raw)) {
            return $raw;
        }

        $days = array_filter(
            array_map('intval', explode(',', $raw)),
            fn ($d) => $d >= 1 && $d <= 31
        );

        sort($days);

        return array_values($days) ?: [1];
    }

    public static function isRolling(array|string $parsed): bool
    {
        return is_string($parsed) && (bool) preg_match(self::ROLLING_PATTERN, $parsed);
    }

    private static function rollingIntervalDays(string $parsed): int
    {
        if (preg_match(self::ROLLING_PATTERN, $parsed, $m)) {
            return max(1, (int) $m[1]);
        }

        return 30;
    }

    /** Allowed billing days for the EMI date picker ([] = any date, rolling). */
    public static function allowedDays(?string $slab): array
    {
        $parsed = self::parseSlab($slab);

        return self::isRolling($parsed) ? [] : $parsed;
    }

    /*
    |----------------------------------------------------------------------
    | Dates (IST)
    |----------------------------------------------------------------------
    */

    private static function toIst(Carbon|string $date): Carbon
    {
        $carbon = $date instanceof Carbon
            ? $date->copy()
            : Carbon::parse($date, self::TIMEZONE);

        return $carbon->setTimezone(self::TIMEZONE)->startOfDay();
    }

    private static function clampDayToMonth(Carbon $monthDate, int $targetDay): int
    {
        return min($targetDay, $monthDate->daysInMonth);
    }

    /**
     * Recommended first EMI date for a disbursement date + slab.
     * ssm rule, generalized: bucket the loan day against midpoints between
     * consecutive slab days; the wrap-around bucket pushes an extra month.
     */
    public static function recommendedFirstEmiDate(Carbon|string $disbursedAt, ?string $slab = null): Carbon
    {
        $date   = self::toIst($disbursedAt);
        $parsed = self::parseSlab($slab);

        if (self::isRolling($parsed)) {
            return $date->copy()->addDays(self::rollingIntervalDays($parsed));
        }

        [$targetDay, $monthOffset] = self::resolveSlabBin($parsed, (int) $date->day);

        $monthBase  = $date->copy()->addMonthsNoOverflow($monthOffset)->startOfMonth();
        $clampedDay = self::clampDayToMonth($monthBase, $targetDay);

        return $monthBase->copy()->setDay($clampedDay);
    }

    /** @return array{0:int,1:int} [targetDay, monthOffset] */
    private static function resolveSlabBin(array $days, int $loanDay): array
    {
        $count = count($days);

        for ($i = 0; $i < $count - 1; $i++) {
            $cutoff = intdiv($days[$i] + $days[$i + 1], 2);
            if ($loanDay <= $cutoff) {
                return [$days[$i], 1];
            }
        }

        $cycleLength = 30;
        $wrapCutoff  = intdiv($days[$count - 1] + $days[0] + $cycleLength, 2);

        if ($loanDay <= $wrapCutoff) {
            return [$days[$count - 1], 1];
        }

        return [$days[0], 2];
    }

    /** Primary (green-highlight) billing day for a disbursement date. */
    public static function primaryDay(Carbon|string $disbursedAt, ?string $slab = null): int
    {
        return self::recommendedFirstEmiDate($disbursedAt, $slab)->day;
    }

    /*
    |----------------------------------------------------------------------
    | Schedule math (pure)
    |----------------------------------------------------------------------
    */

    /**
     * @return array{
     *   principal: float, down_payment: float, net_principal: float,
     *   monthly_rate: float, monthly_interest_amount: float,
     *   total_interest: float, processing_fee: float, file_charge_mode: string,
     *   total_payable: float, base_emi: float, is_rolling: bool,
     *   allowed_days: array<int>, primary_day: int,
     *   recommended_first_date: string, first_emi_date: string,
     *   schedule: list<array{installment_no:int, due_date:string,
     *     total_due:float, principal_amount:float, interest_amount:float}>
     * }
     */
    public static function calculate(
        float $principal,
        float $downPayment,
        float $monthlyRate,
        int $tenureMonths,
        float $processingFee,
        Carbon|string $disbursedAt,
        Carbon|string|null $firstEmiDate = null,
        ?string $slab = null,
        string $fileChargeMode = 'upfront',
    ): array {
        if ($tenureMonths < 1) {
            throw new InvalidArgumentException('Tenure must be at least 1 month.');
        }
        if ($downPayment < 0 || $downPayment > $principal) {
            throw new InvalidArgumentException('Down payment must be between 0 and principal.');
        }
        if (! in_array($fileChargeMode, ['upfront', 'spread'], true)) {
            throw new InvalidArgumentException('file_charge_mode must be upfront|spread.');
        }

        $parsed    = self::parseSlab($slab);
        $isRolling = self::isRolling($parsed);
        $interval  = $isRolling ? self::rollingIntervalDays($parsed) : null;

        // ── Financials (ssm-exact, flat) ──────────────────────────────────
        $netPrincipal          = round($principal - $downPayment, 2);
        $monthlyInterestAmount = round($netPrincipal * ($monthlyRate / 100), 2);
        $totalInterest         = round($monthlyInterestAmount * $tenureMonths, 2);

        $totalPayable = $fileChargeMode === 'spread'
            ? round($netPrincipal + $totalInterest + $processingFee, 2)
            : round($netPrincipal + $totalInterest, 2);

        $baseEmi   = floor(($totalPayable / $tenureMonths) * 100) / 100;
        $remainder = round($totalPayable - ($baseEmi * $tenureMonths), 2);

        // Flat interest split per installment (last absorbs rounding).
        $interestBase      = floor(($totalInterest / $tenureMonths) * 100) / 100;
        $interestRemainder = round($totalInterest - ($interestBase * $tenureMonths), 2);

        // ── First due date ────────────────────────────────────────────────
        $disbursed   = self::toIst($disbursedAt);
        $recommended = self::recommendedFirstEmiDate($disbursed, $slab);
        $firstEmi    = $firstEmiDate ? self::toIst($firstEmiDate) : $recommended;

        // ── Installments ────────────────────────────────────────────────
        $schedule = [];
        for ($i = 0; $i < $tenureMonths; $i++) {
            if ($isRolling) {
                $dueDate = $firstEmi->copy()->addDays($i * $interval);
            } else {
                $targetMonth = $firstEmi->copy()->addMonthsNoOverflow($i)->startOfMonth();
                $clampedDay  = self::clampDayToMonth($targetMonth, $firstEmi->day);
                $dueDate     = $targetMonth->copy()->setDay($clampedDay);
            }

            $isLast   = $i === $tenureMonths - 1;
            $totalDue = $isLast ? round($baseEmi + $remainder, 2) : $baseEmi;
            $interest = $isLast ? round($interestBase + $interestRemainder, 2) : $interestBase;

            $schedule[] = [
                'installment_no'   => $i + 1,
                'due_date'         => $dueDate->toDateString(),
                'total_due'        => $totalDue,
                'principal_amount' => round($totalDue - $interest, 2),
                'interest_amount'  => $interest,
            ];
        }

        return [
            'principal'               => round($principal, 2),
            'down_payment'            => round($downPayment, 2),
            'net_principal'           => $netPrincipal,
            'monthly_rate'            => $monthlyRate,
            'monthly_interest_amount' => $monthlyInterestAmount,
            'total_interest'          => $totalInterest,
            'processing_fee'          => round($processingFee, 2),
            'file_charge_mode'        => $fileChargeMode,
            'total_payable'           => $totalPayable,
            'base_emi'                => $baseEmi,
            'is_rolling'              => $isRolling,
            'allowed_days'            => $isRolling ? [] : $parsed,
            'primary_day'             => $firstEmi->day,
            'recommended_first_date'  => $recommended->toDateString(),
            'first_emi_date'          => $firstEmi->toDateString(),
            'schedule'                => $schedule,
        ];
    }

    /**
     * Store-aware wrapper: fills rate/slab/fee defaults from loan settings.
     * Single source of truth for the preview endpoint AND the store path.
     *
     * @param array{principal:float, down_payment?:float, interest_rate?:float|null,
     *   tenure_months:int, processing_fee?:float|null, file_charge_mode?:string,
     *   disbursed_date:string, first_emi_date?:string|null, collection_slab?:string|null} $input
     */
    public static function forStore(int $storeId, array $input): array
    {
        return self::calculate(
            principal:      (float) $input['principal'],
            downPayment:    (float) ($input['down_payment'] ?? 0),
            monthlyRate:    isset($input['interest_rate']) && $input['interest_rate'] !== null
                ? (float) $input['interest_rate']
                : LoanSettings::interestRate($storeId),
            tenureMonths:   (int) $input['tenure_months'],
            processingFee:  isset($input['processing_fee']) && $input['processing_fee'] !== null
                ? (float) $input['processing_fee']
                : LoanSettings::processingFee($storeId),
            disbursedAt:    $input['disbursed_date'],
            firstEmiDate:   $input['first_emi_date'] ?? null,
            slab:           $input['collection_slab'] ?? LoanSettings::collectionSlab($storeId),
            fileChargeMode: $input['file_charge_mode'] ?? 'upfront',
        );
    }
}

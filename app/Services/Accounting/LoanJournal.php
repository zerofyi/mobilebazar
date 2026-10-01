<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\DTOs\JournalEntryData;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;

/**
 * Builds the double-entry for loan disbursal and EMI collections.
 *
 * Account map (deviation note: the repo's chart already carries loan
 * accounts, so we use them instead of inventing new codes):
 *   1060 Loans Issued (Principal) — asset, the loan book
 *   1030 Accounts Receivable       — asset, relieved at disbursal
 *   1010/1020/1025/1026            — cash/bank/upi/card (same map as SaleJournal)
 *   4030 Loan Interest Income      — income, interest + penalties
 *   4035 Processing Fee Income     — income, seeded by AccountSeeder
 *
 * Disbursal entry (JE-LN-<loan_number>), all paise-exact. NOTE: the down
 * payment is NOT cash-debited here — it is captured as its own repayment
 * row (LR receipt) with a Dr cash / Cr 1060 entry, so debiting it here too
 * would double-count the cash. The 1060 debit is therefore the FULL
 * principal (+ fee when spread); the down-payment repayment then brings
 * the book down to net principal:
 *   Dr 1060 = principal_amount (+ processing_fee when file_charge_mode=spread)
 *   Dr <cash by down_payment_mode> = processing_fee          [if > 0 and upfront]
 *   Cr 1030 = principal_amount
 *   Cr 4035 = processing_fee                                [if > 0]
 *
 * Repayment entry (JE-LR-<receipt_number>):
 *   Dr <cash by payment_mode> = amount
 *   Cr 1060 = principal_component                           [if > 0]
 *   Cr 4030 = interest_component + penalty_collected         [if > 0]
 *
 * Both post() calls are idempotent on (store_id, entry_number) via
 * AccountingService — safe replays never duplicate ledger rows.
 */
final class LoanJournal
{
    private const LOAN_BOOK_ACCOUNT      = '1060';
    private const RECEIVABLE_ACCOUNT     = '1030';
    private const INTEREST_INCOME_ACCOUNT = '4030';
    private const FEE_INCOME_ACCOUNT     = '4035';

    private const PAYMENT_ACCOUNTS = [
        'cash'        => '1010',
        'bank'        => '1020',
        'neft'        => '1020',
        'rtgs'        => '1020',
        'imps'        => '1020',
        'cheque'      => '1020',
        'upi'         => '1025',
        'card'        => '1026',
        'credit_card' => '1026',
        'debit_card'  => '1026',
    ];

    public function __construct(private readonly AccountingService $accounting) {}

    /**
     * @param array{principal_amount:float, down_payment_mode:string,
     *   processing_fee:float, file_charge_mode:string} $computed
     */
    public function postDisbursal(Loan $loan, Store $store, User $user, array $computed): void
    {
        $financed = JournalEntryData::toPaise($computed['principal_amount']);
        $fee      = JournalEntryData::toPaise($computed['processing_fee']);

        $spread = $computed['file_charge_mode'] === 'spread';
        $payCode = self::PAYMENT_ACCOUNTS[strtolower($computed['down_payment_mode'])] ?? '1020';

        $lines = [];

        // Loan book: full principal (+ fee when spread/financed). The
        // down-payment repayment entry (Dr cash / Cr 1060) brings it down
        // to net principal right after.
        $lines[] = [
            'account' => self::LOAN_BOOK_ACCOUNT,
            'debit'   => $this->money($financed + ($spread ? $fee : 0)),
            'memo'    => 'Loan disbursed — ' . $loan->loan_number,
        ];

        if ($fee > 0 && ! $spread) {
            $lines[] = [
                'account' => $payCode,
                'debit'   => $this->money($fee),
                'memo'    => 'Processing fee collected — ' . $loan->loan_number,
            ];
        }

        $lines[] = [
            'account' => self::RECEIVABLE_ACCOUNT,
            'credit'  => $this->money($financed),
            'memo'    => 'Invoice receivable converted to loan — ' . $loan->loan_number,
        ];

        if ($fee > 0) {
            $lines[] = [
                'account' => self::FEE_INCOME_ACCOUNT,
                'credit'  => $this->money($fee),
                'memo'    => 'Processing fee income — ' . $loan->loan_number,
            ];
        }

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-LN-' . $loan->loan_number,
            entryDate:     (string) $loan->disbursed_date,
            referenceType: Loan::class,
            referenceId:   (int) $loan->id,
            narration:     'Loan disbursed ' . $loan->loan_number,
            createdBy:     $user->id,
            lines:         $lines,
        ));
    }

    public function postRepayment(LoanRepayment $repayment, Loan $loan, Store $store, User $user): void
    {
        $amount    = JournalEntryData::toPaise($repayment->amount);
        $principal = JournalEntryData::toPaise($repayment->principal_component);
        $interest  = JournalEntryData::toPaise($repayment->interest_component)
                   + JournalEntryData::toPaise($repayment->penalty_collected);

        $mode    = strtolower((string) $repayment->payment_mode);
        $payCode = self::PAYMENT_ACCOUNTS[$mode] ?? '1020';

        $lines = [[
            'account' => $payCode,
            'debit'   => $this->money($amount),
            'memo'    => 'EMI collected via ' . ucfirst($mode) . ' — ' . $repayment->receipt_number,
        ]];

        if ($principal > 0) {
            $lines[] = [
                'account' => self::LOAN_BOOK_ACCOUNT,
                'credit'  => $this->money($principal),
                'memo'    => 'Loan principal recovered — ' . $loan->loan_number,
            ];
        }

        if ($interest > 0) {
            $memo = 'EMI interest income — ' . $loan->loan_number;
            if ((float) $repayment->penalty_collected > 0) {
                $memo .= ' (incl. penalty)';
            }
            $lines[] = [
                'account' => self::INTEREST_INCOME_ACCOUNT,
                'credit'  => $this->money($interest),
                'memo'    => $memo,
            ];
        }

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-LR-' . $repayment->receipt_number,
            entryDate:     $repayment->paid_at ?? now(),
            referenceType: LoanRepayment::class,
            referenceId:   (int) $repayment->id,
            narration:     'EMI collection ' . $repayment->receipt_number,
            createdBy:     $user->id,
            lines:         $lines,
        ));
    }

    private function money(int $paise): string
    {
        return JournalEntryData::fromPaise($paise);
    }
}

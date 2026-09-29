<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\DTOs\JournalEntryData;
use App\Exceptions\AccountingException;
use App\Models\Invoice;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;

/**
 * Builds the double-entry for a posted POS sale.
 *
 * Main entry (JE-<invoice_number>):
 *   Dr 1010/1020/1025/1026 (Cash/Bank/UPI/Card) = paid_amount   [if > 0]
 *   Dr 1030 Accounts Receivable                 = due_amount    [if > 0]
 *   Dr 4015 Sales Discounts Allowed             = discount_amount [if > 0] (contra-income)
 *   Cr 4010 Sales Revenue                       = subtotal + round_off
 *   Cr 4020 Shipping & Delivery Income          = shipping_charge [if > 0]
 *   Cr 2020 Output Tax Payable (GST)            = tax_amount      [if > 0]
 *
 * Shipping is posted to its OWN income line (4020), deliberately NOT absorbed
 * into 4010, so delivery income stays visible in the ledger. The chart of
 * accounts must contain 4020 — if yours doesn't, seed it or change
 * SHIPPING_INCOME_ACCOUNT below (e.g. to '4010' to fold shipping into sales
 * revenue). Shipping is treated as a non-taxed addition to the bill: no GST
 * is computed on it in this build.
 *
 * The round-off (a few paise by design) is absorbed into the revenue line so the
 * entry always balances exactly; subtotal/tax/discount/grand must already agree
 * within TOLERANCE_PAISE or the sale is rejected before posting.
 *
 * COGS entry (JE-COGS-<invoice_number>), relieving exactly what was sold:
 *   Dr 5010 Cost of Goods Sold / Cr 1040 Inventory Asset = cogs_total
 *
 * Margin-scheme rows need no special journal treatment: their tax_amount is
 * already the margin-only tax computed by SaleGstEvaluationService, and revenue
 * is simply booked net of that tax like any other row.
 */
final class SaleJournal
{
    private const TOLERANCE_PAISE = 5;

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

    /**
     * Income account credited for the shipping/delivery charge.
     * Must exist in the store's chart of accounts (see class docblock).
     */
    private const SHIPPING_INCOME_ACCOUNT = '4020';

    public function __construct(private readonly AccountingService $accounting) {}

    /**
     * @param array{subtotal: float, tax_amount: float, discount_amount: float, shipping_charge: float, round_off: float, grand_total: float, paid_amount: float, due_amount: float} $totals
     */
    public function post(Invoice $invoice, Store $store, User $user, array $totals, float $cogsTotal, string $paymentMode, bool $isIntraState): void
    {
        $subtotal = JournalEntryData::toPaise($totals['subtotal']);
        $tax      = JournalEntryData::toPaise($totals['tax_amount']);
        $discount = JournalEntryData::toPaise($totals['discount_amount']);
        $shipping = JournalEntryData::toPaise($totals['shipping_charge'] ?? 0);
        $roundOff = JournalEntryData::toPaise($totals['round_off']);
        $grand    = JournalEntryData::toPaise($totals['grand_total']);
        $paid     = JournalEntryData::toPaise($totals['paid_amount']);
        $due      = JournalEntryData::toPaise($totals['due_amount']);
        $cogs     = JournalEntryData::toPaise($cogsTotal);

        $expected = $subtotal + $tax - $discount + $shipping + $roundOff;
        $diff     = $grand - $expected;

        if (abs($diff) > self::TOLERANCE_PAISE) {
            throw AccountingException::saleTotalsMismatch($invoice->invoice_number, abs($diff));
        }
        if ($paid + $due !== $grand && abs(($paid + $due) - $grand) > self::TOLERANCE_PAISE) {
            throw AccountingException::saleTotalsMismatch($invoice->invoice_number, abs(($paid + $due) - $grand));
        }
        if ($paid > $grand) {
            throw AccountingException::overpaid($invoice->invoice_number);
        }

        $mode    = strtolower($paymentMode);
        $payCode = self::PAYMENT_ACCOUNTS[$mode] ?? '1020';

        $lines = [];

        if ($paid > 0) {
            $lines[] = ['account' => $payCode, 'debit' => $this->money($paid), 'memo' => 'Collected via ' . ucfirst($mode) . ' — ' . $invoice->invoice_number];
        }
        if ($due > 0) {
            $lines[] = ['account' => '1030', 'debit' => $this->money($due), 'memo' => 'Receivable — ' . $invoice->invoice_number];
        }
        if ($discount > 0) {
            $lines[] = ['account' => '4015', 'debit' => $this->money($discount), 'memo' => 'Sale discount allowed'];
        }
        // Round-off absorbed into revenue (a few paise by design).
        $lines[] = ['account' => '4010', 'credit' => $this->money($subtotal + $roundOff), 'memo' => 'Sales revenue — ' . $invoice->invoice_number];
        if ($shipping > 0) {
            $lines[] = ['account' => self::SHIPPING_INCOME_ACCOUNT, 'credit' => $this->money($shipping), 'memo' => 'Delivery/shipping collected — ' . $invoice->invoice_number];
        }
        if ($tax > 0) {
            $lines[] = ['account' => '2020', 'credit' => $this->money($tax), 'memo' => $isIntraState ? 'CGST + SGST output' : 'IGST output'];
        }

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-' . $invoice->invoice_number,
            entryDate:     (string) $invoice->invoice_date,
            referenceType: Invoice::class,
            referenceId:   (int) $invoice->id,
            narration:     'Sale ' . $invoice->invoice_number,
            createdBy:     $user->id,
            lines:         $lines,
        ));

        if ($cogs > 0) {
            $this->accounting->post(new JournalEntryData(
                storeId:       $store->id,
                entryNumber:   'JE-COGS-' . $invoice->invoice_number,
                entryDate:     (string) $invoice->invoice_date,
                referenceType: Invoice::class,
                referenceId:   (int) $invoice->id,
                narration:     'COGS for ' . $invoice->invoice_number,
                createdBy:     $user->id,
                lines:         [
                    ['account' => '5010', 'debit'  => $this->money($cogs), 'memo' => 'Cost of goods sold — ' . $invoice->invoice_number],
                    ['account' => '1040', 'credit' => $this->money($cogs), 'memo' => 'Inventory relieved — ' . $invoice->invoice_number],
                ],
            ));
        }
    }

    private function money(int $paise): string
    {
        return JournalEntryData::fromPaise($paise);
    }
}

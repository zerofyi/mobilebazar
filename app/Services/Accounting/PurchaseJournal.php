<?php

declare(strict_types=1);

namespace App\Services\Accounting;

use App\DTOs\JournalEntryData;
use App\Exceptions\AccountingException;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;

/**
 * Builds the double-entry for a posted (non-draft) purchase.
 *
 *   Dr 1040 Inventory Asset        = subtotal (± tiny rounding, see below)
 *   Dr 1050 Input Tax Credit (GST) = tax_amount              [if > 0]
 *   Dr 5030 Freight Inward         = shipping_charge         [if > 0]
 *   Cr 5015 Purchase Discounts Rcvd= discount_amount         [if > 0]  (contra-expense)
 *   Cr 2010 Accounts Payable       = grand_total
 *
 * subtotal - discount + tax + shipping must equal grand_total. Any difference up to
 * TOLERANCE_PAISE (frontend float rounding) is absorbed into the Inventory line so the
 * entry always balances exactly; a larger difference is rejected rather than booked wrong.
 *
 * If paid at bill time, a second entry settles AP against the account matching how the
 * money actually moved:
 *   Dr 2010 AP / Cr 1010 Cash | 1020 Bank | 1025 UPI/Gateway Clearing | 1026 Card Clearing
 */
final class PurchaseJournal
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

    public function __construct(private readonly AccountingService $accounting) {}

    public function post(PurchaseOrder $po, Store $store, User $user, array $data): void
    {
        $subtotal = JournalEntryData::toPaise($data['subtotal'] ?? 0);
        $tax      = JournalEntryData::toPaise($data['tax_amount'] ?? 0);
        $shipping = JournalEntryData::toPaise($data['shipping_charge'] ?? 0);
        $discount = JournalEntryData::toPaise($data['discount_amount'] ?? 0);
        $grand    = JournalEntryData::toPaise($data['grand_total']);
        $paid     = JournalEntryData::toPaise($data['paid_amount'] ?? 0);

        $expected = $subtotal - $discount + $tax + $shipping;
        $diff     = $grand - $expected; // absorbed into inventory; can be +/-

        if (abs($diff) > self::TOLERANCE_PAISE) {
            throw AccountingException::purchaseTotalsMismatch($po->po_number, abs($diff));
        }
        if ($paid > $grand) {
            throw AccountingException::overpaid($po->po_number);
        }

        $inventory = $subtotal + $diff;

        if ($inventory < 0) {
            // A structural problem, not rounding noise — fail loudly rather than post a
            // negative inventory debit.
            throw AccountingException::purchaseTotalsMismatch($po->po_number, abs($diff));
        }

        $lines = [];

        if ($inventory > 0) {
            $lines[] = ['account' => '1040', 'debit' => $this->money($inventory), 'memo' => 'Inventory received'];
        }
        if ($tax > 0) {
            $lines[] = ['account' => '1050', 'debit' => $this->money($tax), 'memo' => $po->is_intra_state ? 'CGST + SGST input credit' : 'IGST input credit'];
        }
        if ($shipping > 0) {
            $lines[] = ['account' => '5030', 'debit' => $this->money($shipping), 'memo' => 'Inward freight'];
        }
        if ($discount > 0) {
            $lines[] = ['account' => '5015', 'credit' => $this->money($discount), 'memo' => 'Purchase discount received'];
        }
        $lines[] = ['account' => '2010', 'credit' => $this->money($grand), 'memo' => 'Vendor liability — ' . $po->po_number];

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-' . $po->po_number,
            entryDate:     (string) $po->order_date,
            referenceType: PurchaseOrder::class,
            referenceId:   (int) $po->id,
            narration:     'Purchase ' . $po->po_number . ($po->vendor_invoice_no ? ' / Vendor inv: ' . $po->vendor_invoice_no : ''),
            createdBy:     $user->id,
            lines:         $lines,
        ));

        if ($paid > 0) {
            $mode    = strtolower((string) ($data['payment_mode'] ?? 'cash'));
            $payCode = self::PAYMENT_ACCOUNTS[$mode] ?? '1020'; // unrecognised modes fall back to Bank

            $this->accounting->post(new JournalEntryData(
                storeId:       $store->id,
                entryNumber:   'JE-PAY-' . $po->po_number,
                entryDate:     (string) $po->order_date,
                referenceType: PurchaseOrder::class,
                referenceId:   (int) $po->id,
                narration:     'Payment against ' . $po->po_number,
                createdBy:     $user->id,
                lines:         [
                    ['account' => '2010',    'debit'  => $this->money($paid), 'memo' => 'Clearing AP — ' . $po->po_number],
                    ['account' => $payCode,  'credit' => $this->money($paid), 'memo' => 'Paid via ' . ucfirst($mode)],
                ],
            ));
        }
    }

    private function money(int $paise): string
    {
        return JournalEntryData::fromPaise($paise);
    }
}

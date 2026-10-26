<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\JournalEntryData;
use App\Models\DebitNote;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\Summary\SummaryDeltaFactory;
use App\Services\SummaryService;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Records supplier payments against purchase orders.
 *
 * One `payments` row is created per PO allocation (payable = the PO, payer = the
 * PO's vendor morph) and each allocation posts its own journal entry:
 *   Dr 2010 Accounts Payable / Cr <mode account>
 * The PO's paid_amount / due_amount / payment_status are updated in the same
 * transaction, so money movement and document state can never drift apart.
 *
 * Payment-mode → account mapping mirrors the create-time payment journal in
 * Accounting\PurchaseJournal (cash→1010, bank/neft/rtgs/imps/cheque→1020,
 * upi→1025, card→1026).
 *
 * Idempotency: callers may pass `idempotency_key` (stored on every payment
 * row the request creates). A retried request with the same key returns the
 * original rows without booking anything twice. Requests without a key keep
 * the historical behaviour — journal entry numbers (JE-SUPPAY-<po_number>-
 * <seq>) only dedupe within a single logical attempt.
 */
final class SupplierPaymentService
{
    private const PAYMENT_ACCOUNTS = [
        'cash'   => '1010',
        'bank'   => '1020',
        'neft'   => '1020',
        'rtgs'   => '1020',
        'imps'   => '1020',
        'cheque' => '1020',
        'upi'    => '1025',
        'card'   => '1026',
    ];

    public function __construct(
        private readonly AccountingService $accounting,
        private readonly SummaryService $summaries,
    ) {}

    /**
     * @param array{
     *   purchase_order_id?: string|null,
     *   purchase_order_ids?: list<string>|null,
     *   allocations?: list<array{purchase_order_id: string, amount: int|float|string}>|null,
     *   amount: int|float|string,
     *   payment_mode: string,
     *   paid_at: string,
     *   txn_reference?: string|null,
     *   notes?: string|null,
     *   idempotency_key?: string|null,
     * } $data
     *
     * @return list<Payment> one payment row per PO allocation, in allocation order
     *
     * @throws ValidationException (422) on any violation.
     */
    public function recordPayment(Store $store, User $user, array $data): array
    {
        return DB::transaction(function () use ($store, $user, $data) {
            $fail = fn (string $field, string $msg): never => throw ValidationException::withMessages([$field => $msg]);

            // ── 1. Resolve and lock the target POs ────────────────────────────
            $uuids = $this->resolveUuids($data);

            /** @var Collection<int, PurchaseOrder> $pos */
            $pos = PurchaseOrder::query()
                ->where('store_id', $store->id)
                ->whereIn('uuid', $uuids)
                ->lockForUpdate()
                ->get();

            if ($pos->count() !== count($uuids)) {
                $fail('purchase_order_ids', 'One or more purchase orders were not found in this store.');
            }

            /** @var array<string, PurchaseOrder> $byUuid */
            $byUuid = $pos->keyBy('uuid')->all();

            foreach ($pos as $po) {
                if ($po->status === 'draft') {
                    $fail('purchase_order_ids', "Purchase {$po->po_number} is a draft and cannot receive payments.");
                }
            }

            // ── Idempotent replay (after the PO locks, so a concurrent twin
            //    request waits for the first to commit and then sees its rows)
            $idemKey = isset($data['idempotency_key']) && trim((string) $data['idempotency_key']) !== ''
                ? trim((string) $data['idempotency_key'])
                : null;
            if ($idemKey) {
                $existing = Payment::where('store_id', $store->id)
                    ->where('idempotency_key', $idemKey)
                    ->orderBy('id')
                    ->get();
                if ($existing->isNotEmpty()) {
                    return $existing->all();
                }
            }

            // ── 2. Build allocations (explicit or FIFO auto-allocation) ───────
            $allocations = $this->buildAllocations($data, $byUuid, $fail);

            // ── 3. One payment row + journal entry per allocation ─────────────
            $mode    = strtolower((string) $data['payment_mode']);
            $payCode = self::PAYMENT_ACCOUNTS[$mode] ?? '1020'; // unrecognised modes fall back to Bank
            $paidAt  = (string) $data['paid_at'];
            $notes   = isset($data['notes']) && trim((string) $data['notes']) !== ''
                ? trim((string) $data['notes'])
                : null;

            $payments = [];
            foreach ($allocations as $alloc) {
                /** @var PurchaseOrder $po */
                $po    = $alloc['po'];
                $paise = $alloc['paise'];

                $payment = Payment::create([
                    'payable_type'  => PurchaseOrder::class,
                    'payable_id'    => $po->id,
                    'payer_type'    => $po->vendor_type,
                    'payer_id'      => $po->vendor_id,
                    'store_id'      => $store->id,
                    'payment_mode'  => $mode,
                    'amount'        => JournalEntryData::fromPaise($paise),
                    'txn_reference' => $data['txn_reference'] ?? null,
                    'idempotency_key' => $idemKey,
                    'status'        => 'completed',
                    'paid_at'       => $paidAt,
                    'created_by'    => $user->id,
                ]);

                $this->postPaymentJournal($store, $user, $po, $paise, $mode, $payCode, $paidAt, $notes);
                $this->applyToPurchase($po, $paise);
                $this->summaries->record(SummaryDeltaFactory::forSupplierPayment(
                    $store->id, substr($paidAt, 0, 10), $mode, $paise / 100
                ));

                $payments[] = $payment;
            }

            return $payments;
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Resolution & allocation
    |--------------------------------------------------------------------------
    */

    /**
     * Normalise the PO target into an ordered, de-duplicated list of uuids.
     * Precedence: explicit allocation keys > purchase_order_ids > purchase_order_id.
     *
     * @return list<string>
     */
    private function resolveUuids(array $data): array
    {
        $uuids = [];

        if (! empty($data['allocations']) && is_array($data['allocations'])) {
            foreach ($data['allocations'] as $alloc) {
                if (isset($alloc['purchase_order_id'])) {
                    $uuids[] = (string) $alloc['purchase_order_id'];
                }
            }
        } elseif (! empty($data['purchase_order_ids']) && is_array($data['purchase_order_ids'])) {
            $uuids = array_map('strval', $data['purchase_order_ids']);
        } elseif (! empty($data['purchase_order_id'])) {
            $uuids = [(string) $data['purchase_order_id']];
        }

        return array_values(array_unique($uuids));
    }

    /**
     * @param  array<string, PurchaseOrder> $byUuid
     * @return list<array{po: PurchaseOrder, paise: int}>
     */
    private function buildAllocations(array $data, array $byUuid, callable $fail): array
    {
        $totalPaise = JournalEntryData::toPaise($data['amount']);

        if ($totalPaise <= 0) {
            $fail('amount', 'Payment amount must be greater than zero.');
        }

        // ── Explicit allocations ──────────────────────────────────────────────
        if (! empty($data['allocations']) && is_array($data['allocations'])) {
            $allocations = [];
            $sumPaise    = 0;

            foreach ($data['allocations'] as $i => $alloc) {
                $uuid  = (string) ($alloc['purchase_order_id'] ?? '');
                $paise = JournalEntryData::toPaise($alloc['amount'] ?? 0);

                if (! isset($byUuid[$uuid])) {
                    $fail("allocations.{$i}.purchase_order_id", 'Purchase order not found in this store.');
                }
                if ($paise <= 0) {
                    $fail("allocations.{$i}.amount", 'Each allocation amount must be greater than zero.');
                }

                $po       = $byUuid[$uuid];
                $duePaise = JournalEntryData::toPaise((float) $po->due_amount);

                if ($paise > $duePaise) {
                    $fail(
                        "allocations.{$i}.amount",
                        "Allocation of " . JournalEntryData::fromPaise($paise)
                            . " exceeds the due amount of " . JournalEntryData::fromPaise($duePaise)
                            . " on {$po->po_number}."
                    );
                }

                $allocations[] = ['po' => $po, 'paise' => $paise];
                $sumPaise += $paise;
            }

            if ($sumPaise !== $totalPaise) {
                $fail('allocations', 'Allocation amounts must add up to the payment amount.');
            }

            return $allocations;
        }

        // ── Auto-allocation: oldest due first ─────────────────────────────────
        $sorted = array_values($byUuid);
        usort($sorted, function (PurchaseOrder $a, PurchaseOrder $b): int {
            $key = fn (PurchaseOrder $po): string => ($po->due_date?->toDateString() ?? '9999-12-31')
                . '|' . ($po->order_date?->toDateString() ?? '9999-12-31')
                . '|' . str_pad((string) $po->id, 10, '0', STR_PAD_LEFT);

            return $key($a) <=> $key($b);
        });

        $allocations = [];
        $remaining   = $totalPaise;

        foreach ($sorted as $po) {
            if ($remaining <= 0) {
                break;
            }

            $duePaise = JournalEntryData::toPaise((float) $po->due_amount);

            if ($duePaise <= 0) {
                continue;
            }

            $take          = min($remaining, $duePaise);
            $allocations[] = ['po' => $po, 'paise' => $take];
            $remaining -= $take;
        }

        if ($remaining > 0) {
            $fail(
                'amount',
                'Payment of ' . JournalEntryData::fromPaise($totalPaise)
                    . ' exceeds the total due of ' . JournalEntryData::fromPaise($totalPaise - $remaining)
                    . ' across the selected purchase orders.'
            );
        }

        return $allocations;
    }

    /*
    |--------------------------------------------------------------------------
    | Posting
    |--------------------------------------------------------------------------
    */

    private function postPaymentJournal(
        Store $store,
        User $user,
        PurchaseOrder $po,
        int $paise,
        string $mode,
        string $payCode,
        string $paidAt,
        ?string $notes,
    ): void {
        // Sequence = payment count for this PO (the row was already created, so +1
        // is baked in). Unique per PO → idempotent replay via post().
        $seq = Payment::query()
            ->where('payable_type', PurchaseOrder::class)
            ->where('payable_id', $po->id)
            ->count();

        $money = JournalEntryData::fromPaise($paise);

        $this->accounting->post(new JournalEntryData(
            storeId:       $store->id,
            entryNumber:   'JE-SUPPAY-' . $po->po_number . '-' . $seq,
            entryDate:     $paidAt,
            referenceType: PurchaseOrder::class,
            referenceId:   (int) $po->id,
            narration:     'Supplier payment (' . $mode . ') against ' . $po->po_number
                . ($notes ? ' — ' . mb_substr($notes, 0, 200) : ''),
            createdBy:     $user->id,
            lines:         [
                ['account' => '2010', 'debit' => $money, 'memo' => 'Clearing AP — ' . $po->po_number],
                ['account' => $payCode, 'credit' => $money, 'memo' => 'Paid via ' . ucfirst($mode)],
            ],
        ));
    }

    /**
     * Roll the allocation into the PO's paid/due/status. All arithmetic in paise.
     */
    private function applyToPurchase(PurchaseOrder $po, int $paise): void
    {
        $newPaid = JournalEntryData::toPaise((float) $po->paid_amount) + $paise;
        $grand   = JournalEntryData::toPaise((float) $po->grand_total);
        // Debit notes reduce what is owed without touching paid_amount —
        // due is grand − paid − returns. Recomputing as grand − paid alone
        // would resurrect the returned slice as payable a second time.
        $returns = JournalEntryData::toPaise(DebitNote::where('purchase_order_id', $po->id)
            ->where('status', 'issued')
            ->sum('grand_total'));
        $newDue  = max(0, $grand - $newPaid - $returns);

        $po->update([
            'paid_amount'    => JournalEntryData::fromPaise($newPaid),
            'due_amount'     => JournalEntryData::fromPaise($newDue),
            'payment_status' => $newDue === 0 ? 'paid' : ($newPaid > 0 ? 'partial' : 'unpaid'),
        ]);
    }
}

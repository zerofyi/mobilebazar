<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CreditNote;
use App\Models\DebitNote;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\JournalEntry;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\StockTransfer;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Summary\SummaryDeltaFactory;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

/**
 * Inter-store stock transfer: ONE sale + ONE purchase, atomically.
 *
 * Every store is a separate financial entity, so a transfer is not a stock
 * journal — it is a regular sale in the source store (party = the supplier
 * record that has the target store attached) and a regular purchase in the
 * target store (vendor = that store's supplier record for the source store),
 * posted back-to-back inside a single transaction. The stock_transfers row
 * is only a bridge between the two documents: it carries no items and no
 * prices, so credit notes (sale side) and debit notes (purchase side) keep
 * working through the existing flows.
 *
 * Preconditions (checked before anything posts, so a failed transfer never
 * leaves a half-created document):
 *  - the sale party is an active supplier of the source store with a store
 *    attached (linked_store_id);
 *  - the target store has the source store attached on one of ITS supplier
 *    records — that record becomes the purchase vendor.
 *
 * Fiscal decisions stay with the engines, exactly as in a manual entry:
 *  - the sale payload comes from the POS screen and is evaluated by
 *    SaleService / SaleGstEvaluationService untouched;
 *  - the purchase flags (bill_type po/pv, is_gst_billed, per-line margin and
 *    tax) are derived with the same rules the purchase screen applies
 *    (evalDocumentFlags / evalLineMargin / evalLineCost in
 *    purchase-context.tsx): bill_type from the target store's GST
 *    registration and the vendor's GSTIN, margin from the vendor's
 *    registration and each item's condition, tax only on non-margin lines
 *    of a GST-billed purchase from a registered vendor, always inclusive.
 *
 * Settlement mirrors the sale: the purchase is created unpaid, then every
 * payment split recorded on the sale is replayed through
 * SupplierPaymentService against the purchase — same modes (card variants
 * normalised to 'card', the mode the supplier-payment flow uses), same
 * references, same date — so both stores end with identical paid / due /
 * status and per-channel journals.
 */
final class StockTransferService
{
    public function __construct(
        private readonly SaleService $sales,
        private readonly PurchaseService $purchases,
        private readonly SupplierPaymentService $supplierPayments,
        private readonly AccountingService $accounting,
        private readonly SummaryService $summaries,
    ) {}

    /**
     * @param array $saleData validated sale payload (StoreSaleRequest shape)
     *                        whose party is the attached supplier.
     */
    public function transfer(Store $sourceStore, User $user, array $saleData): StockTransfer
    {
        $key = (string) ($saleData['idempotency_key'] ?? '');

        return DB::transaction(function () use ($sourceStore, $user, $saleData, $key) {
            // Idempotent replay: the same submission key already produced a
            // transfer — return its bridge instead of double-posting.
            if ($key !== '') {
                $existingInvoice = Invoice::where('store_id', $sourceStore->id)
                    ->where('idempotency_key', $key)
                    ->first();
                if ($existingInvoice) {
                    $existing = StockTransfer::where('sale_invoice_id', $existingInvoice->id)->first();
                    if ($existing) {
                        return $existing->load(['saleInvoice', 'purchaseOrder']);
                    }
                    throw ValidationException::withMessages([
                        'idempotency_key' => 'This submission key was already used by a regular sale. Refresh the transfer page and try again.',
                    ]);
                }
            }

            [$party, $targetStore, $counterpart] = $this->resolveParties($sourceStore, $saleData);
            $this->assertTransferablePayload($saleData);

            $transferNumber = $this->reserveTransferNumber($sourceStore->id);

            // 1. The sale — source store, party = attached supplier. The sale
            //    flips source units to 'sold', which frees their IMEIs in the
            //    active-only indexes for the target purchase below.
            $invoice = $this->sales->createSale($sourceStore, $user, $saleData);

            // 2. The purchase — target store, vendor = its supplier record
            //    for the source store, vendor invoice no. = the sale number.
            $invoice->load([
                'items.stockUnit.deviceHealth',
                'items.stockBatch',
                'payments',
            ]);

            $purchaseData = $this->buildPurchaseData($invoice, $counterpart, $transferNumber, $key);
            $purchase = $this->purchases->processPurchase($targetStore, $user, $purchaseData);

            // 3. Settlement — replay the sale's payment splits as supplier
            //    payments against the purchase, split by split.
            $this->mirrorPayments($targetStore, $user, $invoice, $purchase, $transferNumber);

            // 4. The bridge — links only, no items, no prices.
            $transfer = StockTransfer::create([
                'transfer_number'   => $transferNumber,
                'from_store_id'     => $sourceStore->id,
                'to_store_id'       => $targetStore->id,
                'sale_invoice_id'   => $invoice->id,
                'purchase_order_id' => $purchase->id,
                'status'            => 'completed',
                'dispatched_at'     => now(),
                'received_at'       => now(),
                'created_by'        => $user->id,
            ]);

            Log::info('Stock transfer completed', [
                'transfer_number' => $transferNumber,
                'from_store_id'   => $sourceStore->id,
                'to_store_id'     => $targetStore->id,
                'invoice_id'      => $invoice->id,
                'purchase_id'     => $purchase->id,
                'user_id'         => $user->id,
            ]);

            return $transfer->load(['saleInvoice', 'purchaseOrder']);
        });
    }

    /**
     * Edit a posted transfer — re-price lines and/or take items back —
     * by re-posting BOTH halves inside one transaction: the sale through
     * SaleService::updateSale (source store) and the purchase through
     * PurchaseService::updatePurchase (target store), rebuilt from the
     * newly posted invoice exactly like transfer() builds it. A removed
     * item simply leaves both payloads: its source unit stays 'available'
     * (taken back) and its target row is deleted by the purchase edit.
     *
     * The one mechanical hazard is the global active-IMEI unique index:
     * reversing the sale restores the source units to 'available', but
     * their target-store twins are 'available' too, with the same IMEIs.
     * So before the sale edit, every target unit is PARKED (status flipped
     * to 'sold', which removes it from the active indexes) and its id is
     * handed to the purchase edit as editable-despite-status. The park is
     * invisible outside this transaction and rolls back with it.
     *
     * Settlement is re-mirrored, not patched: the original mirrored
     * supplier payments are voided (journals reversed, rows kept as
     * 'voided' so payment journal numbering never collides) and the edited
     * sale's splits are replayed fresh.
     *
     * Hard gates (all 422, nothing changes): a credit note on the sale or
     * a debit note on the purchase makes the transfer final; any target
     * stock that has been sold or moved onward in the target store blocks
     * the edit for the whole transfer; new items cannot be added (create a
     * new transfer) and bulk quantities cannot exceed what was transferred.
     *
     * @param array $saleData validated sale payload (UpdateStockTransferRequest
     *                        shape) for the edited sale.
     */
    public function updateTransfer(Store $sourceStore, User $user, StockTransfer $transfer, array $saleData): StockTransfer
    {
        $key = (string) ($saleData['idempotency_key'] ?? '');

        return DB::transaction(function () use ($sourceStore, $user, $transfer, $saleData, $key) {
            $transfer = StockTransfer::where('id', $transfer->id)->lockForUpdate()->firstOrFail();
            $invoice = Invoice::where('id', $transfer->sale_invoice_id)->lockForUpdate()->firstOrFail();
            $purchase = PurchaseOrder::where('id', $transfer->purchase_order_id)->lockForUpdate()->firstOrFail();

            // Idempotent replay: this exact edit already landed.
            if ($key !== '' && $invoice->edit_idempotency_key
                && hash_equals((string) $invoice->edit_idempotency_key, $key)) {
                return $transfer->load(['saleInvoice', 'purchaseOrder']);
            }

            if ((int) $transfer->from_store_id !== (int) $sourceStore->id
                || (int) $invoice->store_id !== (int) $sourceStore->id) {
                throw ValidationException::withMessages([
                    'transfer' => 'Only the source store can edit this transfer.',
                ]);
            }

            $targetStore = Store::where('is_active', true)->find((int) $transfer->to_store_id);
            if (! $targetStore) {
                throw ValidationException::withMessages([
                    'transfer' => 'The target store of this transfer is missing or inactive.',
                ]);
            }

            $this->assertTransferEditable($transfer, $invoice, $purchase, $saleData);

            // ── Target-side intact check; collect the units to park ──────
            $purchase->loadMissing(['items.stockUnits', 'items.stockBatches']);
            $parkedUnitIds = [];
            foreach ($purchase->items as $poItem) {
                foreach ($poItem->stockUnits as $unit) {
                    if ($unit->status !== 'available') {
                        throw ValidationException::withMessages([
                            'transfer' => "This transfer cannot be edited: {$poItem->manual_item_name} (IMEI "
                                . ($unit->imei1 ?? $unit->serial_number ?? "#{$unit->id}")
                                . ") has already been sold or moved in {$targetStore->name}.",
                        ]);
                    }
                    $parkedUnitIds[] = $unit->id;
                }
                foreach ($poItem->stockBatches as $batch) {
                    if ((int) $batch->remaining_qty !== (int) $batch->received_qty) {
                        throw ValidationException::withMessages([
                            'transfer' => "This transfer cannot be edited: batch {$batch->batch_number} "
                                . "({$poItem->manual_item_name}) has already been sold from in {$targetStore->name}.",
                        ]);
                    }
                }
            }

            // Park the target units (see docblock). Status-only flip: no
            // ledger or snapshot movement — quantities do not change.
            if ($parkedUnitIds !== []) {
                StockUnit::whereIn('id', $parkedUnitIds)->update(['status' => 'sold']);
            }

            // 1. The sale half — reverse + repost in the source store.
            $invoice = $this->sales->updateSale($sourceStore, $user, $invoice, $saleData, viaTransfer: true);

            // 2. The purchase half — rebuilt from the POSTED invoice and
            //    mapped onto the target store's existing rows.
            $invoice->load([
                'items.stockUnit.deviceHealth',
                'items.stockBatch',
                'items.batchAllocations.stockBatch',
                'payments',
            ]);

            $counterpart = Supplier::query()
                ->where('store_id', $targetStore->id)
                ->where('linked_store_id', $sourceStore->id)
                ->where('is_active', true)
                ->first();
            if (! $counterpart) {
                throw ValidationException::withMessages([
                    'transfer' => "Transfer blocked: {$targetStore->name} no longer has {$sourceStore->name} attached as a supplier.",
                ]);
            }

            $purchaseData = $this->buildPurchaseEditData($invoice, $purchase, $counterpart, $transfer, $key);
            $purchase = $this->purchases->updatePurchase($targetStore, $user, $purchase, $purchaseData, viaTransfer: true, transferParkedUnitIds: $parkedUnitIds);

            // 3. Settlement — void the old mirror, replay the new splits.
            $this->voidMirroredPayments($targetStore, $user, $purchase, $transfer);
            $purchase->refresh();
            $this->mirrorPayments($targetStore, $user, $invoice, $purchase, $transfer->transfer_number, 'transfer-edit-' . $key);

            // 4. Both halves must total identically — anything else is a
            //    bug, and the transaction roll-back is the safe outcome.
            $invoice->refresh();
            $purchase->refresh();
            if (abs((float) $invoice->grand_total - (float) $purchase->grand_total) > 0.005) {
                throw ValidationException::withMessages([
                    'transfer' => 'Transfer edit failed: the sale and purchase totals do not match. Nothing was changed.',
                ]);
            }

            Log::info('Stock transfer edited', [
                'transfer_number' => $transfer->transfer_number,
                'from_store_id'    => $sourceStore->id,
                'to_store_id'      => $targetStore->id,
                'invoice_id'       => $invoice->id,
                'purchase_id'      => $purchase->id,
                'user_id'          => $user->id,
            ]);

            return $transfer->load(['saleInvoice', 'purchaseOrder']);
        });
    }

    /**
     * Pre-flight gates for a transfer edit (see updateTransfer docblock).
     *
     * @throws ValidationException
     */
    private function assertTransferEditable(StockTransfer $transfer, Invoice $invoice, PurchaseOrder $purchase, array $saleData): void
    {
        $fail = fn (string $field, string $msg) => throw ValidationException::withMessages([$field => $msg]);

        if ($transfer->status !== 'completed') {
            $fail('transfer', 'Only a completed transfer can be edited.');
        }

        if (CreditNote::where('invoice_id', $invoice->id)->where('status', 'issued')->exists()) {
            $fail('transfer', "Transfer {$transfer->transfer_number} is final: a credit note has been issued against its sale.");
        }
        if (DebitNote::where('purchase_order_id', $purchase->id)->where('status', 'issued')->exists()) {
            $fail('transfer', "Transfer {$transfer->transfer_number} is final: a debit note has been issued against its purchase.");
        }

        // The party IS the bridge identity (it selects the target store) —
        // it cannot change in an edit.
        if (($saleData['party_type'] ?? null) !== 'supplier'
            || (int) ($saleData['party_id'] ?? 0) !== (int) $invoice->party_id) {
            $fail('party_id', 'The target store of a transfer cannot be changed. Create a new transfer instead.');
        }

        $lines = $saleData['lines'] ?? [];
        if ($lines === []) {
            $fail('lines', 'A transfer must keep at least one item. To take everything back, keep one item here and return the rest, or reverse the transfer documents.');
        }

        // Only stock that was part of THIS transfer may appear in the edit.
        $invoice->loadMissing(['items.batchAllocations']);
        $originalUnitIds = [];
        $originalBulkQty = [];
        foreach ($invoice->items as $item) {
            if ($item->stock_unit_id) {
                $originalUnitIds[] = (int) $item->stock_unit_id;
            } else {
                $vid = (int) ($item->product_variant_id ?? 0);
                $originalBulkQty[$vid] = ($originalBulkQty[$vid] ?? 0) + (int) $item->quantity;
            }
        }

        $payloadBulkQty = [];
        foreach ($lines as $i => $line) {
            if (! empty($line['is_serialized'])) {
                foreach ($line['stock_unit_ids'] ?? [] as $unitId) {
                    if (! in_array((int) $unitId, $originalUnitIds, true)) {
                        $fail("lines.{$i}", 'This item was not part of the original transfer. Create a new transfer for additional items.');
                    }
                }
            } else {
                $vid = (int) ($line['product_variant_id'] ?? 0);
                $payloadBulkQty[$vid] = ($payloadBulkQty[$vid] ?? 0) + (int) ($line['qty'] ?? 0);
            }
        }
        foreach ($payloadBulkQty as $vid => $qty) {
            if (! isset($originalBulkQty[$vid])) {
                $fail('lines', 'An item in the edit was not part of the original transfer. Create a new transfer for additional items.');
            }
            if ($qty > $originalBulkQty[$vid]) {
                $fail('lines', 'Quantity cannot exceed what was originally transferred. Create a new transfer for the extra quantity.');
            }
        }

        // Settlement headroom on the target side: money the target store
        // paid against this purchase OUTSIDE the transfer mirror (manual
        // supplier payments) is never touched by an edit, so the edited
        // totals must still cover it.
        $manualPaid = $this->r2((float) $purchase->paid_amount - (float) $invoice->paid_amount);
        $newPaid = $this->r2((float) ($saleData['paid_amount'] ?? 0));
        $newGrand = $this->r2((float) ($saleData['grand_total'] ?? 0));
        if ($manualPaid > 0.005 && $manualPaid + $newPaid > $newGrand + 0.005) {
            $fail('transfer', "This transfer cannot be edited: {$this->r2($manualPaid)} was paid separately against the purchase in the target store. Settle or adjust that payment first.");
        }
    }

    /**
     * The purchase-edit payload: buildPurchaseData() output (the same
     * builder transfer() uses, so fiscal rules stay identical) with the
     * target store's existing row IDs mapped onto each line, which is what
     * PurchaseService::updatePurchase needs to apply its row-level guards
     * and preserve the surviving stock rows' identities.
     */
    private function buildPurchaseEditData(Invoice $invoice, PurchaseOrder $purchase, Supplier $vendor, StockTransfer $transfer, string $editKey): array
    {
        $data = $this->buildPurchaseData($invoice, $vendor, $transfer->transfer_number, 'edit-' . $editKey);
        // edit_idempotency_key columns are varchar(36) (UUID-sized) — the raw
        // edit key fits; a prefixed variant overflows (SQLSTATE 22001). The
        // sale half stores the same key in its own table, so replay checks
        // on both halves stay consistent.
        $data['idempotency_key'] = $editKey;

        $purchase->loadMissing(['items.stockUnits', 'items.stockBatches']);

        // Target serialized units by identifier — the twins carry the same
        // IMEI/serial as the source units behind the invoice items.
        $targetUnitByKey = [];
        foreach ($purchase->items as $poItem) {
            foreach ($poItem->stockUnits as $unit) {
                $k = ($unit->imei1 ?? '') . '|' . ($unit->imei2 ?? '') . '|' . ($unit->serial_number ?? '');
                $targetUnitByKey[$k] = $unit;
            }
        }
        $usedBulkItemIds = [];

        // buildPurchaseData emits exactly one line per invoice item, in
        // invoice-item order — line $li belongs to $invoice->items[$li].
        foreach ($data['lines'] as $li => $line) {
            $invoiceItem = $invoice->items[$li] ?? null;
            if (! $invoiceItem) {
                throw ValidationException::withMessages([
                    'transfer' => 'Transfer edit failed: a sale line could not be mapped to the purchase. Nothing was changed.',
                ]);
            }

            if (! empty($line['is_serialized'])) {
                $src = $invoiceItem->stockUnit;
                $k = ($src?->imei1 ?? '') . '|' . ($src?->imei2 ?? '') . '|' . ($src?->serial_number ?? '');
                $target = $targetUnitByKey[$k] ?? null;
                if (! $target) {
                    throw ValidationException::withMessages([
                        'transfer' => 'Transfer edit failed: a transferred unit could not be found in the target store. Nothing was changed.',
                    ]);
                }
                $data['lines'][$li]['purchase_order_item_id'] = $target->purchase_order_item_id;
                $data['lines'][$li]['units'][0]['stock_unit_id'] = $target->id;
                continue;
            }

            // Bulk: the target item with the same variant + name, not yet
            // consumed by an earlier line of this payload.
            $match = null;
            foreach ($purchase->items as $poItem) {
                if (in_array($poItem->id, $usedBulkItemIds, true)
                    || $poItem->stockUnits->isNotEmpty()
                    || (int) ($poItem->product_variant_id ?? 0) !== (int) ($line['product_variant_id'] ?? 0)
                    || (string) ($poItem->manual_item_name ?? '') !== (string) ($line['manual_item_name'] ?? '')) {
                    continue;
                }
                $match = $poItem;
                break;
            }
            if (! $match || $match->stockBatches->count() !== 1) {
                throw ValidationException::withMessages([
                    'transfer' => 'Transfer edit failed: a transferred batch could not be mapped in the target store. Nothing was changed.',
                ]);
            }
            $usedBulkItemIds[] = $match->id;
            $batch = $match->stockBatches->first();
            $data['lines'][$li]['purchase_order_item_id'] = $match->id;
            $data['lines'][$li]['batches'] = [[
                'stock_batch_id' => $batch->id,
                'quantity'       => (int) $line['ordered_qty'],
                'base_cost'      => $line['base_cost'],
                'landed_cost'    => $line['landed_cost'],
            ]];
        }

        return $data;
    }

    /**
     * Void the supplier payments that mirrorPayments() created for this
     * transfer: reverse each JE-SUPPAY journal, mark the payment row
     * 'voided' (rows are kept — supplier-payment journal numbers are
     * sequence-based, so deleting a row would let a later payment reuse a
     * number that already exists), negate its summary delta, and reset the
     * purchase's paid/due baseline to whatever was settled OUTSIDE the
     * mirror (manual payments stay untouched).
     *
     * Mirrored payments are identified by their journals: the JE-SUPPAY
     * narration carries "Stock transfer {number}". The payment row paired
     * with a journal is the seq-th payment of the purchase (the journal
     * sequence is the payment count at posting time and payment rows are
     * never deleted, so the pairing is stable). Amounts must agree to the
     * paise — any mismatch aborts the edit rather than guessing.
     */
    private function voidMirroredPayments(Store $targetStore, User $user, PurchaseOrder $purchase, StockTransfer $transfer): void
    {
        $entries = JournalEntry::query()
            ->where('store_id', $targetStore->id)
            ->where('reference_type', PurchaseOrder::class)
            ->where('reference_id', $purchase->id)
            ->where('entry_number', 'like', 'JE-SUPPAY-%')
            ->where('narration', 'like', '%' . $transfer->transfer_number . '%')
            ->whereNotExists(function ($q) {
                $q->selectRaw('1')
                    ->from('journal_entries as rev')
                    ->whereColumn('rev.reverses_journal_id', 'journal_entries.id');
            })
            ->with('lines.account')
            ->get();

        if ($entries->isEmpty()) {
            return;
        }

        $payments = Payment::query()
            ->where('payable_type', PurchaseOrder::class)
            ->where('payable_id', $purchase->id)
            ->orderBy('id')
            ->get()
            ->values();

        $voidedTotal = 0.0;
        foreach ($entries as $entry) {
            $seq = (int) substr($entry->entry_number, strrpos($entry->entry_number, '-') + 1);
            $payment = $payments->get($seq - 1);
            $journalAmount = $this->r2($entry->lines
                ->filter(fn ($l) => ($l->account?->code ?? null) === '2010')
                ->sum(fn ($l) => (float) $l->debit));

            if (! $payment || $payment->status !== 'completed'
                || abs((float) $payment->amount - $journalAmount) > 0.005) {
                throw ValidationException::withMessages([
                    'transfer' => 'Transfer edit blocked: the mirrored settlement in the target store could not be verified. No changes were made.',
                ]);
            }

            $reversal = $this->accounting->reverse($entry, $user->id, 'Transfer edited — settlement re-mirrored', $entry->entry_date);
            $reversal->update(['reverses_journal_id' => $entry->id]);

            $payment->update(['status' => 'voided']);

            $this->summaries->record(SummaryDeltaFactory::forSupplierPayment(
                $targetStore->id,
                substr((string) $payment->paid_at, 0, 10),
                (string) $payment->payment_mode,
                -1 * (float) $payment->amount,
            ));

            $voidedTotal += (float) $payment->amount;
        }

        $purchase->refresh();
        $paid = $this->r2((float) $purchase->paid_amount - $voidedTotal);
        $dnTotal = $this->r2(DebitNote::where('purchase_order_id', $purchase->id)
            ->where('status', 'issued')
            ->sum('grand_total'));
        $due = max(0.0, $this->r2((float) $purchase->grand_total - $paid - $dnTotal));

        $purchase->update([
            'paid_amount'    => $paid,
            'due_amount'     => $due,
            'payment_status' => $due <= 0.0 ? 'paid' : ($paid > 0 ? 'partial' : 'unpaid'),
        ]);
    }

    /**
     * Resolve and lock both party records and the target store.
     *
     * @return array{0: Supplier, 1: Store, 2: Supplier}
     *         [source-side party, target store, target-side vendor record]
     */
    private function resolveParties(Store $sourceStore, array $saleData): array
    {
        if (($saleData['party_type'] ?? null) !== 'supplier') {
            throw ValidationException::withMessages([
                'party_id' => 'A stock transfer must be billed to a supplier with a store attached.',
            ]);
        }

        $party = Supplier::query()
            ->where('store_id', $sourceStore->id)
            ->where('is_active', true)
            ->lockForUpdate()
            ->find((int) ($saleData['party_id'] ?? 0));

        if (! $party) {
            throw ValidationException::withMessages([
                'party_id' => 'The selected party is not an active supplier of this store.',
            ]);
        }

        if (! $party->linked_store_id) {
            throw ValidationException::withMessages([
                'party_id' => "Supplier {$party->name} has no store attached. Attach a store first (Suppliers → ⋯ → Attach Store).",
            ]);
        }

        $targetStore = Store::where('is_active', true)->find((int) $party->linked_store_id);
        if (! $targetStore) {
            throw ValidationException::withMessages([
                'party_id' => 'The store attached to this supplier is missing or inactive.',
            ]);
        }
        if ((int) $targetStore->id === (int) $sourceStore->id) {
            throw ValidationException::withMessages([
                'party_id' => 'A store cannot transfer stock to itself.',
            ]);
        }

        // The other side of the pairing: the target store must have THIS
        // store attached on one of its own supplier records. Name matching
        // is never used — the attachment is the identity.
        $counterpart = Supplier::query()
            ->where('store_id', $targetStore->id)
            ->where('linked_store_id', $sourceStore->id)
            ->where('is_active', true)
            ->lockForUpdate()
            ->first();

        if (! $counterpart) {
            throw ValidationException::withMessages([
                'party_id' => "Transfer blocked: {$targetStore->name} has not attached {$sourceStore->name} as a supplier yet. "
                    . "Ask {$targetStore->name} to attach it (their Suppliers → ⋯ → Attach Store), then retry.",
            ]);
        }

        return [$party, $targetStore, $counterpart];
    }

    /**
     * Payload guards the sale request cannot express for a transfer: the
     * target purchase has no round-off field and its journal identity
     * (subtotal − discount + tax + shipping = grand) must hold to the paise,
     * buyback splits belong to the buyback flow, and only stock-backed lines
     * can move between stores.
     */
    private function assertTransferablePayload(array $saleData): void
    {
        if (abs((float) ($saleData['round_off'] ?? 0)) > 0.005) {
            throw ValidationException::withMessages([
                'round_off' => 'Round-off must be 0 for a stock transfer, so the sale and the purchase total match exactly in both stores.',
            ]);
        }

        if (strtolower((string) ($saleData['payment_mode'] ?? '')) === 'buyback') {
            throw ValidationException::withMessages([
                'payments' => 'Buyback adjustment is not available on a stock transfer.',
            ]);
        }
        foreach ($saleData['payments'] ?? [] as $p) {
            if (strtolower((string) ($p['mode'] ?? '')) === 'buyback') {
                throw ValidationException::withMessages([
                    'payments' => 'Buyback adjustment is not available on a stock transfer.',
                ]);
            }
            if (! empty($p['purchase_order_id'])) {
                throw ValidationException::withMessages([
                    'payments' => 'Payments on a stock transfer cannot be linked to a purchase bill.',
                ]);
            }
        }

        foreach ($saleData['lines'] ?? [] as $i => $line) {
            $isSerialized = ! empty($line['is_serialized']);
            if ($isSerialized) {
                continue; // exact unit ids are enforced by StoreSaleRequest
            }
            if (empty($line['product_variant_id']) && empty($line['preferred_batch_id'])) {
                throw ValidationException::withMessages([
                    "lines.{$i}" => 'Manual items cannot be transferred — only stock items move between stores.',
                ]);
            }
        }
    }

    /**
     * Build the target store's purchase payload from the POSTED sale — the
     * invoice items are the truth (prices the user confirmed, discounts,
     * tax %, the exact units and batches that moved). Mirrors the payload
     * the purchase screen itself submits (groupRowsForSubmit).
     */
    private function buildPurchaseData(Invoice $invoice, Supplier $vendor, string $transferNumber, string $saleKey): array
    {
        $vendorRegistered = $this->isRegisteredGstin($vendor->gstin);

        // evalDocumentFlags(target store, gst toggle = the sale as billed,
        // vendor registered, party present). The vendor's owner store IS the
        // target store — the flags belong to its books, not the source's.
        $targetStore = $vendor->store;
        $isGstBilled = (bool) $targetStore->is_gst_registered && (bool) $invoice->is_gst_billed;
        $billType = $isGstBilled && $vendorRegistered ? 'po' : 'pv';

        $lines = [];
        $subtotal = 0.0;
        $taxTotal = 0.0;

        foreach ($invoice->items as $item) {
            [$line, $lineBase, $lineTax] = $this->buildPurchaseLine($item, $isGstBilled, $vendorRegistered);
            $lines[] = $line;
            $subtotal += $lineBase;
            $taxTotal += $lineTax;
        }

        return [
            'idempotency_key'   => 'transfer-' . $saleKey,
            'party_type'        => 'supplier',
            'party_id'          => $vendor->id,
            'bill_type'         => $billType,
            'type'              => 'direct',
            'is_gst_billed'     => $isGstBilled,
            'is_intra_state'    => (bool) $invoice->is_intra_state,
            'order_date'        => $invoice->invoice_date->toDateString(),
            'is_draft'          => false,
            'vendor_invoice_no' => $invoice->invoice_number,
            'notes'             => "Stock transfer {$transferNumber} — against sale {$invoice->invoice_number}.",
            'lines'             => $lines,
            'subtotal'          => $this->r2($subtotal),
            'tax_amount'        => $this->r2($taxTotal),
            'discount_amount'   => $this->r2($invoice->discount_amount),
            'shipping_charge'   => $this->r2($invoice->shipping_charge),
            'grand_total'       => $this->r2($invoice->grand_total),
            // Created unpaid on purpose: the sale's splits are replayed
            // through SupplierPaymentService right after (mirrorPayments),
            // which posts the per-mode journals and rolls paid/due/status.
            'paid_amount'       => 0,
            'due_amount'        => $this->r2($invoice->grand_total),
            'payment_mode'      => 'cash',
            'payment_status'    => 'unpaid',
        ];
    }

    /**
     * One invoice item → one purchase line, priced exactly as the purchase
     * screen would price the vendor invoice in front of it.
     *
     * @return array{0: array, 1: float, 2: float} [line, base*qty, tax total]
     */
    private function buildPurchaseLine(InvoiceItem $item, bool $isGstBilled, bool $vendorRegistered): array
    {
        $qty = max(1, (int) $item->quantity);

        if (! $item->stock_unit_id && ! $item->stock_batch_id) {
            throw ValidationException::withMessages([
                'lines' => 'A transferred sale line has no stock behind it and cannot be received into the target store.',
            ]);
        }

        $isSerialized = (bool) $item->stock_unit_id;
        $unit = $item->stockUnit;
        $batch = $item->stockBatch;

        // The stock row behind the invoice item must still exist — without
        // it there is nothing faithful to receive into the target store.
        if (($isSerialized && ! $unit) || (! $isSerialized && ! $batch)) {
            throw ValidationException::withMessages([
                'lines' => 'A transferred sale line is missing its stock record and cannot be received into the target store.',
            ]);
        }

        $condition = strtoupper(trim((string) ($isSerialized
            ? ($unit?->device_condition ?? 'NEW')
            : ($batch?->product_condition ?? 'NEW'))));
        if ($condition === '') {
            $condition = 'NEW';
        }

        // evalLineMargin (target side): not GST-billed → false; vendor
        // unregistered → true; registered → everything except NEW.
        $isMargin = $isGstBilled && (! $vendorRegistered || $condition !== 'NEW');

        // The price the target store pays, per unit, net of the line
        // discount — the sale's line_total is authoritative.
        $grossUnit = $this->r2($item->unit_price);
        $netUnit = $this->r2(((float) $item->line_total) / $qty);
        $taxPct = (float) $item->tax_pct;

        // evalLineCost: tax applies only on a GST-billed purchase from a
        // registered vendor, on a non-margin line. GST on the vendor's
        // invoice is inclusive, so base is backed out of the net price.
        $taxApplies = $isGstBilled && $vendorRegistered && ! $isMargin && $taxPct > 0;
        if ($taxApplies) {
            $baseUnit = $this->r2($netUnit / (1 + $taxPct / 100));
            $taxUnit = $this->r2($netUnit - $baseUnit);
            $landedUnit = $netUnit;
            $taxType = 'inclusive';
            $lineTaxPct = $taxPct;
        } else {
            $baseUnit = $netUnit;
            $taxUnit = 0.0;
            $landedUnit = $netUnit;
            $taxType = 'exclusive';
            $lineTaxPct = 0.0;
        }

        $line = [
            'is_serialized'      => $isSerialized,
            'product_variant_id' => $item->product_variant_id ? (int) $item->product_variant_id : null,
            // Invoice items carry no name for stock lines (the POS sends
            // null there) — the name lives on the sold stock row itself.
            'manual_item_name'   => $item->manual_item_name ?? $unit?->manual_item_name ?? $batch?->manual_item_name,
            'ordered_qty'        => $qty,
            'unit_cost'          => $grossUnit,
            'tax_type'           => $taxType,
            'tax_pct'            => $lineTaxPct,
            'is_margin_scheme'   => $isMargin,
            'base_cost'          => $baseUnit,
            'landed_cost'        => $landedUnit,
            'tax_amount'         => $this->r2($taxUnit * $qty),
            'discount_amount'    => $this->r2($item->discount_amount),
            'line_total'         => $this->r2($landedUnit * $qty),
            'condition_code'     => $condition,
            'overall_health'     => $isSerialized ? $unit?->overall_health : $batch?->overall_health,
            'remaining_warranty' => $isSerialized ? null : $batch?->remaining_warranty,
            'wholesale_price'    => $isSerialized ? $unit?->wholesale_price : $batch?->wholesale_price,
            'selling_price'      => $isSerialized ? $unit?->selling_price : $batch?->selling_price,
            'units'              => [],
        ];

        if ($isSerialized && $unit) {
            [$warrantyMode, $warrantyValue] = $this->warrantyFor($unit);
            $line['units'][] = [
                'imei1'                 => $unit->imei1,
                'imei2'                 => $unit->imei2,
                'serial_number'         => $unit->serial_number,
                'device_condition_code' => $condition,
                'overall_health'        => $unit->overall_health,
                'battery_health_pct'    => $unit->deviceHealth?->battery_health_pct,
                'warranty_mode'         => $warrantyMode,
                'warranty_value'        => $warrantyValue,
                'unit_base_cost'        => $baseUnit,
                'unit_landed_cost'      => $landedUnit,
                'wholesale_price'       => $unit->wholesale_price,
                'selling_price'         => $unit->selling_price,
                'is_margin_scheme'      => $isMargin,
            ];
        }

        return [$line, $this->r2($baseUnit * $qty), $this->r2($taxUnit * $qty)];
    }

    /**
     * Replay the sale's recorded payment splits as supplier payments on the
     * target purchase, one SupplierPaymentService call per split so each
     * mode posts its own journal (Dr AP / Cr mode account) with its own
     * reference — the same rows the target store would have created by
     * paying the bill manually.
     */
    private function mirrorPayments(Store $targetStore, User $user, Invoice $invoice, PurchaseOrder $purchase, string $transferNumber, ?string $idempotencyKeyPrefix = null): void
    {
        $modes = [];
        $splitIndex = 0;
        foreach ($invoice->payments as $payment) {
            $amount = $this->r2($payment->amount);
            if ($amount <= 0) {
                continue;
            }
            $mode = $this->supplierPaymentMode((string) $payment->payment_mode);
            $modes[$mode] = true;

            $this->supplierPayments->recordPayment($targetStore, $user, [
                'purchase_order_id' => $purchase->uuid,
                'amount'            => $amount,
                'payment_mode'      => $mode,
                'paid_at'           => $invoice->invoice_date->toDateString(),
                'txn_reference'     => $payment->reference,
                'notes'             => "Stock transfer {$transferNumber} — settlement of sale {$invoice->invoice_number}.",
                // Set on transfer edits so a retried edit replays its own
                // settlement instead of paying twice. Create passes null.
                'idempotency_key'   => $idempotencyKeyPrefix !== null ? $idempotencyKeyPrefix . '-' . $splitIndex : null,
            ]);
            $splitIndex++;
        }

        if ($modes !== []) {
            // Display cache only (mirrors how a create-time payment stores
            // its mode): the single mode when there is one, else 'split'.
            $purchase->refresh();
            $purchase->update([
                'payment_mode' => count($modes) === 1 ? (string) array_key_first($modes) : 'split',
            ]);
        }
    }

    /** Supplier-payment modes are a subset of sale split modes. */
    private function supplierPaymentMode(string $mode): string
    {
        return match (strtolower($mode)) {
            'card', 'credit_card', 'debit_card' => 'card',
            'bank' => 'bank',
            'neft', 'rtgs', 'imps', 'cheque', 'upi', 'cash' => strtolower($mode),
            default => 'bank',
        };
    }

    /** Same test the purchase screen uses: a GSTIN counts as registered at 15 chars. */
    private function isRegisteredGstin(?string $gstin): bool
    {
        $gstin = trim((string) $gstin);

        return $gstin !== '' && mb_strlen($gstin) >= 15;
    }

    /**
     * Warranty mapping for a transferred unit, in the sale serializer's
     * priority: remaining duration text first, then activation, then expiry.
     *
     * @return array{0: ?string, 1: ?string} [warranty_mode, warranty_value]
     */
    private function warrantyFor(StockUnit $unit): array
    {
        if ($unit->remaining_warranty) {
            return ['D', $unit->remaining_warranty];
        }
        if ($unit->activation_date) {
            return ['A', $unit->activation_date->toDateString()];
        }
        if ($unit->warranty_expiry_date) {
            return ['E', $unit->warranty_expiry_date->toDateString()];
        }

        return [null, null];
    }

    /**
     * Atomic per-source-store TRF numbering — same reservation pattern as
     * debit notes (the row lock is held until the outer transaction ends).
     */
    private function reserveTransferNumber(int $storeId): string
    {
        DB::statement(
            'INSERT INTO stock_transfer_number_sequences (store_id, next_number)
             VALUES (?, 2)
             ON DUPLICATE KEY UPDATE next_number = next_number + 1',
            [$storeId]
        );

        $next = (int) DB::table('stock_transfer_number_sequences')
            ->where('store_id', $storeId)
            ->value('next_number');

        return 'TRF-' . $storeId . '-' . str_pad((string) ($next - 1), 6, '0', STR_PAD_LEFT);
    }

    private function r2(float|int|string|null $n): float
    {
        return round((float) $n + 1e-10, 2);
    }
}

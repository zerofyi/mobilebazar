<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\PurchaseOrder;
use App\Models\StockTransfer;
use App\Models\StockUnit;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
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
    private function mirrorPayments(Store $targetStore, User $user, Invoice $invoice, PurchaseOrder $purchase, string $transferNumber): void
    {
        $modes = [];
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
            ]);
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

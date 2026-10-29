<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PurchaseOrder;
use App\Models\Store;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Buyback: a customer sells their old device AND buys a new one in a single
 * atomic transaction.
 *
 * Two documents are created together:
 *   1. A purchase (bill_type 'pv' — the customer is an unregistered
 *      individual) that brings the old device into stock. In a
 *      GST-registered store the purchase is GST-billed under the margin
 *      scheme, exactly as the purchase screen's rules decide for an
 *      unregistered vendor — so when the device is resold, GST is charged
 *      only on the margin, not the full price.
 *   2. A sale for the new device(s), with the buyback value as a locked
 *      payment split (mode 'buyback') linked to the purchase bill.
 *
 * Net settlement: the customer pays sale_total − buyback_value via the sale's
 * other payment splits. The sale's buyback split debits the purchase payable
 * (2010), so the purchase is fully settled — no dangling dues.
 *
 * Atomicity: both documents are created inside one outer transaction (the
 * inner service transactions become savepoints). If the sale fails, the
 * purchase rolls back too — never a half-buyback.
 */
final class BuybackService
{
    public function __construct(
        private readonly PurchaseService $purchases,
        private readonly SaleService $sales,
    ) {}

    /**
     * @param array $saleData    validated sale payload (StoreSaleRequest shape)
     * @param array $buybackData {customer_id, product_variant_id?, manual_item_name?, imei1?, imei2?, serial_number?, device_condition, agreed_value, notes?}
     * @return array{invoice: Invoice, purchase: PurchaseOrder}
     */
    public function process(Store $store, User $user, array $saleData, array $buybackData): array
    {
        $agreedValue = round((float) ($buybackData['agreed_value'] ?? 0), 2);
        if ($agreedValue <= 0) {
            throw ValidationException::withMessages(['buyback.agreed_value' => 'The buyback value must be positive.']);
        }

        // The buyback value can never exceed the sale total — the customer
        // can't walk away with cash from this flow (that's a plain purchase).
        $saleTotal = (float) ($saleData['grand_total'] ?? 0);
        if ($agreedValue - $saleTotal > 0.011) {
            throw ValidationException::withMessages([
                'buyback.agreed_value' => 'Buyback value cannot exceed the sale total. For a cash payout, record a separate purchase.',
            ]);
        }

        return DB::transaction(function () use ($store, $user, $saleData, $buybackData, $agreedValue) {
            $key = (string) ($saleData['idempotency_key'] ?? Str::uuid()->toString());

            // Idempotency across the pair.
            if ($existing = Invoice::where('store_id', $store->id)->where('idempotency_key', $key)->first()) {
                $purchase = PurchaseOrder::where('store_id', $store->id)
                    ->where('idempotency_key', 'buyback-' . $key)
                    ->first();

                return ['invoice' => $existing, 'purchase' => $purchase];
            }

            // 1. The purchase: old device into stock, customer as vendor.
            $purchase = $this->purchases->processPurchase($store, $user, $this->buildPurchaseData($store, $saleData, $buybackData, $key));

            // 2. The sale: the frontend already injected the locked buyback
            //    split (mode 'buyback', amount = agreed value) so the cashier
            //    sees the net payable live. Link it to the purchase bill here.
            $payments = $saleData['payments'] ?? [];
            $found = false;
            foreach ($payments as &$p) {
                if (strtolower((string) ($p['mode'] ?? '')) === 'buyback') {
                    if (abs((float) ($p['amount'] ?? 0) - $agreedValue) > 0.011) {
                        throw ValidationException::withMessages([
                            'buyback.agreed_value' => 'Buyback split amount does not match the agreed value.',
                        ]);
                    }
                    $p['reference'] = $purchase->po_number;
                    $p['purchase_order_id'] = $purchase->id;
                    $found = true;
                }
            }
            unset($p);
            if (! $found) {
                throw ValidationException::withMessages([
                    'buyback' => 'The sale must include the buyback payment split.',
                ]);
            }
            $saleData['payments'] = array_values($payments);

            $invoice = $this->sales->createSale($store, $user, $saleData);

            // 3. The purchase payable is settled by the sale's buyback split
            //    (Dr 2010 in the sale journal). Mark it paid for reporting.
            $purchase->update([
                'paid_amount'    => $purchase->grand_total,
                'due_amount'     => 0,
                'payment_status' => 'paid',
                'payment_mode'   => 'buyback',
            ]);

            // Payment history: the settlement is real money movement, so
            // the purchase carries a payments row like any supplier
            // payment — mode 'buyback', reference = the sale invoice. No
            // journal here: the sale's journal already posted the Dr 2010
            // that settles this payable.
            Payment::create([
                'payable_type'  => PurchaseOrder::class,
                'payable_id'    => $purchase->id,
                'payer_type'    => $purchase->vendor_type,
                'payer_id'      => $purchase->vendor_id,
                'store_id'      => $store->id,
                'payment_mode'  => 'buyback',
                'amount'        => $purchase->grand_total,
                'txn_reference' => $invoice->invoice_number,
                'status'        => 'completed',
                'paid_at'       => $invoice->invoice_date,
                'created_by'    => $user->id,
            ]);

            Log::info('Buyback completed', [
                'store_id' => $store->id,
                'invoice_id' => $invoice->id,
                'purchase_id' => $purchase->id,
                'buyback_value' => $agreedValue,
            ]);

            return ['invoice' => $invoice, 'purchase' => $purchase];
        });
    }

    /**
     * Build the purchase payload for the old device. bill_type 'pv':
     * the customer is an unregistered individual, so there is no ITC —
     * but in a GST-registered store the purchase is still GST-billed
     * under the margin scheme (the purchase engine's own rule for an
     * unregistered vendor), which is what makes the device's resale
     * taxable only on its margin.
     */
    private function buildPurchaseData(Store $store, array $saleData, array $buybackData, string $key): array
    {
        $agreedValue = round((float) $buybackData['agreed_value'], 2);
        $isGstBilled = ! empty($store->gstin);

        return [
            'idempotency_key' => 'buyback-' . $key,
            'party_type'      => 'customer',
            'party_id'        => (int) $buybackData['customer_id'],
            'bill_type'       => 'pv',
            'type'            => 'direct',
            'is_gst_billed'   => $isGstBilled,
            'is_intra_state'  => true,
            'order_date'      => $saleData['invoice_date'] ?? $store->businessToday(),
            'is_draft'        => false,
            'vendor_invoice_no' => null,
            'notes'           => 'Buyback — ' . ($buybackData['notes'] ?? ''),
            'lines'           => [[
                'is_serialized'    => true,
                'product_variant_id' => ! empty($buybackData['product_variant_id']) ? (int) $buybackData['product_variant_id'] : null,
                'manual_item_name'   => $buybackData['manual_item_name'] ?? null,
                'unit_cost'          => $agreedValue,
                'tax_type'           => 'exclusive',
                'tax_pct'            => 0,
                'is_margin_scheme'   => $isGstBilled,
                'base_cost'          => $agreedValue,
                'landed_cost'        => $agreedValue,
                'tax_amount'         => 0,
                'discount_amount'    => 0,
                'line_total'         => $agreedValue,
                'units'              => [[
                    'imei1'                 => $buybackData['imei1'] ?? null,
                    'imei2'                 => $buybackData['imei2'] ?? null,
                    'serial_number'         => $buybackData['serial_number'] ?? null,
                    'device_condition_code' => strtoupper($buybackData['device_condition'] ?? 'USED'),
                    'unit_base_cost'        => $agreedValue,
                    'unit_landed_cost'      => $agreedValue,
                ]],
            ]],
            // Money: the purchase is "paid" via the sale, not cash.
            'subtotal'      => $agreedValue,
            'tax_amount'    => 0,
            'grand_total'   => $agreedValue,
            'paid_amount'   => 0,
            'due_amount'    => $agreedValue,
            'payment_mode'  => 'cash',
            'payment_status'=> 'unpaid',
        ];
    }
}

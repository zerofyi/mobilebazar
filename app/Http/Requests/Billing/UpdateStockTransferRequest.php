<?php

declare(strict_types=1);

namespace App\Http\Requests\Billing;

/**
 * Validates a stock-transfer EDIT submission.
 *
 * The payload is the same POS sale payload as create (the transfer edit
 * re-posts the sale half through SaleService::updateSale), so every rule
 * of StoreStockTransferRequest applies unchanged — supplier party,
 * round-off 0, no buyback splits, no manual lines. This subclass adds
 * only the PIN gate field, mirroring UpdateSaleRequest.
 */
class UpdateStockTransferRequest extends StoreStockTransferRequest
{
    public function rules(): array
    {
        return array_merge(parent::rules(), [
            'security_pin' => ['required', 'string'],
        ]);
    }
}

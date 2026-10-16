<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\CreditNote;
use App\Models\Invoice;
use App\Services\CreditNoteService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sales returns (credit notes).
 *
 * A return is issued against a posted sale. The sale itself is never edited
 * or deleted for a return — the credit note restores stock, reverses
 * revenue/tax/COGS, and refunds cash or adjusts dues.
 */
class CreditNoteController extends Controller
{
    public function __construct(private readonly CreditNoteService $creditNotes) {}

    public function index(): Response
    {
        $store = $this->activeStore();

        $notes = CreditNote::with(['invoice:id,invoice_number', 'customer:id,name'])
            ->where('store_id', $store->id)
            ->latest('credit_note_date')
            ->latest('id')
            ->paginate(20);

        return Inertia::render('App/CreditNotes/Index', [
            'notes' => $notes,
        ]);
    }

    /**
     * Return form for a sale: shows each line with its returnable quantity.
     */
    public function create(string $sale): Response
    {
        $store = $this->activeStore();

        $invoice = Invoice::with([
            'items.productVariant:id,product_id,variant_name,sku',
            'items.productVariant.product:id,name',
            'items.stockUnit:id,imei1,serial_number,status',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $sale)
            ->firstOrFail();

        // Already-returned qty per line.
        $returned = \DB::table('credit_note_items')
            ->join('credit_notes', 'credit_notes.id', '=', 'credit_note_items.credit_note_id')
            ->where('credit_notes.invoice_id', $invoice->id)
            ->where('credit_notes.status', 'issued')
            ->groupBy('credit_note_items.invoice_item_id')
            ->pluck(\DB::raw('SUM(credit_note_items.quantity)'), 'credit_note_items.invoice_item_id')
            ->all();

        $lines = $invoice->items->map(fn ($item) => [
            'id'               => $item->id,
            'product_name'     => $item->productVariant?->product?->name ?? $item->manual_item_name ?? '—',
            'variant_name'     => $item->productVariant?->variant_name,
            'sku'              => $item->productVariant?->sku,
            'imei1'            => $item->stockUnit?->imei1,
            'serial_number'    => $item->stockUnit?->serial_number,
            'unit_status'      => $item->stockUnit?->status,
            'quantity'         => (int) $item->quantity,
            'returned_quantity'=> (int) ($returned[$item->id] ?? 0),
            'unit_price'       => (float) $item->unit_price,
            'line_total'       => (float) $item->line_total,
        ]);

        return Inertia::render('App/CreditNotes/Create', [
            'invoice' => [
                'uuid'           => $invoice->uuid,
                'invoice_number' => $invoice->invoice_number,
                'invoice_date'   => $invoice->invoice_date->format('Y-m-d'),
                'grand_total'    => (float) $invoice->grand_total,
                'party_name'     => $invoice->party?->name ?? $invoice->party?->company_name ?? '—',
            ],
            'lines' => $lines,
        ]);
    }

    /**
     * Issue the credit note. PIN-gated — money and stock move.
     */
    public function store(Request $request, string $sale): RedirectResponse
    {
        $store = $this->activeStore();
        $user  = Auth::user();

        $data = $request->validate([
            'security_pin'            => ['required', 'string', 'size:6'],
            'items'                   => ['required', 'array', 'min:1', 'max:100'],
            'items.*.invoice_item_id' => ['required', 'integer'],
            'items.*.quantity'        => ['required', 'integer', 'min:1'],
            'reason'                  => ['required', 'string', 'max:255'],
            'refund_mode'             => ['required', Rule::in(['cash', 'adjust'])],
            'credit_note_date'        => ['required', 'date'],
            'notes'                   => ['nullable', 'string', 'max:1000'],
        ]);

        $this->verifySecurityPin($store, $data['security_pin']);

        $invoice = Invoice::where('store_id', $store->id)->where('uuid', $sale)->firstOrFail();
        $data['idempotency_key'] = $request->input('idempotency_key') ?: Str::uuid()->toString();

        try {
            $cn = $this->creditNotes->issue($store, $user, $invoice, $data);
        } catch (ValidationException $e) {
            return back()->withErrors($e->errors())->withInput();
        } catch (\App\Exceptions\AccountingException $e) {
            return back()->withErrors(['items' => $e->getMessage()])->withInput();
        }

        return redirect()
            ->route('app.credit-notes.show', $cn->uuid)
            ->with('success', 'Credit note ' . $cn->credit_note_number . ' issued.');
    }

    public function show(string $note): Response
    {
        $store = $this->activeStore();

        $cn = CreditNote::with([
            'invoice:id,uuid,invoice_number',
            'customer:id,name,phone',
            'items.productVariant:id,variant_name,sku',
            'createdBy:id,name',
        ])
            ->where('store_id', $store->id)
            ->where('uuid', $note)
            ->firstOrFail();

        return Inertia::render('App/CreditNotes/Show', [
            'note' => [
                'uuid'               => $cn->uuid,
                'credit_note_number' => $cn->credit_note_number,
                'credit_note_date'   => $cn->credit_note_date->format('Y-m-d'),
                'subtotal'           => (float) $cn->subtotal,
                'tax_amount'         => (float) $cn->tax_amount,
                'grand_total'        => (float) $cn->grand_total,
                'reason'             => $cn->reason,
                'status'             => $cn->status,
                'notes'              => $cn->notes,
                'created_by'         => $cn->createdBy?->name,
                'invoice'            => $cn->invoice ? [
                    'uuid'           => $cn->invoice->uuid,
                    'invoice_number' => $cn->invoice->invoice_number,
                ] : null,
                'customer'           => $cn->customer ? [
                    'name'  => $cn->customer->name,
                    'phone' => $cn->customer->phone,
                ] : null,
                'items' => $cn->items->map(fn ($i) => [
                    'product_name' => $i->productVariant?->variant_name ?? $i->manual_item_name ?? '—',
                    'quantity'     => (int) $i->quantity,
                    'unit_price'   => (float) $i->unit_price,
                    'tax_amount'   => (float) $i->tax_amount,
                    'line_total'   => (float) $i->line_total,
                ])->all(),
            ],
        ]);
    }

    private function activeStore()
    {
        $user = Auth::user();
        $user->loadMissing('ownedStore');
        $store = $user->ownedStore;
        abort_unless($store && $store->is_active, 403);

        return $store;
    }

    private function verifySecurityPin($store, ?string $pin): void
    {
        if (empty($store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Set a security PIN for this store first (Store settings → Security PIN).',
            ]);
        }
        if (empty($pin) || ! \Hash::check($pin, $store->security_pin_hash)) {
            throw ValidationException::withMessages([
                'security_pin' => 'Incorrect security PIN.',
            ]);
        }
    }
}

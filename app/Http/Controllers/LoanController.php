<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Http\Requests\StoreLoanRequest;
use App\Models\Financer;
use App\Models\Invoice;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\Store;
use App\Services\LoanScheduleService;
use App\Services\LoanService;
use App\Services\LoanSettings;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\RedirectResponse;

/**
 * Loan section (Inertia pages live under resources/js/pages/Loans/).
 *
 * Conventions:
 *  - the store is always the user's ownedStore; every loan is verified to
 *    belong to it (404 otherwise);
 *  - posted loans are immutable: no edit/update/destroy routes exist;
 *  - corrections to posted financials go through repayments/settlement,
 *    never edits.
 */
class LoanController extends Controller
{
    public function __construct(private readonly LoanService $loans) {}

    private function ownedStore(Request $request): Store
    {
        return $request->user()->ownedStore;
    }

    private function scoped(Loan $loan, Store $store): Loan
    {
        abort_if($loan->store_id !== $store->id, 404);

        return $loan;
    }

    // ── List ─────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $store = $this->ownedStore($request);

        $query = Loan::query()
            ->with('borrower')
            ->where('store_id', $store->id)
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->string('q')->toString(), fn ($q, $q2) => $q->search($q2))
            ->latest('disbursed_date');

        return Inertia::render('Loans/Index', [
            'loans'   => $query->paginate(20)->withQueryString(),
            'filters' => $request->only(['status', 'q']),
            'stats'   => [
                'active_count'    => Loan::where('store_id', $store->id)->active()->count(),
                'active_balance'  => (float) Loan::where('store_id', $store->id)->active()->sum('balance_amount'),
                'overdue_count'   => Loan::where('store_id', $store->id)->active()
                    ->whereHas('schedules', fn ($q) => $q->overdue())->count(),
                'collected_today' => (float) LoanRepayment::where('store_id', $store->id)
                    ->whereDate('paid_at', today())->sum('amount'),
            ],
        ]);
    }

    // ── Create form ──────────────────────────────────────────────────────

    public function create(Request $request): Response
    {
        $store = $this->ownedStore($request);

        $invoice = null;
        if ($request->filled('invoice')) {
            $invoice = Invoice::query()
                ->where('uuid', $request->string('invoice')->toString())
                ->where('store_id', $store->id)
                ->first();
            abort_if(! $invoice, 404);
            abort_if((float) $invoice->due_amount <= 0, 422, 'Invoice has no outstanding due.');
            abort_if($this->hasActiveLoan($invoice), 422, 'Invoice already has an active loan.');
        }

        $slab       = LoanSettings::collectionSlab($store->id);
        $slabDays   = $this->slabDays($slab);

        return Inertia::render('Loans/Create', [
            'invoice'    => $invoice ? $this->invoicePayload($invoice) : null,
            'defaults'   => [
                'interest_rate'   => LoanSettings::interestRate($store->id),
                'collection_slab' => $slab,
                'processing_fee'  => LoanSettings::processingFee($store->id),
                'prefix'          => LoanSettings::prefix($store->id),
                'allowed_emi_days' => $slabDays,
                'primary_emi_day'  => $slabDays[0] ?? 1,
            ],
            'financers' => Financer::query()
                ->where('store_id', $store->id)
                ->where('is_active', true)
                ->orderBy('name')
                ->get(['id', 'name', 'type']),
        ]);
    }

    /**
     * Invoice lookup for the loan-create loader.
     * Accepts the invoice `identity` (barcode) or `invoice_number` —
     * never the uuid. Store-scoped, JSON only (used via fetch).
     */
    public function lookupInvoice(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->ownedStore($request);
        $q     = trim((string) $request->query('q', ''));

        if ($q === '') {
            return response()->json(['message' => 'Enter an invoice number or barcode.'], 422);
        }

        $invoice = Invoice::query()
            ->where('store_id', $store->id)
            ->where(fn ($w) => $w->where('identity', $q)->orWhere('invoice_number', $q))
            ->first();

        if (! $invoice) {
            return response()->json(['message' => 'No invoice found for "' . $q . '".'], 404);
        }

        if ((float) $invoice->due_amount <= 0) {
            return response()->json(['message' => 'Invoice ' . $invoice->invoice_number . ' has no outstanding due.'], 422);
        }

        if ($this->hasActiveLoan($invoice)) {
            return response()->json(['message' => 'Invoice ' . $invoice->invoice_number . ' already has an active loan.'], 422);
        }

        return response()->json(['invoice' => $this->invoicePayload($invoice)]);
    }

    private function hasActiveLoan(Invoice $invoice): bool
    {
        return Loan::query()
            ->where('invoice_id', $invoice->id)
            ->where('status', Loan::STATUS_ACTIVE)
            ->exists();
    }

    /**
     * Parse a collection slab like "1,10,20" into sorted day numbers.
     *
     * @return list<int>
     */
    private function slabDays(string $slab): array
    {
        $days = [];
        foreach (explode(',', $slab) as $part) {
            $d = (int) trim($part);
            if ($d >= 1 && $d <= 28) {
                $days[] = $d;
            }
        }
        $days = array_values(array_unique($days));
        sort($days);

        return $days === [] ? [1] : $days;
    }

    /**
     * Full invoice payload for loan creation: invoice + items (device
     * identifiers) + the borrower party with identity fields, morph
     * address and current HasAssets assets (with URLs).
     *
     * @return array<string, mixed>
     */
    private function invoicePayload(Invoice $invoice): array
    {
        $invoice->loadMissing(['items.productVariant.product', 'items.stockUnit', 'party']);

        $partyPayload = null;
        $party        = $invoice->party;

        if ($party instanceof \App\Models\Customer) {
            $party->loadMissing(['address', 'assets']);
            $assetsByType = [];
            foreach ($party->assets()->orderByDesc('id')->get() as $asset) {
                // Latest asset per type wins = the customer's CURRENT asset.
                $assetsByType[$asset->type] ??= [
                    'id'  => $asset->id,
                    'url' => $asset->url,
                ];
            }
            $partyPayload = [
                'kind'            => 'customer',
                'id'              => $party->id,
                'name'            => $party->name,
                'care_of'         => $party->care_of,
                'phone_primary'   => $party->phone_primary,
                'phone_secondary' => $party->phone_secondary,
                'aadhaar_number'  => $party->aadhaar_number,
                'pan_number'      => $party->pan_number,
                'voter_number'    => $party->voter_number,
                'address'         => $party->address ? $this->addressPayload($party->address) : null,
                'assets'          => $assetsByType,
            ];
        } elseif ($party instanceof \App\Models\Supplier) {
            $party->loadMissing(['address']);
            $partyPayload = [
                'kind'    => 'supplier',
                'id'      => $party->id,
                'name'    => $party->company_name ?? $party->name,
                'phone'   => $party->phone_primary ?? $party->phone ?? null,
                'address' => $party->address ? $this->addressPayload($party->address) : null,
            ];
        }

        $items = [];
        foreach ($invoice->items as $item) {
            $unit = $item->stockUnit;
            $items[] = [
                'label'         => $item->manual_item_name
                    ?? $item->productVariant?->product?->name
                    ?? $item->productVariant?->name
                    ?? 'Item',
                'imei1'         => $unit?->imei1,
                'imei2'         => $unit?->imei2,
                'serial_number' => $unit?->serial_number,
                'quantity'      => (int) $item->quantity,
                'unit_price'    => (float) $item->unit_price,
                'line_total'    => (float) $item->line_total,
            ];
        }

        return [
            'id'             => $invoice->id,
            'uuid'           => $invoice->uuid,
            'identity'       => $invoice->identity,
            'invoice_number' => $invoice->invoice_number,
            'invoice_date'   => $invoice->invoice_date?->toDateString(),
            'grand_total'    => (float) $invoice->grand_total,
            'due_amount'     => (float) $invoice->due_amount,
            'party'          => $partyPayload,
            'items'          => $items,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function addressPayload(\App\Models\Address $address): array
    {
        return [
            'line1'           => $address->line1,
            'line2'           => $address->line2,
            'village_or_area' => $address->village_or_area,
            'post_office'     => $address->post_office,
            'police_station'  => $address->police_station,
            'city'            => $address->city,
            'district'        => $address->district,
            'state'           => $address->state,
            'postal_code'     => $address->postal_code,
        ];
    }

    /**
     * Live schedule preview — same math the disbursal uses.
     */
    public function preview(Request $request): \Illuminate\Http\JsonResponse
    {
        $store = $this->ownedStore($request);

        $calc = LoanScheduleService::forStore($store->id, [
            'principal'        => max(0.0, (float) $request->input('principal_amount', 0)),
            'down_payment'     => max(0.0, (float) $request->input('down_payment', 0)),
            'interest_rate'    => $request->input('interest_rate'),
            'tenure_months'    => max(1, (int) $request->input('tenure_months', 1)),
            'processing_fee'   => $request->input('processing_fee'),
            'file_charge_mode' => $request->input('file_charge_mode', 'upfront'),
            'disbursed_date'   => $request->input('disbursed_date', today()->toDateString()),
            'first_emi_date'   => $request->input('first_emi_date'),
            'collection_slab'  => $request->input('collection_slab'),
        ]);

        return response()->json($calc);
    }

    // ── Disbursal ─────────────────────────────────────────────────────────

    public function store(StoreLoanRequest $request): RedirectResponse
    {
        $store = $this->ownedStore($request);

        $loan = $this->loans->createLoan($store, $request->user(), $request->validated());

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Loan ' . $loan->loan_number . ' disbursed.');
    }

    // ── Detail ───────────────────────────────────────────────────────────

    public function show(Request $request, Loan $loan): Response
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));
        $loan->load([
            'borrower', 'invoice', 'financer', 'assignedAgent',
            'schedules' => fn ($q) => $q->orderBy('installment_no'),
            'repayments' => fn ($q) => $q->with('collectedBy')->latest('paid_at'),
            'guarantors', 'agreement', 'kycDocuments.asset',
            'collectionVisits' => fn ($q) => $q->with('agent')->latest('visited_at'),
        ]);

        return Inertia::render('Loans/Show', [
            'loan' => $loan,
        ]);
    }

    // ── Early settlement ─────────────────────────────────────────────────

    public function settle(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        $validated = $request->validate([
            'payment_mode' => ['required', 'in:cash,upi,bank,card,neft,cheque'],
            'notes'        => ['nullable', 'string', 'max:1000'],
        ]);

        $repayment = $this->loans->settleLoan(
            $this->ownedStore($request), $request->user(), $loan,
            $validated['payment_mode'], $validated['notes'] ?? null,
        );

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Loan settled. Receipt ' . $repayment->receipt_number . '.');
    }

    // ── Default ──────────────────────────────────────────────────────────

    public function markDefault(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        $this->loans->markDefaulted($loan, $request->user());

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Loan marked as defaulted.');
    }

    // ── Agreement ────────────────────────────────────────────────────────

    public function agreement(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        $validated = $request->validate([
            'terms_and_conditions' => ['required', 'string', 'max:20000'],
        ]);

        $agreement = $loan->agreement()->firstOrCreate(['loan_id' => $loan->id], [
            'agreement_number' => 'AG-' . $loan->loan_number,
            'template_name'    => 'standard_device_financing',
        ]);
        $agreement->update(['terms_and_conditions' => $validated['terms_and_conditions']]);

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Agreement updated.');
    }

    public function upload(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        $validated = $request->validate([
            'signed_document' => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        $path = $request->file('signed_document')->store('loan-agreements', 'public');

        $agreement = $loan->agreement()->firstOrCreate(['loan_id' => $loan->id], [
            'agreement_number' => 'AG-' . $loan->loan_number,
            'template_name'    => 'standard_device_financing',
        ]);
        $agreement->update([
            'signed_document_path' => $path,
            'signed_at'            => now(),
        ]);

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Signed agreement uploaded.');
    }

    // ── Collection visits ────────────────────────────────────────────────

    public function logVisit(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        abort_unless(
            in_array($loan->status, [Loan::STATUS_ACTIVE, Loan::STATUS_DEFAULTED], true),
            422,
            'Visits can only be logged on active or defaulted loans.'
        );

        $validated = $request->validate([
            'outcome'          => ['required', 'in:promised_to_pay,paid_partially,not_available,refused,address_changed,other'],
            'visited_at'       => ['nullable', 'date'],
            'amount_collected' => ['nullable', 'numeric', 'min:0'],
            'notes'            => ['nullable', 'string', 'max:2000'],
        ]);

        $loan->collectionVisits()->create([
            'agent_id'         => $request->user()->id,
            'outcome'          => $validated['outcome'],
            'visited_at'       => $validated['visited_at'] ?? now(),
            'amount_collected' => $validated['amount_collected'] ?? 0,
            'notes'            => $validated['notes'] ?? null,
        ]);

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'Collection visit logged.');
    }

    // ── KYC documents ────────────────────────────────────────────────────

    public function uploadKyc(Request $request, Loan $loan): RedirectResponse
    {
        $loan = $this->scoped($loan, $this->ownedStore($request));

        $validated = $request->validate([
            'document_type'   => ['required', 'in:aadhaar,pan,voter_id,driving_licence,photo,other'],
            'document_number' => ['nullable', 'string', 'max:100'],
            'document'        => ['required', 'file', 'mimes:pdf,jpg,jpeg,png', 'max:10240'],
        ]);

        // All images go through the centralized HasAssets media pipeline.
        $kyc = $loan->kycDocuments()->create([
            'document_type'   => $validated['document_type'],
            'document_number' => $validated['document_number'] ?? null,
        ]);

        $asset = $kyc->uploadAsset(
            $request->file('document'),
            'loan-' . $loan->loan_number,
            'loans/kyc',
            $validated['document_type'],
            ['thumb'],
            uploadedBy: $request->user()->id,
        );

        $kyc->update(['asset_id' => $asset->id]);

        return redirect()
            ->route('app.loans.show', $loan)
            ->with('success', 'KYC document uploaded.');
    }
}

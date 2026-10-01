<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\SummaryDelta;
use App\Models\Agreement;
use App\Models\Customer;
use App\Models\Guarantor;
use App\Models\Invoice;
use App\Models\Loan;
use App\Models\LoanRepayment;
use App\Models\LoanSchedule;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use App\Services\Accounting\LoanJournal;
use App\Services\Summary\SummaryDeltaFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\UnprocessableEntityHttpException;

/**
 * Loan lifecycle: disbursal, EMI collection, settlement, default.
 *
 * Design rules (mirror SaleService):
 *  - one DB transaction per operation, retried 3x on deadlock;
 *  - journal + summaries are posted LAST, inside the same transaction, so
 *    money, ledger and summaries roll back together;
 *  - schedule math comes ONLY from LoanScheduleService (single source of
 *    truth shared with the preview endpoint);
 *  - one active loan per invoice: the invoice row is locked up-front, so two
 *    concurrent creates for the same invoice serialize; a retry finds the
 *    existing active loan and returns it (replay-safe, no duplicates).
 *  - the invoice itself is NEVER mutated by loan operations (decision D).
 */
final class LoanService
{
    public function __construct(
        private readonly LoanJournal $journal,
        private readonly SummaryService $summaries,
    ) {}

    /*
    |----------------------------------------------------------------------
    | Disbursal
    |----------------------------------------------------------------------
    */

    /**
     * @param array $data validated StoreLoanRequest payload
     */
    public function createLoan(Store $store, User $user, array $data): Loan
    {
        return DB::transaction(function () use ($store, $user, $data) {
            // 1. Lock the invoice: serializes concurrent loan creates.
            $invoice = Invoice::query()
                ->where('id', $data['invoice_id'])
                ->where('store_id', $store->id)
                ->lockForUpdate()
                ->firstOrFail();

            if ((float) $invoice->due_amount <= 0) {
                throw new UnprocessableEntityHttpException('The invoice has no outstanding due to finance.');
            }

            // Replay-safe: a retried request returns the existing active loan.
            $existing = Loan::query()
                ->where('invoice_id', $invoice->id)
                ->where('status', Loan::STATUS_ACTIVE)
                ->first();

            if ($existing) {
                return $existing;
            }

            // 2. Borrower must be the invoice's own party.
            $this->assertBorrowerMatchesInvoice($data, $invoice);

            // 2.5 Sync the borrower profile from the loan form: identity
            // fields, morph address, and (for customers) the current photo.
            // Uploads create NEW HasAssets rows — existing assets are never
            // replaced or deleted, so older loans' KYC snapshots stay intact.
            $borrower = $this->syncBorrowerProfile($data);

            // 3. Schedule math (single source of truth).
            $calc = LoanScheduleService::forStore($store->id, [
                'principal'        => (float) $data['principal_amount'],
                'down_payment'     => (float) ($data['down_payment'] ?? 0),
                'interest_rate'    => $data['interest_rate'] ?? null,
                'tenure_months'    => (int) $data['tenure_months'],
                'processing_fee'   => $data['processing_fee'] ?? null,
                'file_charge_mode' => $data['file_charge_mode'],
                'disbursed_date'   => $data['disbursed_date'],
                'first_emi_date'   => $data['first_emi_date'] ?? null,
                'collection_slab'  => $data['collection_slab'] ?? null,
            ]);

            $downPayment   = $calc['down_payment'];
            $fee           = $calc['processing_fee'];
            $spread        = $calc['file_charge_mode'] === 'spread';
            $loanNumber    = $this->nextLoanNumber($store);
            $disbursedDate = $data['disbursed_date'];

            // 4. Loan row.
            $loan = Loan::create([
                'loan_number'        => $loanNumber,
                'store_id'           => $store->id,
                'borrower_type'      => $data['borrower_type'],
                'borrower_id'        => $data['borrower_id'],
                'invoice_id'         => $invoice->id,
                'financer_id'        => $data['financer_id'],
                'principal_amount'   => $calc['principal'],
                'down_payment'       => $downPayment,
                'interest_rate'      => $calc['monthly_rate'],
                'processing_fee'     => $fee,
                'file_charge_mode'   => $calc['file_charge_mode'],
                'total_interest'     => $calc['total_interest'],
                'total_payable'      => $calc['total_payable'],
                // ssm-exact: paid_amount tracks schedule collections only;
                // the down payment is a separate cash event, never part of it.
                'paid_amount'        => 0.00,
                'balance_amount'     => $calc['total_payable'],
                'tenure_months'      => (int) $data['tenure_months'],
                'emi_frequency'      => 'monthly',
                'emi_amount'         => $calc['base_emi'],
                'collection_slab'    => $data['collection_slab'] ?? LoanSettings::collectionSlab($store->id),
                'status'             => Loan::STATUS_ACTIVE,
                'disbursed_date'     => $disbursedDate,
                'first_emi_date'     => $calc['first_emi_date'],
                'assigned_agent_id'  => $data['assigned_agent_id'] ?? null,
                'notes'              => $data['notes'] ?? null,
            ]);

            // 5. Schedule rows (bulk).
            $now  = now();
            $rows = [];
            foreach ($calc['schedule'] as $inst) {
                $rows[] = [
                    'uuid'             => (string) Str::uuid(),
                    'loan_id'          => $loan->id,
                    'installment_no'   => $inst['installment_no'],
                    'due_date'         => $inst['due_date'],
                    'principal_amount' => $inst['principal_amount'],
                    'interest_amount'  => $inst['interest_amount'],
                    'total_due'        => $inst['total_due'],
                    'paid_amount'      => 0.00,
                    'penalty_amount'   => 0.00,
                    'status'           => 'pending',
                    'created_at'       => $now,
                    'updated_at'       => $now,
                ];
            }
            LoanSchedule::insert($rows);

            // 5.5 Identity assets → KYC documents for THIS loan.
            // Every asset on file (newly uploaded or already current) gets a
            // KYC row pointing at its asset id. Assets are never deleted
            // until the loan itself is deleted, so past loans keep their
            // exact document snapshots even when the customer later uploads
            // newer photos for a new loan.
            $this->attachIdentityAssets($loan, $borrower, $data, $user);

            // 6. Guarantors (optional, v1).
            foreach ($data['guarantors'] ?? [] as $g) {
                Guarantor::create([
                    'loan_id'        => $loan->id,
                    'name'           => $g['name'],
                    'relation'       => $g['relation'] ?? null,
                    'phone'          => $g['phone'],
                    'aadhaar_number' => $g['aadhaar_number'] ?? null,
                    'pan_number'     => $g['pan_number'] ?? null,
                ]);
            }

            // 7. Agreement shell (terms rendered/signed later).
            Agreement::create([
                'loan_id'              => $loan->id,
                'agreement_number'     => 'AG-' . $loanNumber,
                'template_name'        => 'standard_device_financing',
                'terms_and_conditions' => self::defaultTerms($loan),
            ]);

            // 8. Down payment → first repayment row + journal + summary.
            if ($downPayment > 0) {
                $repayment = $this->insertRepayment(
                    $store, $user, $loan, null,
                    $downPayment, $downPayment, 0.0, 0.0,
                    $data['down_payment_mode'] ?? 'cash',
                    null, 'Down payment at disbursal',
                );

                $this->journal->postRepayment($repayment, $loan->refresh(), $store, $user);
                $this->summaries->record(SummaryDeltaFactory::forLoanDownPayment(
                    $store->id, $disbursedDate,
                    $data['down_payment_mode'] ?? 'cash', $downPayment,
                ));
            }

            // 9. Disbursal journal + summary LAST.
            $this->journal->postDisbursal($loan, $store, $user, [
                'principal_amount'  => $calc['principal'],
                'down_payment_mode' => $data['down_payment_mode'] ?? 'cash',
                'processing_fee'    => $fee,
                'file_charge_mode'  => $calc['file_charge_mode'],
            ]);

            $this->summaries->record(SummaryDeltaFactory::forLoanDisbursal(
                $store->id,
                $disbursedDate,
                $calc['net_principal'] + ($spread ? $fee : 0.0),
                $spread ? 0.0 : $fee, // upfront fee cash; down payment has its own delta
                $data['down_payment_mode'] ?? 'cash',
            ));

            return $loan->refresh();
        }, 3);
    }

    /*
    |----------------------------------------------------------------------
    | EMI collection
    |----------------------------------------------------------------------
    */

    /**
     * Collect an amount against one installment. Split is interest-first,
     * then penalty, then principal.
     *
     * @param array{amount:float, payment_mode:string, txn_reference?:?string, notes?:?string} $data
     */
    public function collectInstallment(Store $store, User $user, LoanSchedule $schedule, array $data): LoanRepayment
    {
        return DB::transaction(function () use ($store, $user, $schedule, $data) {
            $schedule = LoanSchedule::query()->whereKey($schedule->id)->lockForUpdate()->firstOrFail();
            /** @var Loan $loan */
            $loan = Loan::query()->whereKey($schedule->loan_id)->lockForUpdate()->firstOrFail();

            if (! in_array($loan->status, [Loan::STATUS_ACTIVE, Loan::STATUS_DEFAULTED], true)) {
                throw new UnprocessableEntityHttpException('Collections are allowed only on active or defaulted loans.');
            }

            $amount = round((float) $data['amount'], 2);
            $split  = $this->splitPayment($schedule, $amount);

            if ($amount < 0.01 || $amount > $split['collectible'] + 0.001) {
                throw new UnprocessableEntityHttpException('Amount must be between 0.01 and the outstanding due.');
            }

            $repayment = $this->insertRepayment(
                $store, $user, $loan, $schedule->id,
                $amount, $split['principal'], $split['interest'], $split['penalty'],
                $data['payment_mode'], $data['txn_reference'] ?? null, $data['notes'] ?? null,
            );

            $paidTotal = round((float) $schedule->paid_amount + $amount, 2);
            $schedule->paid_amount = $paidTotal;
            $schedule->status      = $paidTotal >= round((float) $schedule->total_due + (float) $schedule->penalty_amount, 2) - 0.001
                ? 'paid'
                : 'partial';
            if ($schedule->status === 'paid') {
                $schedule->paid_date = today()->toDateString();
            }
            $schedule->save();

            $loan->recordPayment($amount);

            $this->journal->postRepayment($repayment, $loan, $store, $user);
            $this->summaries->record(SummaryDeltaFactory::forLoanRepayment(
                $store->id, today()->toDateString(),
                $data['payment_mode'], $amount,
            ));

            return $repayment;
        }, 3);
    }

    /*
    |----------------------------------------------------------------------
    | Settlement & default
    |----------------------------------------------------------------------
    */

    /**
     * Early settlement: one repayment clears the whole outstanding balance,
     * every schedule is marked paid, loan closes with settled_at.
     */
    public function settleLoan(Store $store, User $user, Loan $loan, string $paymentMode = 'cash', ?string $notes = null): LoanRepayment
    {
        return DB::transaction(function () use ($store, $user, $loan, $paymentMode, $notes) {
            $loan = Loan::query()->whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if (! in_array($loan->status, [Loan::STATUS_ACTIVE, Loan::STATUS_DEFAULTED], true)) {
                throw new UnprocessableEntityHttpException('Only active or defaulted loans can be settled.');
            }

            $outstanding = round((float) $loan->balance_amount, 2);

            $schedules = LoanSchedule::query()
                ->where('loan_id', $loan->id)
                ->where('status', '!=', 'paid')
                ->lockForUpdate()
                ->get();

            // Split the settlement across remaining interest/principal.
            $interestRem = $principalRem = 0.0;
            foreach ($schedules as $s) {
                $paid         = (float) $s->paid_amount;
                $interestPaid = min($paid, (float) $s->interest_amount);
                $interestRem  += (float) $s->interest_amount - $interestPaid;
                $principalRem += (float) $s->total_due - (float) $s->interest_amount
                    - max(0.0, $paid - $interestPaid);
            }
            $interestRem  = round($interestRem, 2);
            $principalRem = round(max(0.0, $outstanding - $interestRem), 2);

            $repayment = $this->insertRepayment(
                $store, $user, $loan, null,
                $outstanding, $principalRem, $interestRem, 0.0,
                $paymentMode, null, $notes ?? 'Early settlement',
            );

            foreach ($schedules as $s) {
                $s->paid_amount = $s->total_due;
                $s->status      = 'paid';
                $s->paid_date   = today()->toDateString();
                $s->save();
            }

            $loan->paid_amount    = $loan->total_payable;
            $loan->balance_amount = 0.00;
            $loan->status         = Loan::STATUS_CLOSED;
            $loan->closed_date    = today()->toDateString();
            $loan->settled_at     = now();
            $loan->save();

            $this->journal->postRepayment($repayment, $loan, $store, $user);
            $this->summaries->record(SummaryDeltaFactory::forLoanRepayment(
                $store->id, today()->toDateString(), $paymentMode, $outstanding,
            ));

            return $repayment;
        }, 3);
    }

    public function markDefaulted(Loan $loan, User $user): Loan
    {
        return DB::transaction(function () use ($loan, $user) {
            $loan = Loan::query()->whereKey($loan->id)->lockForUpdate()->firstOrFail();

            if ($loan->status !== Loan::STATUS_ACTIVE) {
                throw new UnprocessableEntityHttpException('Only active loans can be marked defaulted.');
            }

            $loan->status                         = Loan::STATUS_DEFAULTED;
            $loan->defaulted_at                   = now();
            $loan->outstanding_balance_at_default = $loan->balance_amount;
            $loan->save();

            return $loan;
        }, 3);
    }

    /*
    |----------------------------------------------------------------------
    | Internals
    |----------------------------------------------------------------------
    */

    /** The loan borrower must be the invoice's own party. */
    private function assertBorrowerMatchesInvoice(array $data, Invoice $invoice): void
    {
        $expectedType = $invoice->party_type === 'supplier' ? Supplier::class : Customer::class;

        if ($data['borrower_type'] !== $expectedType || (int) $data['borrower_id'] !== (int) $invoice->party_id) {
            throw new UnprocessableEntityHttpException('The borrower must be the invoice party.');
        }
    }

    /**
     * KYC document slots on the loan form. Key = request file field,
     * type = HasAssets asset type + kyc_documents.document_type,
     * number_from = customer column holding the document number.
     *
     * @var array<string, array{type: string, number_from: string}>
     */
    private const array DOC_SLOTS = [
        'doc_aadhaar_front' => ['type' => 'aadhaar_front', 'number_from' => 'aadhaar_number'],
        'doc_aadhaar_back'  => ['type' => 'aadhaar_back',  'number_from' => 'aadhaar_number'],
        'doc_pan'           => ['type' => 'pan_document',  'number_from' => 'pan_number'],
        'doc_voter_front'   => ['type' => 'voter_front',   'number_from' => 'voter_number'],
        'doc_voter_back'    => ['type' => 'voter_back',    'number_from' => 'voter_number'],
    ];

    /**
     * Update the borrower's identity fields + morph address from the loan
     * form. Customers: full identity card. Suppliers: name/phone only
     * (suppliers carry no photo and no ID numbers on their record).
     */
    private function syncBorrowerProfile(array $data): Model
    {
        $isCustomer = $data['borrower_type'] === Customer::class;

        $borrower = $isCustomer
            ? Customer::query()->whereKey($data['borrower_id'])->firstOrFail()
            : Supplier::query()->whereKey($data['borrower_id'])->firstOrFail();

        if ($isCustomer) {
            $attrs = array_intersect_key(
                $data['customer'] ?? [],
                array_flip(['name', 'care_of', 'phone_primary', 'phone_secondary', 'aadhaar_number', 'pan_number', 'voter_number'])
            );
            foreach (['care_of', 'phone_secondary', 'aadhaar_number', 'pan_number', 'voter_number'] as $nullable) {
                if (($attrs[$nullable] ?? null) === '') {
                    $attrs[$nullable] = null;
                }
            }
            $borrower->update($attrs);
        } else {
            $attrs = [];
            if (!empty($data['supplier']['name'])) {
                $attrs['company_name'] = $data['supplier']['name'];
            }
            if (array_key_exists('phone', $data['supplier'] ?? [])) {
                $attrs['phone'] = $data['supplier']['phone'] === '' ? null : $data['supplier']['phone'];
            }
            if ($attrs !== []) {
                $borrower->update($attrs);
            }
        }

        $address = $data['address'] ?? [];
        if ($address !== []) {
            foreach ($address as $k => $v) {
                if ($v === '') {
                    $address[$k] = null;
                }
            }
            $borrower->address()->updateOrCreate([], $address);
        }

        return $borrower;
    }

    /**
     * Attach identity assets for the loan, all through HasAssets.
     *
     * Customer: new uploads become NEW asset rows on the customer (the
     * customer's "current" assets); unchanged slots reuse the customer's
     * current asset of that type. Each gets a KYC row on the loan.
     * Supplier: suppliers own no assets — uploads attach to the KYC
     * document itself and connect only via kyc_documents.
     */
    private function attachIdentityAssets(Loan $loan, Model $borrower, array $data, User $user): void
    {
        $isCustomer = $borrower instanceof Customer;
        $numbers    = $isCustomer
            ? $borrower->only(['aadhaar_number', 'pan_number', 'voter_number'])
            : [];

        $storeAsset = function (?\Illuminate\Http\UploadedFile $file, string $type, Model $owner, string $slug, string $folder) use ($user): ?Model {
            if ($file) {
                return $owner->uploadAsset($file, $slug, $folder, $type, ['thumb'], uploadedBy: $user->id);
            }

            return $owner->assets()->where('type', $type)->latest('id')->first();
        };

        if ($isCustomer) {
            $photo = $storeAsset($data['photo'] ?? null, 'photo', $borrower, 'customer-' . $borrower->getKey(), 'customers');
            if ($photo) {
                $loan->kycDocuments()->create([
                    'document_type' => 'photo',
                    'asset_id'      => $photo->getKey(),
                ]);
            }
        }

        foreach (self::DOC_SLOTS as $field => $slot) {
            $file = $data[$field] ?? null;

            if ($isCustomer) {
                $asset = $storeAsset($file, $slot['type'], $borrower, 'customer-' . $borrower->getKey(), 'customers');
                if (! $asset) {
                    continue;
                }
                $loan->kycDocuments()->create([
                    'document_type'   => $slot['type'],
                    'document_number' => $numbers[$slot['number_from']] ?? null,
                    'asset_id'        => $asset->getKey(),
                ]);
            } elseif ($file) {
                $kyc   = $loan->kycDocuments()->create(['document_type' => $slot['type']]);
                $asset = $storeAsset($file, $slot['type'], $kyc, 'loan-' . $loan->loan_number, 'loans/kyc');
                $kyc->update(['asset_id' => $asset?->getKey()]);
            }
        }
    }

    /**
     * Split a payment against one schedule: interest first, then penalty,
     * then principal. Returns components + the max collectible amount.
     *
     * @return array{principal:float, interest:float, penalty:float, collectible:float}
     */
    private function splitPayment(LoanSchedule $schedule, float $amount): array
    {
        $paid         = (float) $schedule->paid_amount;
        $interestPaid = min($paid, (float) $schedule->interest_amount);
        $interestRem  = round((float) $schedule->interest_amount - $interestPaid, 2);

        $penaltyPaid = (float) LoanRepayment::query()
            ->where('loan_schedule_id', $schedule->id)
            ->sum('penalty_collected');
        $penaltyRem = round(max(0.0, (float) $schedule->penalty_amount - $penaltyPaid), 2);

        $principalPaid = max(0.0, $paid - $interestPaid);
        $principalRem  = round(
            (float) $schedule->total_due - (float) $schedule->interest_amount - $principalPaid, 2
        );

        $collectible = round($interestRem + $penaltyRem + $principalRem, 2);

        $payInterest = round(min($amount, $interestRem), 2);
        $rest        = round($amount - $payInterest, 2);
        $payPenalty  = round(min($rest, $penaltyRem), 2);
        $payPrincipal = round($rest - $payPenalty, 2);

        return [
            'principal'   => $payPrincipal,
            'interest'    => $payInterest,
            'penalty'     => $payPenalty,
            'collectible' => $collectible,
        ];
    }

    /**
     * Insert one repayment row with an LR receipt number. The caller owns the
     * surrounding transaction.
     */
    private function insertRepayment(
        Store $store,
        User $user,
        Loan $loan,
        ?int $scheduleId,
        float $amount,
        float $principal,
        float $interest,
        float $penalty,
        string $paymentMode,
        ?string $txnReference,
        ?string $notes,
    ): LoanRepayment {
        return LoanRepayment::create([
            'loan_id'             => $loan->id,
            'loan_schedule_id'    => $scheduleId,
            'store_id'            => $store->id,
            'receipt_number'      => $this->nextReceiptNumber($store),
            'amount'              => round($amount, 2),
            'principal_component' => round($principal, 2),
            'interest_component'  => round($interest, 2),
            'penalty_collected'   => round($penalty, 2),
            'payment_mode'        => strtolower($paymentMode),
            'txn_reference'       => $txnReference,
            'collected_by'        => $user->id,
            'shift_id'            => $this->openShiftId($user->id),
            'paid_at'             => now(),
            'notes'               => $notes,
        ]);
    }

    private function nextLoanNumber(Store $store): string
    {
        $seq = DB::table('loan_number_sequences')
            ->where('store_id', $store->id)
            ->lockForUpdate()
            ->first();

        if (! $seq) {
            $next = 1;
            DB::table('loan_number_sequences')->insert([
                'store_id'    => $store->id,
                'next_number' => 2,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        } else {
            $next = (int) $seq->next_number;
            DB::table('loan_number_sequences')
                ->where('store_id', $store->id)
                ->update(['next_number' => $next + 1, 'updated_at' => now()]);
        }

        $prefix = LoanSettings::prefix($store->id);

        return sprintf('%s-%s-%06d', $prefix, $store->code, $next);
    }

    private function nextReceiptNumber(Store $store): string
    {
        $seq = DB::table('loan_receipt_sequences')
            ->where('store_id', $store->id)
            ->lockForUpdate()
            ->first();

        if (! $seq) {
            $next = 1;
            DB::table('loan_receipt_sequences')->insert([
                'store_id'    => $store->id,
                'next_number' => 2,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        } else {
            $next = (int) $seq->next_number;
            DB::table('loan_receipt_sequences')
                ->where('store_id', $store->id)
                ->update(['next_number' => $next + 1, 'updated_at' => now()]);
        }

        return sprintf('LR-%s-%06d', $store->code, $next);
    }

    private function openShiftId(int $userId): ?int
    {
        $id = DB::table('shifts')
            ->where('user_id', $userId)
            ->where('status', 'open')
            ->orderByDesc('id')
            ->value('id');

        return $id ? (int) $id : null;
    }

    private static function defaultTerms(Loan $loan): string
    {
        return implode("\n\n", [
            'DEVICE FINANCING AGREEMENT — ' . $loan->loan_number,
            '1. The borrower agrees to repay the financed amount in monthly installments as per the attached schedule.',
            '2. Interest is charged at a flat monthly rate on the financed principal, as disclosed in this agreement.',
            '3. Late payments may attract penalties as per store policy.',
            '4. The financed device remains hypothecated to the store until the loan is fully repaid.',
            '5. Pre-closure is allowed; settlement is calculated on the outstanding balance.',
        ]);
    }
}

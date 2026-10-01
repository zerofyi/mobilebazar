<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;

/**
 * Device financing loan.
 *
 * Identity: the borrower is a polymorphic party (Customer|Supplier) via
 * borrower_type/borrower_id — NOT customer_id (removed by the base loans
 * migration owned by the store team).
 *
 * Status lifecycle: active → closed (natural, paid in full) | settled
 * (closed early via settle, settled_at set) | defaulted (defaulted_at set,
 * outstanding_balance_at_default snapshotted).
 */
#[Fillable([
    'uuid',
    'loan_number',
    'store_id',
    'borrower_type',
    'borrower_id',
    'invoice_id',
    'financer_id',
    'principal_amount',
    'down_payment',
    'interest_rate',
    'processing_fee',
    'file_charge_mode',
    'total_interest',
    'total_payable',
    'paid_amount',
    'balance_amount',
    'tenure_months',
    'emi_frequency',
    'emi_amount',
    'collection_slab',
    'status',
    'disbursed_date',
    'first_emi_date',
    'closed_date',
    'settled_at',
    'defaulted_at',
    'outstanding_balance_at_default',
    'assigned_agent_id',
    'approved_by',
    'notes',
])]
class Loan extends Model
{
    use HasFactory, HasUuids;

    public const STATUS_ACTIVE    = 'active';
    public const STATUS_CLOSED    = 'closed';
    public const STATUS_DEFAULTED = 'defaulted';

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    /** Loan URLs use the public uuid, never the sequential id. */
    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    protected function casts(): array
    {
        return [
            'principal_amount'               => 'decimal:2',
            'down_payment'                   => 'decimal:2',
            'interest_rate'                  => 'decimal:2',
            'processing_fee'                 => 'decimal:2',
            'total_interest'                 => 'decimal:2',
            'total_payable'                  => 'decimal:2',
            'paid_amount'                    => 'decimal:2',
            'balance_amount'                 => 'decimal:2',
            'outstanding_balance_at_default' => 'decimal:2',
            'tenure_months'                  => 'integer',
            'emi_amount'                     => 'decimal:2',
            'disbursed_date'                 => 'date',
            'first_emi_date'                 => 'date',
            'closed_date'                    => 'date',
            'settled_at'                     => 'datetime',
            'defaulted_at'                   => 'datetime',
        ];
    }

    /*
    |----------------------------------------------------------------------
    | Relations
    |----------------------------------------------------------------------
    */

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    /** Polymorphic borrower: Customer|Supplier. */
    public function borrower(): MorphTo
    {
        return $this->morphTo();
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function financer(): BelongsTo
    {
        return $this->belongsTo(Financer::class);
    }

    public function assignedAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_agent_id');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function guarantors(): HasMany
    {
        return $this->hasMany(Guarantor::class);
    }

    public function schedules(): HasMany
    {
        return $this->hasMany(LoanSchedule::class)->orderBy('installment_no');
    }

    public function repayments(): HasMany
    {
        return $this->hasMany(LoanRepayment::class)->orderBy('paid_at');
    }

    public function collectionVisits(): HasMany
    {
        return $this->hasMany(LoanCollectionVisit::class);
    }

    public function agreement(): HasOne
    {
        return $this->hasOne(Agreement::class);
    }

    public function kycDocuments(): MorphMany
    {
        return $this->morphMany(KycDocument::class, 'documentable');
    }

    /*
    |----------------------------------------------------------------------
    | Scopes
    |----------------------------------------------------------------------
    */

    /** @param \Illuminate\Database\Eloquent\Builder<Loan> $q */
    public function scopeActive($q)
    {
        return $q->where('status', self::STATUS_ACTIVE);
    }

    /** @param \Illuminate\Database\Eloquent\Builder<Loan> $q */
    public function scopeClosed($q)
    {
        return $q->where('status', self::STATUS_CLOSED);
    }

    /** Closed via early settlement (settled_at set). */
    public function scopeSettled($q)
    {
        return $q->where('status', self::STATUS_CLOSED)->whereNotNull('settled_at');
    }

    /** Closed naturally (paid in full, no settlement). */
    public function scopeClosedNaturally($q)
    {
        return $q->where('status', self::STATUS_CLOSED)->whereNull('settled_at');
    }

    /** @param \Illuminate\Database\Eloquent\Builder<Loan> $q */
    public function scopeDefaulted($q)
    {
        return $q->where('status', self::STATUS_DEFAULTED);
    }

    /**
     * Search across loan number, borrower name/phone (both morph types).
     *
     * @param \Illuminate\Database\Eloquent\Builder<Loan> $q
     */
    public function scopeSearch($q, ?string $term)
    {
        $term = trim((string) $term);

        if ($term === '') {
            return $q;
        }

        return $q->where(function ($w) use ($term) {
            $w->where('loan_number', 'like', "%{$term}%")
                ->orWhereHasMorph('borrower', [Customer::class, Supplier::class], function ($b, string $type) use ($term) {
                    // Customer and Supplier do not share name/phone columns:
                    // Customer → name / phone_primary, Supplier → company_name / phone.
                    $nameCol  = $type === Supplier::class ? 'company_name' : 'name';
                    $phoneCol = $type === Supplier::class ? 'phone' : 'phone_primary';

                    $b->where($nameCol, 'like', "%{$term}%")
                        ->orWhere($phoneCol, 'like', "{$term}%");
                });
        });
    }

    /*
    |----------------------------------------------------------------------
    | Domain behavior
    |----------------------------------------------------------------------
    */

    /** One active loan per invoice (decision B). */
    public static function hasActiveLoanForInvoice(int $invoiceId): bool
    {
        return static::query()
            ->where('invoice_id', $invoiceId)
            ->where('status', self::STATUS_ACTIVE)
            ->exists();
    }

    /**
     * Record a collected amount against the loan totals. Auto-closes the loan
     * (natural close) once total_payable is fully collected.
     */
    public function recordPayment(float $amount): void
    {
        $paid  = (float) $this->paid_amount + $amount;
        $total = (float) $this->total_payable;

        $this->paid_amount    = round($paid, 2);
        $this->balance_amount = round(max(0.0, $total - $paid), 2);

        // Paise-exact close check: paid within a paise of the total.
        if ((int) round($paid * 100) >= (int) round($total * 100)) {
            $this->status      = self::STATUS_CLOSED;
            $this->closed_date = today()->toDateString();
        }

        $this->save();
    }

    public function isActive(): bool
    {
        return $this->status === self::STATUS_ACTIVE;
    }

    public function isSettled(): bool
    {
        return $this->status === self::STATUS_CLOSED && $this->settled_at !== null;
    }
}

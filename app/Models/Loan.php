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

#[Fillable([
    'uuid',
    'loan_number',
    'store_id',
    'customer_id',
    'invoice_id',
    'financer_id',
    'principal_amount',
    'down_payment',
    'interest_rate',
    'processing_fee',
    'total_interest',
    'total_payable',
    'paid_amount',
    'balance_amount',
    'tenure_months',
    'emi_frequency',
    'emi_amount',
    'status',
    'disbursed_date',
    'first_emi_date',
    'closed_date',
    'assigned_agent_id',
    'approved_by',
    'notes',
])]
class Loan extends Model
{
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'principal_amount' => 'decimal:2',
            'down_payment' => 'decimal:2',
            'interest_rate' => 'decimal:2',
            'processing_fee' => 'decimal:2',
            'total_interest' => 'decimal:2',
            'total_payable' => 'decimal:2',
            'paid_amount' => 'decimal:2',
            'balance_amount' => 'decimal:2',
            'tenure_months' => 'integer',
            'emi_amount' => 'decimal:2',
            'disbursed_date' => 'date',
            'first_emi_date' => 'date',
            'closed_date' => 'date',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
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
        return $this->hasMany(LoanSchedule::class);
    }

    public function repayments(): HasMany
    {
        return $this->hasMany(LoanRepayment::class);
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
}

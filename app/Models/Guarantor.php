<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'loan_id',
    'name',
    'relation',
    'phone',
    'aadhaar_number',
    'pan_number',
    'address_id',
])]
class Guarantor extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    public function address(): BelongsTo
    {
        return $this->belongsTo(Address::class);
    }

    public function kycDocuments(): MorphMany
    {
        return $this->morphMany(KycDocument::class, 'documentable');
    }
}

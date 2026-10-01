<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Zerofyi\Media\Traits\HasAssets;

#[Fillable([
    'uuid',
    'loan_id',
    'agreement_number',
    'template_name',
    'terms_and_conditions',
    'signed_document_asset_id',
    'signed_document_path',
    'customer_signature_asset_id',
    'signed_at',
    'ip_address',
])]
class Agreement extends Model
{
    use HasFactory, HasUuids, SoftDeletes, HasAssets;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'signed_at' => 'datetime',
            'signed_document_asset_id' => 'integer',
            'customer_signature_asset_id' => 'integer',
        ];
    }

    public function loan(): BelongsTo
    {
        return $this->belongsTo(Loan::class);
    }

    // Explicit relation to the extended Asset model
    public function signedDocument(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'signed_document_asset_id');
    }

    public function customerSignature(): BelongsTo
    {
        return $this->belongsTo(Asset::class, 'customer_signature_asset_id');
    }
}

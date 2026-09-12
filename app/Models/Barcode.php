<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\MorphTo;

#[Fillable([
    'uuid',
    'barcodeable_type',
    'barcodeable_id',
    'code',
    'symbology',
    'is_primary',
])]
class Barcode extends Model
{
    use HasFactory, HasUuids;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    protected function casts(): array
    {
        return [
            'barcodeable_id' => 'integer',
            'is_primary' => 'boolean',
        ];
    }

    public function barcodeable(): MorphTo
    {
        return $this->morphTo();
    }
}

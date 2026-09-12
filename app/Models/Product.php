<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

#[Fillable([
    'uuid',
    'name',
    'slug',
    'description',
    'short_description',
    'category_id',
    'brand_id',
    'tax_category_id',
    'hsn_code',
    'warranty_months',
    'is_active',
    'is_returnable',
    'is_serialized',
    'is_featured',
    'is_trending',
    'is_best_seller',
    'created_by',
])]
class Product extends Model
{
    use HasFactory, HasUuids, SoftDeletes;

    public function uniqueIds(): array
    {
        return ['uuid'];
    }

    public function getRouteKeyName(): string
    {
        return 'uuid';
    }

    protected function casts(): array
    {
        return [
            'category_id' => 'integer',
            'brand_id' => 'integer',
            'tax_category_id' => 'integer',
            'warranty_months' => 'integer',
            'is_active' => 'boolean',
            'is_returnable' => 'boolean',
            'is_serialized' => 'boolean',
            'is_featured' => 'boolean',
            'is_trending' => 'boolean',
            'is_best_seller' => 'boolean',
            'created_by' => 'integer',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class, 'category_id');
    }

    public function brand(): BelongsTo
    {
        return $this->belongsTo(Brand::class, 'brand_id');
    }

    public function taxCategory(): BelongsTo
    {
        return $this->belongsTo(TaxCategory::class, 'tax_category_id');
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class, 'product_id');
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class, 'product_id');
    }
}

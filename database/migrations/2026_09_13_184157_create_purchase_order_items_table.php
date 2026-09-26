<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_order_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('purchase_order_id')->constrained('purchase_orders')->cascadeOnDelete();
            $table->foreignId('product_variant_id')->nullable()->constrained('product_variants')->nullOnDelete();
            $table->string('manual_item_name')->nullable();

            $table->unsignedInteger('ordered_qty')->default(1);
            $table->decimal('unit_cost', 12, 2)->default(0.00); // Input cost entered by user
            $table->enum('tax_type', ['inclusive', 'exclusive'])->default('exclusive');

            // Auto-set TRUE for bill_type == 'pv' or second-hand devices
            $table->boolean('is_margin_scheme')->default(false);

            // Derived Costs
            $table->decimal('base_cost', 12, 2)->default(0.00); // Unit cost excluding tax (Asset Valuation Base)
            $table->decimal('landed_cost', 12, 2)->default(0.00); // Unit cost including tax (Total Out-of-Pocket)
            $table->decimal('tax_pct', 5, 2)->default(0.00); // Tax rate applied
            $table->decimal('tax_amount', 12, 2)->default(0.00); // Total line tax
            $table->decimal('discount_amount', 12, 2)->default(0.00);
            $table->decimal('line_total', 12, 2)->default(0.00);

            $table->softDeletes();
            $table->timestamps();

            $table->index(['purchase_order_id', 'product_variant_id'], 'idx_poi_po_variant');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_order_items');
    }
};

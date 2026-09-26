<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->string('code', 20)->unique();
            $table->string('name');
            $table->string('type')->default('franchise'); // 'own', 'franchise', 'warehouse',
            $table->string('platform')->default('general');

            // Franchise Specifics & Security Override
            $table->string('security_pin_hash')->nullable();

            // Plain-text / External Agreement ID (non-foreignId)
            $table->string('franchise_agreement_id')->nullable()->index();

            $table->string('image_asset_path')->nullable();
            $table->string('logo_asset_path')->nullable();
            $table->string('signature_asset_path')->nullable();

            // Geographic Location & Address
            $table->string('location')->nullable();

            // Contact & Business Compliance
            $table->string('phone', 20)->nullable();
            $table->string('email')->nullable();
            $table->string('gstin', 20)->nullable();

            // Bank Account Settlement Details
            $table->string('bank_name')->nullable();
            $table->string('bank_account_holder_name')->nullable();
            $table->string('bank_account_number')->nullable();
            $table->string('bank_ifsc', 20)->nullable();
            $table->string('bank_upi_id')->nullable();

            // Operational States
            $table->boolean('is_active')->default(true);
            $table->boolean('is_public')->default(true);
            $table->boolean('is_gst_registered')->default(false);
            $table->boolean('is_iws_allowed')->default(false); // IWS = Internal Wholesale System

            // Coordinates & Localization
            $table->decimal('lat', 10, 8)->nullable();
            $table->decimal('lng', 11, 8)->nullable();
            $table->string('timezone', 50)->default('Asia/Kolkata');
            $table->string('currency', 10)->default('INR');

            // Store Owner (User with 'store' role)
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamp('opened_at')->nullable();
            $table->timestamp('closed_at')->nullable();

            $table->softDeletes();
            $table->timestamps();

            // Composite Performance Indexes
            $table->index(['platform', 'is_active', 'deleted_at'], 'idx_stores_platform_active');
            $table->index(['is_public', 'is_active'], 'idx_stores_public_active');
            $table->index(['type', 'is_active'], 'idx_stores_type_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('stores');
    }
};

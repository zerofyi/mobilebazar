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
        Schema::create('customers', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('status', 30)->default('active');
            $table->string('name');
            $table->string('care_of')->nullable();

            $table->string('phone_primary')->unique();
            $table->string('phone_secondary')->nullable()->index();

            $table->string('aadhaar_number')->nullable()->unique();
            $table->string('pan_number')->nullable()->unique();
            $table->string('voter_number')->nullable()->unique();

            $table->decimal('credit_limit', 12, 2)->default(0.00);
            $table->decimal('loyalty_points', 12, 2)->default(0.00);
            $table->decimal('total_spent', 12, 2)->default(0.00);

            $table->boolean('is_verified')->default(false);
            $table->text('address_snapshot')->nullable();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['status', 'is_verified', 'deleted_at'], 'idx_customers_status_check');
            $table->fulltext(['name', 'care_of'], 'ft_customers_name_careof');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('customers');
    }
};

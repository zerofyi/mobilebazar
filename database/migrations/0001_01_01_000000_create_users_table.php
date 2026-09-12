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
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->uuid('uuid')->unique();
            $table->unsignedBigInteger('store_id')->nullable()->index();

            $table->string('role')->default('customer');

            $table->string('name');
            $table->string('email')->unique();
            $table->string('mobile')->nullable()->unique();
            $table->string('avatar')->nullable();

            $table->boolean('is_active')->default(true);
            $table->boolean('is_suspended')->default(false);

            $table->timestamp('email_verified_at')->nullable();
            $table->timestamp('mobile_verified_at')->nullable();
            $table->string('password');

            $table->foreignId('parent_id')->nullable()->constrained('users')->nullOnDelete();

            $table->unsignedInteger('failed_login_attempts')->default(0);
            $table->timestamp('locked_until')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->string('last_login_ip', 45)->nullable();

            $table->rememberToken();
            $table->softDeletes();
            $table->timestamps();

            $table->index(['store_id', 'role', 'is_active', 'is_suspended'], 'idx_users_store_role_status');
            $table->index(['role', 'is_active', 'is_suspended', 'deleted_at'], 'idx_users_role_status');
            $table->index(['parent_id', 'deleted_at'], 'idx_users_parent_deleted');
            $table->index(['locked_until', 'is_suspended'], 'idx_users_lockout_check');
            $table->index(['last_login_at'], 'idx_users_last_login');
        });

        Schema::create('password_reset_tokens', function (Blueprint $table) {
            $table->string('email')->primary();
            $table->string('token');
            $table->timestamp('created_at')->nullable();
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
        Schema::dropIfExists('password_reset_tokens');
        Schema::dropIfExists('sessions');
    }
};

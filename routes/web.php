<?php

use App\Http\Controllers\Auth\AuthController;
use Illuminate\Support\Facades\Route;

Route::inertia('/', 'welcome')->name('home');
Route::inertia('customer/dashboard', 'dashboard')->name('customer.dashboard')->middleware(['auth', 'verified', 'check:customer']);

Route::middleware(['auth', 'verified', 'role.redirect'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});


Route::prefix('auth')->middleware(['auth'])->name('auth.')->group(function () {
    Route::get('/verify',  [AuthController::class, 'show'])->name('otp.notice');
    Route::post('/verify', [AuthController::class, 'verify'])->name('otp.verify')->middleware('throttle:10,1');
    Route::post('/verify/resend', [AuthController::class, 'resend'])->name('otp.resend')->middleware('throttle:3,1');
    Route::post('/update-mobile', [AuthController::class, 'updateMobile'])->name('otp.update-mobile')->middleware('throttle:5,1');
});

require __DIR__.'/web/zero.php';
require __DIR__.'/web/admin.php';
require __DIR__.'/web/store.php';

require __DIR__.'/web/common.php';

require __DIR__.'/settings.php';

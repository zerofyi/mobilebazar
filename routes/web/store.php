<?php

use App\Http\Controllers\DashboardController;

Route::prefix('store')->middleware(['auth', 'verified', 'check:store'])
    ->name('store.')->group(function () {
        Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');
});

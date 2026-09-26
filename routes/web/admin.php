<?php

Route::prefix('admin')->middleware(['auth', 'verified', 'check:admin'])
    ->name('admin.')->group(function () {
        Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

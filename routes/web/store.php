<?php

Route::prefix('store')->middleware(['auth', 'verified', 'check:store'])
    ->name('store.')->group(function () {
        Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

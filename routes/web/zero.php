<?php

use App\Http\Controllers\Zero\DevPermissionController;

Route::prefix('zero')->middleware(['auth', 'verified', 'check:zero'])
    ->name('zero.')->group(function () {
        Route::inertia('dashboard', 'dashboard')->name('dashboard');

        // Roles & Permissions Manager
        Route::get('/permissions', [DevPermissionController::class, 'index'])->name('permissions.index');
        Route::post('/permissions', [DevPermissionController::class, 'storePermission'])->name('permissions.store');
        Route::post('/roles', [DevPermissionController::class, 'storeRole'])->name('roles.store');
        Route::post('/roles/sync', [DevPermissionController::class, 'syncRolePermissions'])->name('roles.sync');

        // User Assignment Endpoints
        Route::post('/users/assign-role', [DevPermissionController::class, 'assignRoleToUser'])->name('users.assign-role');
        Route::post('/users/sync-permissions', [DevPermissionController::class, 'syncUserDirectPermissions'])->name('users.sync-permissions');
    });

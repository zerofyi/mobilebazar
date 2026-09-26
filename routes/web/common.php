<?php

use App\Http\Controllers\PartySearchController;
use App\Http\Controllers\AttributeController;
use App\Http\Controllers\BannerController;
use App\Http\Controllers\BrandController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\FinancerController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\PurchaseEntryController;
use App\Http\Controllers\StoreController;
use App\Http\Controllers\SupplierController;

Route::prefix('app')->middleware(['auth', 'verified', 'check'])
    ->name('app.')->group(function () {

    Route::prefix('stores')->name('stores.')->group(function () {
        Route::get('/', [StoreController::class, 'index'])->name('index');
        Route::get('/create', [StoreController::class, 'create'])->name('create');
        Route::post('/', [StoreController::class, 'store'])->name('store');
        Route::get('/{store}', [StoreController::class, 'show'])->name('show');
        Route::get('/{store}/edit', [StoreController::class, 'edit'])->name('edit');
        Route::put('/{store}', [StoreController::class, 'update'])->name('update');
        Route::delete('/{store}', [StoreController::class, 'destroy'])->name('destroy');
        Route::post('/{uuid}/restore', [StoreController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [StoreController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('banners')->name('banners.')->group(function () {
        Route::get('/', [BannerController::class, 'index'])->name('index');
        Route::post('/', [BannerController::class, 'store'])->name('store');
        Route::put('/{banner}', [BannerController::class, 'update'])->name('update');
        Route::delete('/{banner}', [BannerController::class, 'destroy'])->name('destroy');
        Route::post('/{uuid}/restore', [BannerController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [BannerController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('brands')->name('brands.')->group(function () {
        Route::get('/', [BrandController::class, 'index'])->name('index');
        Route::post('/', [BrandController::class, 'store'])->name('store');
        Route::put('/{brand}', [BrandController::class, 'update'])->name('update');
        Route::delete('/{brand}', [BrandController::class, 'destroy'])->name('destroy');
        Route::post('/{uuid}/restore', [BrandController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [BrandController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('categories')->name('categories.')->group(function () {
        Route::get('/', [CategoryController::class, 'index'])->name('index');
        Route::post('/', [CategoryController::class, 'store'])->name('store');
        Route::put('/{category}', [CategoryController::class, 'update'])->name('update');
        Route::delete('/{category}', [CategoryController::class, 'destroy'])->name('destroy');
        Route::post('/{uuid}/restore', [CategoryController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [CategoryController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('attributes')->name('attributes.')->group(function () {
        Route::get('/', [AttributeController::class, 'index'])->name('index');
        Route::post('/', [AttributeController::class, 'store'])->name('store');
        Route::post('/{attribute}/values', [AttributeController::class, 'storeValue'])->name('values.store');
        Route::put('/{attribute}', [AttributeController::class, 'update'])->name('update');
        Route::delete('/{attribute}', [AttributeController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('suppliers')->name('suppliers.')->group(function () {
        Route::get('/', [SupplierController::class, 'index'])->name('index');
        Route::post('/', [SupplierController::class, 'store'])->name('store');

        // 1. Static endpoints MUST come before wildcard parameters
        Route::get('/search', [PartySearchController::class, 'suppliers'])->name('search');

        // 2. Dynamic wildcard routes go last
        Route::get('/{supplier}', [SupplierController::class, 'show'])->name('show');
        Route::put('/{supplier}', [SupplierController::class, 'update'])->name('update');
        Route::delete('/{supplier}', [SupplierController::class, 'destroy'])->name('destroy');

        Route::post('/{uuid}/restore', [SupplierController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [SupplierController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('financers')->name('financers.')->group(function () {
        Route::get('/', [FinancerController::class, 'index'])->name('index');
        Route::post('/', [FinancerController::class, 'store'])->name('store');
        Route::get('/{financer}', [FinancerController::class, 'show'])->name('show');
        Route::put('/{financer}', [FinancerController::class, 'update'])->name('update');
        Route::delete('/{financer}', [FinancerController::class, 'destroy'])->name('destroy');
        Route::post('/{uuid}/restore', [FinancerController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [FinancerController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('customers')->name('customers.')->group(function () {
        Route::get('/', [CustomerController::class, 'index'])->name('index');
        Route::get('/create', [CustomerController::class, 'create'])->name('create');
        Route::post('/', [CustomerController::class, 'store'])->name('store');

        // 1. Static endpoints MUST come before wildcard parameters
        Route::get('/search', [PartySearchController::class, 'customers'])->name('search');
        Route::post('/resolve-identity', [CustomerController::class, 'resolveIdentity'])->name('resolve-identity');

        // 2. Dynamic wildcard routes go last
        Route::get('/{customer}', [CustomerController::class, 'show'])->name('show');
        Route::get('/{customer}/edit', [CustomerController::class, 'edit'])->name('edit');
        Route::put('/{customer}', [CustomerController::class, 'update'])->name('update');
        Route::delete('/{customer}', [CustomerController::class, 'destroy'])->name('destroy');

        Route::post('/{uuid}/restore', [CustomerController::class, 'restore'])->name('restore');
        Route::delete('/{uuid}/force', [CustomerController::class, 'forceDelete'])->name('delete');
    });

    Route::prefix('products')->name('products.')->group(function () {
        Route::get('/', [ProductController::class, 'index'])->name('index');
        Route::get('/create', [ProductController::class, 'create'])->name('create');
        Route::get('/variants/search', [ProductController::class, 'searchVariants'])->name('variants.search');

        Route::post('/', [ProductController::class, 'store'])->name('store');
        Route::get('/{product}', [ProductController::class, 'show'])->name('show');
        Route::get('/{product}/edit', [ProductController::class, 'edit'])->name('edit');
        Route::put('/{product}', [ProductController::class, 'update'])->name('update');
        Route::delete('/{product}', [ProductController::class, 'destroy'])->name('destroy');
        Route::post('/{product}/restore', [ProductController::class, 'restore'])->name('restore');
        Route::delete('/{product}/purge', [ProductController::class, 'purge'])->name('purge');
    });

    Route::prefix('purchases')->name('purchases.')->group(function () {
        Route::get('/', [PurchaseEntryController::class, 'index'])->name('index');
        Route::get('/create', [PurchaseEntryController::class, 'create'])->name('create');
        Route::get('/{purchase}', [PurchaseEntryController::class, 'show'])->name('show');
        Route::post('/', [PurchaseEntryController::class, 'store'])->name('store');
    });

});

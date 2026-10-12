<?php

use App\Http\Controllers\PartySearchController;
use App\Http\Controllers\AttributeController;
use App\Http\Controllers\BannerController;
use App\Http\Controllers\BrandController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\CustomerController;
use App\Http\Controllers\FinancerController;
use App\Http\Controllers\InstallmentController;
use App\Http\Controllers\LoanController;
use App\Http\Controllers\ProductController;
use App\Http\Controllers\DebitNoteController;
use App\Http\Controllers\InventoryController;
use App\Http\Controllers\PurchaseController;
use App\Http\Controllers\PurchaseEntryController;
use App\Http\Controllers\PurchaseReportController;
use App\Http\Controllers\SaleEntryController;
use App\Http\Controllers\StoreController;
use App\Http\Controllers\SupplierController;
use App\Http\Controllers\SupplierPaymentController;

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
        // 1. Static routes (No parameters)
        Route::get('/', [PurchaseEntryController::class, 'index'])->name('index');
        Route::get('/create', [PurchaseEntryController::class, 'create'])->name('create');
        Route::post('/', [PurchaseEntryController::class, 'store'])->name('store');

        // 2. Custom action routes on specific items (Place BEFORE general show/update/destroy)
        Route::get('/{purchase}/print', [PurchaseEntryController::class, 'print'])->name('print');
        Route::delete('/{purchase}/purge', [PurchaseEntryController::class, 'purge'])->name('purge');

        // 3. Standard Resource routes with parameters
        Route::get('/{purchase}', [PurchaseEntryController::class, 'show'])->name('show');
        Route::get('/{purchase}/edit', [PurchaseEntryController::class, 'edit'])->name('edit');
        Route::put('/{purchase}', [PurchaseEntryController::class, 'update'])->name('update');
        Route::delete('/{purchase}', [PurchaseEntryController::class, 'destroy'])->name('destroy');
    });

    Route::prefix('debit-notes')->name('debit-notes.')->group(function () {
        // 1. Static routes (No parameters)
        Route::get('/', [DebitNoteController::class, 'index'])->name('index');
        Route::get('/create', [DebitNoteController::class, 'create'])->name('create');
        Route::post('/', [DebitNoteController::class, 'store'])->name('store');

        // 2. JSON endpoints for the Create page — static, BEFORE the wildcard
        Route::get('/purchases/search', [DebitNoteController::class, 'searchPurchases'])->name('purchases.search');
        Route::get('/purchase-stock/{purchase}', [DebitNoteController::class, 'purchaseStock'])->name('purchase-stock');

        // 3. Detail
        Route::get('/{debit_note}', [DebitNoteController::class, 'show'])->name('show');
    });

    Route::prefix('reports/purchases')->name('reports.purchases.')->group(function () {
        Route::get('/register', [PurchaseReportController::class, 'register'])->name('register');
        Route::get('/item-history', [PurchaseReportController::class, 'itemHistory'])->name('itemHistory');
        Route::get('/payables', [PurchaseReportController::class, 'payables'])->name('payables');
    });

    Route::prefix('sales')->name('sales.')->group(function () {
        // 1. Static routes (No parameters)
        Route::get('/', [SaleEntryController::class, 'index'])->name('index');
        Route::get('/create', [SaleEntryController::class, 'create'])->name('create');
        Route::post('/', [SaleEntryController::class, 'store'])->name('store');
        Route::get('/stock/search', [SaleEntryController::class, 'stockSearch'])->name('stock.search');

        // 2. Custom action routes on specific items (Place BEFORE general show/update/destroy)
        Route::get('/{sale}/print', [SaleEntryController::class, 'print'])->name('print');
        Route::delete('/{sale}/purge', [SaleEntryController::class, 'purge'])->name('purge');

        // 3. Standard Resource routes with parameters
        Route::get('/{sale}', [SaleEntryController::class, 'show'])->name('show');
        Route::get('/{sale}/edit', [SaleEntryController::class, 'edit'])->name('edit');
        Route::put('/{sale}', [SaleEntryController::class, 'update'])->name('update');
        Route::delete('/{sale}', [SaleEntryController::class, 'destroy'])->name('destroy');
    });

    // ── Supplier payments ──
    Route::prefix('supplier-payments')->name('supplier-payments.')->group(function () {
        // 1. Static routes (No parameters)
        Route::get('/', [SupplierPaymentController::class, 'index'])->name('index');
        Route::get('/create', [SupplierPaymentController::class, 'create'])->name('create');
        Route::post('/', [SupplierPaymentController::class, 'store'])->name('store');
    });

    // ── Stock inventory (read-only) ──
    Route::prefix('inventory')->name('inventory.')->group(function () {
        Route::get('/', [InventoryController::class, 'index'])->name('index');
    });

    // Per-supplier outstanding dues. Kept out of the `suppliers` group so it can
    // never be shadowed by the `/{supplier}` show route (a single-segment route
    // can't match this two-segment URL anyway).
    Route::get('/suppliers/{supplier}/outstanding', [SupplierPaymentController::class, 'outstanding'])
        ->name('suppliers.outstanding');

    // ── Loans (editable/deletable only while pristine — see LoanService::assertMutable) ──
    Route::prefix('loans')->name('loans.')->group(function () {
        // 1. Static routes (No parameters)
        Route::get('/', [LoanController::class, 'index'])->name('index');
        Route::get('/create', [LoanController::class, 'create'])->name('create');
        Route::get('/invoice-lookup', [LoanController::class, 'lookupInvoice'])->name('invoice-lookup');
        Route::post('/preview-schedule', [LoanController::class, 'preview'])->name('preview-schedule');
        Route::post('/', [LoanController::class, 'store'])->name('store');

        // 2. Custom action routes on specific items (BEFORE show)
        Route::post('/{loan}/settle', [LoanController::class, 'settle'])->name('settle');
        Route::post('/{loan}/mark-default', [LoanController::class, 'markDefault'])->name('mark-default');
        Route::post('/{loan}/agreement', [LoanController::class, 'agreement'])->name('agreement');
        Route::post('/{loan}/upload-agreement', [LoanController::class, 'upload'])->name('agreement.upload');
        Route::post('/{loan}/visits', [LoanController::class, 'logVisit'])->name('visits.store');
        Route::post('/{loan}/kyc', [LoanController::class, 'uploadKyc'])->name('kyc.upload');
        Route::get('/{loan}/edit', [LoanController::class, 'edit'])->name('edit');
        Route::put('/{loan}', [LoanController::class, 'update'])->name('update');
        // Delete is PIN-gated: 5 attempts/minute makes a 4-digit PIN unbruteforceable.
        Route::delete('/{loan}', [LoanController::class, 'destroy'])->name('destroy')->middleware('throttle:5,1');

        // 3. Detail
        Route::get('/{loan}', [LoanController::class, 'show'])->name('show');
    });

    // ── Loan installments (EMI collection) ──
    Route::prefix('loan-installments')->name('installments.')->group(function () {
        Route::get('/', [InstallmentController::class, 'index'])->name('index');
        Route::get('/today', [InstallmentController::class, 'today'])->name('today');
        Route::get('/overdue', [InstallmentController::class, 'overdue'])->name('overdue');
        Route::get('/calendar', [InstallmentController::class, 'calendar'])->name('calendar');
        Route::post('/{schedule}/pay', [InstallmentController::class, 'pay'])->name('pay');
        Route::get('/{repayment}/receipt', [InstallmentController::class, 'receipt'])->name('receipt');
    });

});

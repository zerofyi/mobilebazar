<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\Models\LoanRepayment;
use App\Models\LoanSchedule;
use App\Models\Store;
use App\Services\LoanService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\RedirectResponse;

/**
 * Installment collections: due lists, today/overdue/calendar views,
 * payment capture, and repayment receipts.
 */
class InstallmentController extends Controller
{
    public function __construct(private readonly LoanService $loans) {}

    private function store(Request $request): Store
    {
        return $request->user()->ownedStore;
    }

    /**
     * @return \Illuminate\Database\Eloquent\Builder<LoanSchedule>
     */
    private function baseQuery(Store $store)
    {
        return LoanSchedule::query()
            ->with(['loan.borrower'])
            ->whereHas('loan', fn ($q) => $q->where('store_id', $store->id));
    }

    // ── Due list ─────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $store = $this->store($request);

        $schedules = $this->baseQuery($store)
            ->when($request->string('status')->toString(), fn ($q, $s) => $q->where('status', $s))
            ->when($request->date('from')?->toDateString(), fn ($q, $d) => $q->whereDate('due_date', '>=', $d))
            ->when($request->date('to')?->toDateString(), fn ($q, $d) => $q->whereDate('due_date', '<=', $d))
            ->orderBy('due_date')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('LoanInstallments/Index', [
            'schedules' => $schedules,
            'filters'   => $request->only(['status', 'from', 'to']),
        ]);
    }

    public function today(Request $request): Response
    {
        $store = $this->store($request);

        $schedules = $this->baseQuery($store)
            ->whereDate('due_date', today())
            ->whereIn('status', ['pending', 'partial', 'overdue'])
            ->orderBy('due_date')
            ->get();

        return Inertia::render('LoanInstallments/Today', [
            'schedules' => $schedules,
            'date'      => today()->toDateString(),
        ]);
    }

    public function overdue(Request $request): Response
    {
        $store = $this->store($request);

        $schedules = $this->baseQuery($store)
            ->overdue()
            ->orderBy('due_date')
            ->paginate(25);

        return Inertia::render('LoanInstallments/Overdue', [
            'schedules' => $schedules,
        ]);
    }

    public function calendar(Request $request): Response
    {
        $store = $this->store($request);

        $month = $request->date('month')?->startOfMonth() ?? today()->startOfMonth();

        $schedules = $this->baseQuery($store)
            ->whereBetween('due_date', [
                $month->copy()->startOfMonth()->toDateString(),
                $month->copy()->endOfMonth()->toDateString(),
            ])
            ->orderBy('due_date')
            ->get()
            ->groupBy(fn ($s) => $s->due_date->toDateString());

        return Inertia::render('LoanInstallments/Calendar', [
            'month'     => $month->toDateString(),
            'schedules' => $schedules,
        ]);
    }

    // ── Payment capture ──────────────────────────────────────────────────

    public function pay(Request $request, LoanSchedule $schedule): RedirectResponse
    {
        $store = $this->store($request);

        abort_if($schedule->loan->store_id !== $store->id, 404);

        $validated = $request->validate([
            'amount'         => ['required', 'numeric', 'min:0.01'],
            'payment_mode'   => ['required', 'in:cash,upi,bank,card,neft,cheque'],
            'txn_reference'  => ['nullable', 'string', 'max:100'],
            'notes'          => ['nullable', 'string', 'max:1000'],
        ]);

        $repayment = $this->loans->collectInstallment(
            $store, $request->user(), $schedule, $validated,
        );

        return redirect()
            ->route('app.loans.show', $schedule->loan)
            ->with('success', 'Payment of ₹' . number_format((float) $repayment->amount, 2)
                . ' recorded. Receipt ' . $repayment->receipt_number . '.');
    }

    // ── Receipt ──────────────────────────────────────────────────────────

    public function receipt(Request $request, LoanRepayment $repayment): Response
    {
        $store = $this->store($request);

        abort_if($repayment->store_id !== $store->id, 404);

        $repayment->load(['loan.borrower', 'loanSchedule', 'collectedBy', 'store']);

        return Inertia::render('LoanRepayments/Receipt', [
            'repayment' => $repayment,
        ]);
    }
}

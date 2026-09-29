<?php

declare(strict_types=1);

namespace App\Services;

use App\DTOs\JournalEntryData;
use App\Exceptions\AccountingException;
use App\Models\JournalEntry;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Generic double-entry engine. Knows nothing about purchases/sales — domain classes
 * (e.g. Accounting\PurchaseJournal) build a JournalEntryData and hand it here.
 *
 * Design notes:
 *  - Accounts are global (store_id NULL) so we do NOT maintain accounts.current_balance
 *    (it would be a single hot row shared by every store). Balances are derived per store
 *    from journal_lines.
 *  - post() is idempotent on (store_id, entry_number): re-posting the same entry for the
 *    same reference returns the existing one instead of duplicating.
 *  - Call from inside the business transaction; post() joins it.
 */
final class AccountingService
{
    private const CACHE_TTL_SECONDS = 600;

    /*
    |--------------------------------------------------------------------------
    | Posting
    |--------------------------------------------------------------------------
    */
    public function post(JournalEntryData $data): JournalEntry
    {
        return DB::transaction(function () use ($data) {
            $existing = JournalEntry::query()
                ->where('store_id', $data->storeId)
                ->where('entry_number', $data->entryNumber)
                ->first();

            if ($existing) {
                $sameRef = $existing->reference_type === $data->referenceType
                    && (int) $existing->reference_id === $data->referenceId;

                if ($sameRef) {
                    return $existing; // idempotent replay
                }

                throw AccountingException::duplicateEntry($data->entryNumber);
            }

            $accountIds = $this->resolveAccountIds($data->storeId, $data->accountCodes());

            $entry = JournalEntry::create([
                'entry_number'   => $data->entryNumber,
                'store_id'       => $data->storeId,
                'entry_date'     => $data->entryDate,
                'reference_type' => $data->referenceType,
                'reference_id'   => $data->referenceId,
                'total_debit'    => JournalEntryData::fromPaise($data->totalPaise),
                'total_credit'   => JournalEntryData::fromPaise($data->totalPaise),
                'narration'      => mb_substr($data->narration, 0, 500),
                'created_by'     => $data->createdBy,
            ]);

            $entry->lines()->createMany(array_map(
                fn (array $l) => [
                    'account_id' => $accountIds[$l['account']],
                    'debit'      => JournalEntryData::fromPaise($l['debit']),
                    'credit'     => JournalEntryData::fromPaise($l['credit']),
                    'memo'       => $l['memo'],
                ],
                $data->lines
            ));

            return $entry;
        }, 3);
    }

    /**
     * Post a reversing entry (debits <-> credits). Ledger rows are never edited or deleted;
     * a cancellation is a new, dated, attributable entry. Idempotent per original entry.
     */
    public function reverse(
        JournalEntry $entry,
        int $userId,
        ?string $reason = null,
        string|\DateTimeInterface|null $date = null,
    ): JournalEntry {
        $entry->loadMissing('lines.account');

        $lines = $entry->lines->map(fn ($l) => [
            'account' => $l->account->code,
            'debit'   => (string) $l->credit,
            'credit'  => (string) $l->debit,
            'memo'    => 'Reversal: ' . ($l->memo ?? ''),
        ])->all();

        return $this->post(new JournalEntryData(
            storeId:       (int) $entry->store_id,
            entryNumber:   'REV-' . $entry->entry_number,
            entryDate:     $date ?? now(),
            referenceType: $entry->reference_type ?? JournalEntry::class,
            referenceId:   (int) ($entry->reference_id ?? $entry->id),
            narration:     'Reversal of ' . $entry->entry_number . ($reason ? " — {$reason}" : ''),
            createdBy:     $userId,
            lines:         $lines,
        ));
    }

    /*
    |--------------------------------------------------------------------------
    | Reporting (per store, derived from the ledger)
    |--------------------------------------------------------------------------
    */

    /** Balance in the account's normal direction (asset/expense: Dr-Cr, others: Cr-Dr). */
    public function balance(int $storeId, string $code, ?string $asOf = null): string
    {
        $id   = $this->resolveAccountIds($storeId, [$code])[$code];
        $type = DB::table('accounts')->where('id', $id)->value('type');

        $row = DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->where('je.store_id', $storeId)
            ->where('jl.account_id', $id)
            ->when($asOf, fn ($q) => $q->where('je.entry_date', '<=', $asOf))
            ->selectRaw('COALESCE(SUM(jl.debit),0) AS d, COALESCE(SUM(jl.credit),0) AS c')
            ->first();

        $d = JournalEntryData::toPaise($row->d);
        $c = JournalEntryData::toPaise($row->c);

        return JournalEntryData::fromPaise(in_array($type, ['asset', 'expense'], true) ? $d - $c : $c - $d);
    }

    /**
     * @return Collection<int, object{code:string,name:string,type:string,debit:string,credit:string}>
     */
    public function trialBalance(int $storeId, ?string $asOf = null): Collection
    {
        return DB::table('journal_lines as jl')
            ->join('journal_entries as je', 'je.id', '=', 'jl.journal_entry_id')
            ->join('accounts as a', 'a.id', '=', 'jl.account_id')
            ->where('je.store_id', $storeId)
            ->when($asOf, fn ($q) => $q->where('je.entry_date', '<=', $asOf))
            ->groupBy('a.id', 'a.code', 'a.name', 'a.type')
            ->orderBy('a.code')
            ->selectRaw('a.code, a.name, a.type, SUM(jl.debit) AS debit, SUM(jl.credit) AS credit')
            ->get();
    }

    /*
    |--------------------------------------------------------------------------
    | Account resolution (store-specific overrides global; cached; self-healing)
    |--------------------------------------------------------------------------
    */

    /**
     * @param  list<string> $codes
     * @return array<string,int> code => account id
     */
    public function resolveAccountIds(int $storeId, array $codes): array
    {
        $map     = $this->accountMap($storeId);
        $missing = array_values(array_diff($codes, array_keys($map)));

        if ($missing !== []) {
            // Cache may predate a newly seeded account — rebuild once before failing.
            $this->forgetAccountCache($storeId);
            $map     = $this->accountMap($storeId);
            $missing = array_values(array_diff($codes, array_keys($map)));

            if ($missing !== []) {
                throw AccountingException::accountNotFound($missing, $storeId);
            }
        }

        return array_intersect_key($map, array_flip($codes));
    }

    public function forgetAccountCache(int $storeId): void
    {
        Cache::forget($this->cacheKey($storeId));
    }

    /** @return array<string,int> */
    private function accountMap(int $storeId): array
    {
        return Cache::remember($this->cacheKey($storeId), self::CACHE_TTL_SECONDS, function () use ($storeId) {
            $rows = DB::table('accounts')
                ->where('is_active', true)
                ->where(fn ($q) => $q->whereNull('store_id')->orWhere('store_id', $storeId))
                ->get(['id', 'code', 'store_id']);

            $map = [];
            foreach ($rows as $r) {
                // store-specific account wins over the global one with the same code
                if (! isset($map[$r->code]) || $r->store_id !== null) {
                    $map[$r->code] = (int) $r->id;
                }
            }

            return $map;
        });
    }

    private function cacheKey(int $storeId): string
    {
        return "accounts:map:store:{$storeId}";
    }
}

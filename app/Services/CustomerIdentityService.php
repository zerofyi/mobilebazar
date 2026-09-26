<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;

class CustomerIdentityService
{
    /**
     * Normalize raw phone number string down to standard 10-digit format.
     */
    protected function sanitizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);

        // Strip Indian country code (+91 / 91) if 12 digits present
        if (strlen($digits) === 12 && str_starts_with($digits, '91')) {
            return substr($digits, 2);
        }

        // Strip leading 0 if 11 digits present
        if (strlen($digits) === 11 && str_starts_with($digits, '0')) {
            return substr($digits, 1);
        }

        return $digits;
    }

    /**
     * Search for a matching online User account by mobile number.
     */
    public function findMatchingUser(string $phone): ?User
    {
        $sanitized = $this->sanitizePhone($phone);

        if (empty($sanitized)) {
            return null;
        }

        return User::query()
            ->where(function ($query) use ($sanitized, $phone) {
                $query->where('mobile', $sanitized)
                      ->orWhere('mobile', $phone)
                      ->orWhere('mobile', 'like', "%{$sanitized}");
            })
            ->first();
    }

    /**
     * Evaluate mobile match and check if name collision handling is needed.
     *
     * Returns array with match status:
     * - 'matched': true/false
     * - 'user': User model or null
     * - 'has_name_conflict': true/false
     * - 'is_customer_verified': true/false
     */
    public function evaluateIdentity(string $phone, string $customerName, ?Customer $customer = null): array
    {
        $matchingUser = $this->findMatchingUser($phone);

        if (!$matchingUser) {
            return [
                'matched'              => false,
                'user'                 => null,
                'has_name_conflict'    => false,
                'is_customer_verified' => $customer?->is_verified ?? false,
            ];
        }

        $normalizedCustomerName = strtolower(trim($customerName));
        $normalizedUserName     = strtolower(trim($matchingUser->name));

        $hasConflict = $normalizedCustomerName !== $normalizedUserName;

        return [
            'matched'              => true,
            'user'                 => $matchingUser,
            'has_name_conflict'    => $hasConflict,
            'is_customer_verified' => $customer?->is_verified ?? false,
        ];
    }

    /**
     * Atomically link the Customer record with the User account,
     * synchronizing the preferred name across both models.
     *
     * If the Customer is KYC verified, the Customer's verified name is prioritized automatically.
     */
    public function syncIdentity(Customer $customer, User $user, ?string $preferredName = null): void
    {
        DB::transaction(function () use ($customer, $user, $preferredName) {
            // Priority 1: If Customer is KYC verified, strictly preserve the Customer's name
            if ($customer->is_verified) {
                $finalName = $customer->name;
            } else {
                // Priority 2: Use provided preferredName or fall back to User's name
                $finalName = $preferredName ?? $user->name;
            }

            // Update Customer record with link and final prioritized name
            $customer->update([
                'user_id' => $user->id,
                'name'    => $finalName,
            ]);

            $userUpdates = [];

            // Sync User account name if it differs from the prioritized final name
            if ($user->name !== $finalName) {
                $userUpdates['name'] = $finalName;
            }

            // Sync User mobile if missing or empty
            if (empty($user->mobile) && !empty($customer->phone_primary)) {
                $userUpdates['mobile'] = $this->sanitizePhone($customer->phone_primary);
            }

            if (!empty($userUpdates)) {
                $user->update($userUpdates);
            }
        });
    }
}

<?php

namespace App\Listeners;

use App\Models\User;
use App\Models\UserDevice;
use Illuminate\Auth\Events\Login;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class UserAuthenticationListener
{
    public function __construct(
        public readonly Request $request
    ) {}

    public function handle(Login $event): void
    {
        $user = $event->user;

        if (! $user instanceof User) {
            return;
        }

        // 1. Reset login stats on successful authentication
        $user->update([
            'failed_login_attempts' => 0,
            'locked_until'          => null,
            'last_login_at'         => now(),
            'last_login_ip'         => $this->request->ip(),
        ]);

        // 2. Track the device (wrapped in try/catch to prevent login failure if tracking fails)
        try {
            $userAgent = $this->request->userAgent() ?? 'unknown';
            $deviceIdentifier = hash('sha256', $userAgent . '|' . $this->request->ip());

            UserDevice::updateOrCreate(
                [
                    'user_id'   => $user->id,
                    'device_id' => $deviceIdentifier,
                ],
                [
                    'device_name'    => substr($userAgent, 0, 255),
                    'platform'       => $this->resolvePlatform($userAgent),
                    'last_active_at' => now(),
                ]
            );
        } catch (\Exception $e) {
            Log::warning('Failed to record user device during login.', [
                'user_id' => $user->id,
                'error'   => $e->getMessage()
            ]);
        }
    }

    private function resolvePlatform(string $userAgent): string
    {
        return match (true) {
            str_contains($userAgent, 'Android') => 'Android',
            str_contains($userAgent, 'iPhone') || str_contains($userAgent, 'iPad') => 'iOS',
            str_contains($userAgent, 'Windows') => 'Windows',
            str_contains($userAgent, 'Macintosh') => 'macOS',
            str_contains($userAgent, 'Linux') => 'Linux',
            default => 'Web/Other',
        };
    }
}

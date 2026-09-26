<?php

namespace App\Services;

use App\Models\Otp;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;

class OtpService
{
    public function generate(
        string $identifier,
        string $purpose = 'verification',
        ?string $ipAddress = null,
    ): string {
        // Sanitize immediately so rate limits and DB records operate on identical keys
        $mobileNumber = preg_replace('/[^0-9]/', '', $identifier);

        $recentAttempts = Otp::where('identifier', $mobileNumber)
            ->where('purpose', $purpose)
            ->where('created_at', '>=', now()->subHour())
            ->count();

        if ($recentAttempts >= (int) config('otp.max_generate_per_hour', 5)) {
            throw ValidationException::withMessages([
                'code' => __('Too many OTP requests. Please try again in an hour.'),
            ]);
        }

        Otp::where('identifier', $mobileNumber)
            ->where('purpose', $purpose)
            ->whereNull('consumed_at')
            ->update(['consumed_at' => now()]);

        $code = (string) random_int(100000, 999999);
        $expiryMinutes = (int) config('otp.expires_in_minutes', 15);

        Otp::create([
            'identifier' => $mobileNumber,
            'code_hash'  => Hash::make($code),
            'purpose'    => $purpose,
            'ip_address' => $ipAddress,
            'expires_at' => now()->addMinutes($expiryMinutes),
            'attempts'   => 0,
        ]);

        if (app()->environment('production')) {
            try {
                $response = Http::withHeaders([
                    'X-API-Key' => config('services.startmessaging.key'),
                ])->post('https://api.startmessaging.com/otp/send', [
                    'phoneNumber' => '+91' . $mobileNumber,
                    'templateId'  => config('services.startmessaging.template_id'),
                    'variables'   => [
                        'otp'    => $code,
                        // 'appName' => 'Mobile Bazar',
                        'expiry' => (string) $expiryMinutes,
                    ],
                ]);

                if ($response->failed()) {
                    Log::error('StartMessaging API failed', [
                        'status' => $response->status(),
                        'body'   => $response->body(),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::error('SMS Dispatch Exception', ['error' => $e->getMessage()]);
            }
        }

        Log::info('OTP generated', [
            'identifier' => $mobileNumber,
            'purpose'    => $purpose,
            'otp'        => app()->environment('local') ? $code : '******',
            'ip'         => $ipAddress,
        ]);

        return $code;
    }

    public function verify(string $identifier, string $code, string $purpose = 'verification'): bool
    {
        $mobileNumber = preg_replace('/[^0-9]/', '', $identifier);
        $otp = Otp::validFor($mobileNumber, $purpose)->first();

        if (! $otp || $otp->is_locked) {
            return false;
        }

        if (! Hash::check($code, $otp->code_hash)) {
            $otp->increment('attempts');

            if ($otp->fresh()->is_locked) {
                $otp->update(['consumed_at' => now()]);
            }

            return false;
        }

        $otp->update(['consumed_at' => now()]);

        return true;
    }
}

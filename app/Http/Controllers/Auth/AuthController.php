<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Services\OtpService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class AuthController extends Controller
{
    public function show(Request $request)
    {
        $user = $request->user();

        if ($user->mobile_verified_at) {
            return redirect()->intended($user->role?->dashboardUrl() ?? '/');
        }

        return Inertia::render('auth/verify-otp', [
            'mobile' => $user->mobile,
        ]);
    }

    public function verify(Request $request, OtpService $otpService)
    {
        $request->validate([
            'code' => ['required', 'string', 'digits:6'],
        ]);

        $user = $request->user();

        $isValid = $otpService->verify($user->mobile, $request->code, 'registration');

        if (! $isValid) {
            throw ValidationException::withMessages([
                'code' => __('The provided OTP is invalid or has expired.'),
            ]);
        }

        $user->update([
            'mobile_verified_at' => now(),
            'is_active'          => true,
        ]);

        $request->session()->regenerate();

        return redirect()->intended($user->role?->dashboardUrl() ?? '/');
    }

    public function resend(Request $request, OtpService $otpService)
    {
        $user = $request->user();

        if ($user->mobile_verified_at) {
            return redirect()->intended($user->role?->dashboardUrl() ?? '/');
        }

        $otpService->generate($user->mobile, 'registration', $request->ip());

        return back()->with('status', __('Verification code resent successfully.'));
    }

    /**
     * Update the authenticated user's mobile number and send a fresh OTP.
     */
    public function updateMobile(Request $request, OtpService $otpService)
    {
        $request->validate([
            'mobile' => [
                'required',
                'string',
                'regex:/^[6-9]\d{9}$/',
                Rule::unique('users', 'mobile')->ignore($request->user()->id),
            ],
        ], [
            'mobile.regex'  => __('Please enter a valid 10-digit Indian mobile number.'),
            'mobile.unique' => __('This mobile number is already registered with another account.'),
        ]);

        $user = $request->user();

        // Prevent updating if already verified
        if ($user->mobile_verified_at) {
            return redirect()->intended($user->role?->dashboardUrl() ?? '/');
        }

        $cleanMobile = preg_replace('/[^0-9]/', '', $request->mobile);

        DB::transaction(function () use ($user, $cleanMobile, $otpService, $request) {
            $user->update([
                'mobile' => $cleanMobile,
            ]);

            // Issue a fresh OTP for the new number
            $otpService->generate($cleanMobile, 'registration', $request->ip());
        });

        return back()->with('status', __('Mobile number updated and new code sent.'));
    }
}

<?php

namespace App\Providers;

use App\Actions\Fortify\CreateNewUser;
use App\Actions\Fortify\ResetUserPassword;
use App\Http\Responses\LoginResponse;
use App\Http\Responses\RegisterResponse;
use App\Models\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\RegisterResponse as RegisterResponseContract;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse as TwoFactorLoginResponseContract;
use Laravel\Fortify\Features;
use Laravel\Fortify\Fortify;

class FortifyServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LoginResponseContract::class, LoginResponse::class);
        $this->app->singleton(TwoFactorLoginResponseContract::class, LoginResponse::class);
        $this->app->singleton(RegisterResponseContract::class, RegisterResponse::class);
    }

    public function boot(): void
    {
        $this->configureAuthentication();
        $this->configureActions();
        $this->configureViews();
        $this->configureRateLimiting();
    }

    private function configureAuthentication(): void
    {
        Fortify::authenticateUsing(function (Request $request) {
            $identifier = $request->input(Fortify::username()); // Now references 'login_id'

            $user = User::where('email', $identifier)
                ->orWhere('mobile', $identifier)
                ->first();

            if (! $user) {
                return null;
            }

            // 1. Self-Healing: Clear the lock if the penalty time has expired
            if ($user->locked_until && $user->locked_until->isPast()) {
                $user->update([
                    'locked_until' => null,
                    'failed_login_attempts' => 0,
                ]);
            }

            // 2. Enforcement: Block if currently locked
            if ($user->locked_until && $user->locked_until->isFuture()) {
                $remainingMinutes = (int) ceil(now()->diffInSeconds($user->locked_until) / 60);

                throw ValidationException::withMessages([
                    Fortify::username() => __('Account temporarily locked. Please try again in :minutes minute(s).', [
                        'minutes' => $remainingMinutes,
                    ]),
                ]);
            }

            // 3. Security: Check active/suspended status
            if (! $user->is_active || $user->is_suspended) {
                throw ValidationException::withMessages([
                    Fortify::username() => __('This account has been deactivated or suspended.'),
                ]);
            }

            // 4. Success: Passwords match
            if (Hash::check($request->password, $user->password)) {
                return $user;
            }

            // 5. Failure: Increment attempts and potentially lock
            $failedAttempts = $user->failed_login_attempts + 1;
            $updatePayload = ['failed_login_attempts' => $failedAttempts];

            if ($failedAttempts >= 5) {
                $updatePayload['locked_until'] = now()->addMinutes(15);
            }

            $user->update($updatePayload);

            return null; // Triggers Fortify's default "Invalid credentials" error
        });
    }

    private function configureActions(): void
    {
        Fortify::resetUserPasswordsUsing(ResetUserPassword::class);
        Fortify::createUsersUsing(CreateNewUser::class);
    }

    private function configureViews(): void
    {
        Fortify::loginView(fn (Request $request) => Inertia::render('auth/login', [
            'canResetPassword' => Features::enabled(Features::resetPasswords()),
            'status' => $request->session()->get('status'),
        ]));

        Fortify::resetPasswordView(fn (Request $request) => Inertia::render('auth/reset-password', [
            'email' => $request->email,
            'token' => $request->route('token'),
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ]));

        Fortify::requestPasswordResetLinkView(fn (Request $request) => Inertia::render('auth/forgot-password', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::verifyEmailView(fn (Request $request) => Inertia::render('auth/verify-email', [
            'status' => $request->session()->get('status'),
        ]));

        Fortify::registerView(fn () => Inertia::render('auth/register', [
            'passwordRules' => Password::defaults()->toPasswordRulesString(),
        ]));

        Fortify::twoFactorChallengeView(fn () => Inertia::render('auth/two-factor-challenge'));

        Fortify::confirmPasswordView(fn () => Inertia::render('auth/confirm-password'));
    }

    private function configureRateLimiting(): void
    {
        RateLimiter::for('two-factor', function (Request $request) {
            return Limit::perMinute(5)->by($request->session()->get('login.id'));
        });

        // Updated to use the dynamic username config ('login_id')
        RateLimiter::for('login', function (Request $request) {
            $identifier = (string) $request->input(Fortify::username());
            $throttleKey = Str::transliterate(Str::lower($identifier).'|'.$request->ip());

            return Limit::perMinute(5)->by($throttleKey);
        });

        RateLimiter::for('passkeys', function (Request $request) {
            return Limit::perMinute(10)->by(
                ($request->input('credential.id') ?: $request->session()->getId()).'|'.$request->ip(),
            );
        });
    }
}

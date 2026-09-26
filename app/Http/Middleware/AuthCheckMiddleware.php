<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthCheckMiddleware
{
    /**
     * Handle an incoming request.
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        // 1. Unauthenticated Check
        if (! Auth::check()) {
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return new JsonResponse(['success' => false, 'message' => 'Unauthenticated.'], Response::HTTP_UNAUTHORIZED);
            }

            return redirect()->guest(route('login'))->with('error', 'Please login to continue.');
        }

        $user = Auth::user();

        // 2. Extract Enum string value safely
        $userRole = $user->role instanceof \BackedEnum ? $user->role->value : (string) $user->role;

        // 3. Mobile Verification Check (allowing OTP routes and logout to prevent lockouts)
        if (! $user->mobile_verified_at && ! $request->routeIs('auth.otp.*', 'logout')) {
            if ($request->expectsJson() && ! $request->header('X-Inertia')) {
                return new JsonResponse(['success' => false, 'message' => 'Your mobile number is not verified.'], Response::HTTP_FORBIDDEN);
            }

            return redirect()->route('auth.otp.notice');
        }

        // 4. Role Authorization Check (comparing string to strings)
        if (empty($roles) || in_array($userRole, ['zero'], true) || in_array($userRole, $roles, true)) {
            return $next($request);
        }

        // 5. Forbidden Access
        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return new JsonResponse(['success' => false, 'message' => 'Unauthorized access.'], Response::HTTP_FORBIDDEN);
        }

        abort(Response::HTTP_FORBIDDEN, 'You do not have permission to access this resource.');
    }
}

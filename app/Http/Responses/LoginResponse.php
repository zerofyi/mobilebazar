<?php

namespace App\Http\Responses;

use Illuminate\Http\JsonResponse;
use Laravel\Fortify\Contracts\LoginResponse as LoginResponseContract;
use Laravel\Fortify\Contracts\TwoFactorLoginResponse as TwoFactorLoginResponseContract;
use Symfony\Component\HttpFoundation\Response;

class LoginResponse implements LoginResponseContract, TwoFactorLoginResponseContract
{
    public function toResponse($request): Response
    {
        $user = $request->user();
        $targetUrl = $user?->role?->dashboardUrl() ?? '/';

        if ($request->expectsJson() && ! $request->header('X-Inertia')) {
            return new JsonResponse(['two_factor' => false, 'redirect' => $targetUrl], Response::HTTP_OK);
        }

        return redirect()->intended($targetUrl);
    }
}

<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RoleRedirect
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if ($user === null) {
            return $next($request);
        }

        $destination = $user->role?->dashboardUrl() ?? '/';

        if ($request->getPathInfo() === $destination) {
            return $next($request);
        }

        return redirect()->to($destination);
    }
}

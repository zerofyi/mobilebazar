<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $user = $request->user();

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'auth' => [
                'user' => $user ? [
                    'id'                  => $user->id,
                    'uuid'                => $user->uuid,
                    'store_id'            => $user->store_id,
                    'name'                => $user->name,
                    'email'               => $user->email,
                    'mobile'              => $user->mobile,
                    'role'                => $user->role,
                    'avatar'              => $user->avatar,
                    'is_active'           => (bool) $user->is_active,
                    'is_suspended'        => (bool) $user->is_suspended,
                    'email_verified_at'   => $user->email_verified_at,
                    'mobile_verified_at'  => $user->mobile_verified_at,
                    'parent_id'           => $user->parent_id,
                    'created_at'          => $user->created_at?->toIso8601String(),
                    'updated_at'          => $user->updated_at?->toIso8601String(),
                    'permissions'  => $user->getAllPermissions()->pluck('name')->values()->toArray(),
                    'roles'        => $user->getRoleNames()->values()->toArray(),
                ] : null,
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error'   => fn () => $request->session()->get('error'),
                'info'    => fn () => $request->session()->get('info'),
                'warning' => fn () => $request->session()->get('warning'),
            ],
        ];
    }
}

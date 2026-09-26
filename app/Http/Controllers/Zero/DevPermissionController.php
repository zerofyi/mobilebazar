<?php

namespace App\Http\Controllers\Zero;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class DevPermissionController extends Controller
{
    public function index()
    {
        return Inertia::render('Zero/Dev/Permissions', [
            'permissions' => Permission::pluck('name'),
            'roles' => Role::with('permissions')->get()->map(fn ($role) => [
                'id' => $role->id,
                'name' => $role->name,
                'permissions' => $role->permissions->pluck('name'),
            ]),
            'users' => User::select('id', 'name', 'email', 'store_id')
                ->with(['roles', 'permissions'])
                ->get()
                ->map(fn ($user) => [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'store_id' => $user->store_id,
                    'roles' => $user->roles->pluck('name'),
                    // Direct permissions given to this user specifically
                    'direct_permissions' => $user->permissions->pluck('name'),
                    // Effective permissions (Roles + Direct combined)
                    'all_permissions' => $user->getAllPermissions()->pluck('name'),
                ]),
        ]);
    }

    public function storePermission(Request $request)
    {
        $request->validate(['name' => 'required|string|unique:permissions,name']);

        Permission::findOrCreate($request->name, 'web');
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        return back()->with('success', 'Permission created');
    }

    public function storeRole(Request $request)
    {
        $request->validate(['name' => 'required|string|unique:roles,name']);

        Role::findOrCreate($request->name, 'web');
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        return back()->with('success', 'Role created');
    }

    public function syncRolePermissions(Request $request)
    {
        $request->validate([
            'role_id' => 'required|exists:roles,id',
            'permissions' => 'array',
        ]);

        $role = Role::findById($request->role_id, 'web');
        $role->syncPermissions($request->permissions ?? []);

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        return back()->with('success', 'Role permissions updated');
    }

    // Assign standard Role to User
    public function assignRoleToUser(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'roles' => 'array',
        ]);

        $user = User::findOrFail($request->user_id);
        $user->syncRoles($request->roles ?? []);

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        return back()->with('success', 'User roles updated');
    }

    // Assign Direct Custom Permissions to single User (e.g., Salesman viewing purchase price)
    public function syncUserDirectPermissions(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'permissions' => 'array',
        ]);

        $user = User::findOrFail($request->user_id);
        $user->syncPermissions($request->permissions ?? []);

        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        return back()->with('success', 'User direct permissions updated');
    }
}

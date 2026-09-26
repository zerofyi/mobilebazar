// resources/js/Pages/Dev/Permissions.tsx

import { Head, router } from '@inertiajs/react';
import { useState } from 'react';

// Wayfind Route Imports
import zero, { dashboard } from '@/routes/zero';

interface Role {
  id: number;
  name: string;
  permissions: string[];
}

interface UserItem {
  id: number;
  name: string;
  email: string;
  store_id: number;
  roles: string[];
  direct_permissions: string[];
  all_permissions: string[];
}

interface DevPermissionsProps {
  permissions: string[];
  roles: Role[];
  users: UserItem[];
}

export default function DevPermissions({ permissions, roles, users }: DevPermissionsProps) {
  const [newPermission, setNewPermission] = useState('');
  const [newRole, setNewRole] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role | null>(roles[0] || null);
  const [selectedUser, setSelectedUser] = useState<UserItem | null>(users[0] || null);
  const [activeTab, setActiveTab] = useState<'roles' | 'users'>('roles');

  // Submit Handlers using Wayfind Route Helpers
  const handleCreatePermission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPermission) return;
    router.post(zero.permissions.store.url(), { name: newPermission }, {
      onSuccess: () => setNewPermission(''),
    });
  };

  const handleCreateRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRole) return;
    router.post(zero.roles.store.url(), { name: newRole }, {
      onSuccess: () => setNewRole(''),
    });
  };

  const handleToggleRolePermission = (perm: string) => {
    if (!selectedRole) return;
    const updated = selectedRole.permissions.includes(perm)
      ? selectedRole.permissions.filter((p) => p !== perm)
      : [...selectedRole.permissions, perm];

    setSelectedRole({ ...selectedRole, permissions: updated });
    router.post(zero.roles.sync.url(), { role_id: selectedRole.id, permissions: updated });
  };

  const handleToggleUserRole = (roleName: string) => {
    if (!selectedUser) return;
    const updatedRoles = selectedUser.roles.includes(roleName)
      ? selectedUser.roles.filter((r) => r !== roleName)
      : [...selectedUser.roles, roleName];

    setSelectedUser({ ...selectedUser, roles: updatedRoles });
    router.post(zero.users.assignRole.url(), { user_id: selectedUser.id, roles: updatedRoles });
  };

  const handleToggleUserDirectPermission = (perm: string) => {
    if (!selectedUser) return;
    const updatedPerms = selectedUser.direct_permissions.includes(perm)
      ? selectedUser.direct_permissions.filter((p) => p !== perm)
      : [...selectedUser.direct_permissions, perm];

    setSelectedUser({ ...selectedUser, direct_permissions: updatedPerms });
    router.post(zero.users.syncPermissions.url(), { user_id: selectedUser.id, permissions: updatedPerms });
  };

  return (
    <>
      <Head title="Role & Permission Management" />
      <div className="flex h-full flex-1 flex-col gap-4 overflow-x-auto rounded-xl p-4">

        {/* Navigation Tabs */}
        <div className="flex border-b pb-2 gap-4">
          <button
            onClick={() => setActiveTab('roles')}
            className={`pb-2 text-sm font-semibold border-b-2 ${
              activeTab === 'roles' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            1. System Roles & Permissions
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`pb-2 text-sm font-semibold border-b-2 ${
              activeTab === 'users' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            }`}
          >
            2. User Assignment (Roles & Direct Permissions)
          </button>
        </div>

        {/* TAB 1: ROLES & PERMISSIONS */}
        {activeTab === 'roles' && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-1">
            {/* Permission Creator */}
            <div className="flex flex-col gap-4 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold">Add Permission String</h2>
              <form onSubmit={handleCreatePermission} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. catalog.create"
                  value={newPermission}
                  onChange={(e) => setNewPermission(e.target.value)}
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none"
                />
                <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                  Create
                </button>
              </form>
              <div className="flex flex-wrap gap-1.5 mt-2 max-h-[300px] overflow-y-auto">
                {permissions.map((p) => (
                  <span key={p} className="rounded border px-2 py-0.5 text-xs font-mono bg-muted/30">
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Role List */}
            <div className="flex flex-col gap-4 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold">Roles</h2>
              <form onSubmit={handleCreateRole} className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. manager"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="flex-1 rounded-md border px-3 py-1.5 text-sm focus:outline-none"
                />
                <button type="submit" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                  Create
                </button>
              </form>
              <div className="flex flex-col gap-1">
                {roles.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRole(r)}
                    className={`flex justify-between items-center px-3 py-2 rounded-md text-sm text-left ${
                      selectedRole?.id === r.id ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-muted'
                    }`}
                  >
                    <span>{r.name}</span>
                    <span className="text-xs text-muted-foreground">{r.permissions.length} perms</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Role Scope Editor */}
            <div className="flex flex-col gap-4 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold">
                Permissions for Role: <span className="text-primary">{selectedRole?.name}</span>
              </h2>
              {selectedRole && (
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                  {permissions.map((p) => {
                    const checked = selectedRole.permissions.includes(p);
                    return (
                      <label key={p} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/50 border">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleRolePermission(p)}
                          className="rounded text-primary"
                        />
                        <span className="text-xs font-mono">{p}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: USER ASSIGNMENTS */}
        {activeTab === 'users' && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* User List */}
            <div className="flex flex-col gap-2 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold mb-2">Select User</h2>
              <div className="flex flex-col gap-1 max-h-[500px] overflow-y-auto">
                {users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={`flex flex-col p-2.5 rounded-md text-left border ${
                      selectedUser?.id === u.id ? 'border-primary bg-primary/5' : 'hover:bg-muted'
                    }`}
                  >
                    <span className="text-sm font-semibold">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                    <span className="text-[10px] mt-1 text-primary">Store ID: #{u.store_id}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Assign Role to Selected User */}
            <div className="flex flex-col gap-4 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold">
                Assign Roles to: <span className="text-primary">{selectedUser?.name}</span>
              </h2>
              {selectedUser && (
                <div className="flex flex-col gap-2">
                  {roles.map((r) => {
                    const hasRole = selectedUser.roles.includes(r.name);
                    return (
                      <label key={r.id} className="flex items-center justify-between p-2 rounded border cursor-pointer hover:bg-muted/50">
                        <span className="text-sm">{r.name}</span>
                        <input
                          type="checkbox"
                          checked={hasRole}
                          onChange={() => handleToggleUserRole(r.name)}
                          className="rounded text-primary"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Direct Custom Permissions Override */}
            <div className="flex flex-col gap-4 rounded-xl border p-4 bg-background">
              <h2 className="text-sm font-bold">
                Direct User Permissions (Overrides): <span className="text-primary">{selectedUser?.name}</span>
              </h2>
              {selectedUser && (
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto">
                  {permissions.map((p) => {
                    const isDirect = selectedUser.direct_permissions.includes(p);
                    const isInherited = selectedUser.all_permissions.includes(p) && !isDirect;

                    return (
                      <label key={p} className="flex items-center justify-between p-1.5 rounded border text-xs cursor-pointer hover:bg-muted/50">
                        <span className="font-mono">{p}</span>
                        <div className="flex items-center gap-2">
                          {isInherited && <span className="text-[10px] text-muted-foreground">(via role)</span>}
                          <input
                            type="checkbox"
                            checked={isDirect || isInherited}
                            disabled={isInherited}
                            onChange={() => handleToggleUserDirectPermission(p)}
                            className="rounded text-primary"
                          />
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}

// Layout Breadcrumbs using Wayfind Route Objects
DevPermissions.layout = {
  breadcrumbs: [
    {
      title: 'Dashboard',
      href: dashboard.url(),
    },
    {
      title: 'Permissions',
      href: zero.permissions.index.url(),
    },
  ],
};

'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AdminUser {
  id: string;
  display_name: string;
  role: 'visitor' | 'user' | 'moderator' | 'admin';
  is_active: boolean;
}

const ROLES: AdminUser['role'][] = ['user', 'moderator', 'admin'];

export default function UsersTable({ users: initial }: { users: AdminUser[] }) {
  const supabase = createClient();
  const [users, setUsers] = useState(initial);

  async function changeRole(user: AdminUser, role: AdminUser['role']) {
    await supabase.from('profiles').update({ role }).eq('id', user.id);
    setUsers(users.map((u) => (u.id === user.id ? { ...u, role } : u)));
  }

  async function toggleActive(user: AdminUser) {
    const isActive = !user.is_active;
    await supabase.from('profiles').update({ is_active: isActive }).eq('id', user.id);
    setUsers(users.map((u) => (u.id === user.id ? { ...u, is_active: isActive } : u)));
  }

  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left border-b border-gray-200 dark:border-gray-800">
          <th className="py-2 pr-4">Nombre</th>
          <th className="py-2 pr-4">Rol</th>
          <th className="py-2 pr-4">Estado</th>
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.id} className="border-b border-gray-100 dark:border-gray-900">
            <td className="py-2 pr-4">{u.display_name}</td>
            <td className="py-2 pr-4">
              <select
                value={u.role}
                onChange={(e) => changeRole(u, e.target.value as AdminUser['role'])}
                className="border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-2 py-1"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </td>
            <td className="py-2 pr-4">
              <button onClick={() => toggleActive(u)} className={u.is_active ? 'text-danger underline text-xs' : 'text-success underline text-xs'}>
                {u.is_active ? 'Desactivar' : 'Activar'}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

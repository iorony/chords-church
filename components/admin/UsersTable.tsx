'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface AdminUser { id: string; display_name: string; role: 'visitor' | 'user' | 'moderator' | 'admin'; is_active: boolean; }
const ROLES: AdminUser['role'][] = ['visitor', 'user', 'moderator', 'admin'];

export default function UsersTable({ users: initial, currentUserId, canManage }: { users: AdminUser[]; currentUserId: string; canManage: boolean }) {
  const supabase = createClient(); const [users, setUsers] = useState(initial); const [busy, setBusy] = useState<string | null>(null); const [error, setError] = useState<string | null>(null);
  async function update(user: AdminUser, changes: Partial<AdminUser>) {
    if (user.id === currentUserId && (changes.is_active === false || (changes.role && changes.role !== 'admin'))) { setError('No puedes desactivar tu propia cuenta ni quitarte el rol de administrador.'); return; }
    setBusy(user.id); setError(null); const { error: updateError } = await supabase.from('profiles').update(changes).eq('id', user.id); setBusy(null);
    if (updateError) { setError(updateError.message); return; } setUsers((current) => current.map((item) => item.id === user.id ? { ...item, ...changes } : item));
  }
  return <div className="space-y-3">{!canManage && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">Los moderadores pueden consultar usuarios; solo un administrador puede cambiar roles o estados.</p>}{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>}<div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800"><table className="w-full min-w-[560px] text-sm"><thead className="bg-gray-50 text-left dark:bg-gray-900"><tr><th className="p-3">Nombre</th><th className="p-3">Rol</th><th className="p-3">Estado</th></tr></thead><tbody className="divide-y divide-gray-100 dark:divide-gray-800">{users.map((user) => <tr key={user.id} className={!user.is_active ? 'opacity-60' : ''}><td className="p-3 font-medium">{user.display_name}{user.id === currentUserId && <span className="ml-2 text-xs text-gray-400">Tú</span>}</td><td className="p-3"><select value={user.role} disabled={!canManage || busy === user.id} onChange={(e) => update(user, { role: e.target.value as AdminUser['role'] })} className="rounded-lg border border-gray-300 bg-transparent px-2 py-1 disabled:opacity-60 dark:border-gray-700">{ROLES.map((role) => <option key={role} value={role}>{role}</option>)}</select></td><td className="p-3"><button disabled={!canManage || busy === user.id} onClick={() => update(user, { is_active: !user.is_active })} className={`${user.is_active ? 'text-red-600' : 'text-green-700'} underline disabled:cursor-not-allowed disabled:opacity-40`}>{busy === user.id ? 'Guardando...' : user.is_active ? 'Desactivar' : 'Activar'}</button></td></tr>)}</tbody></table></div></div>;
}

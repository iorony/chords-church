'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Permission = 'read' | 'edit';

type Member = {
  user_id: string;
  permission: Permission;
  profiles: { display_name: string } | { display_name: string }[] | null;
};

type UserResult = {
  user_id: string;
  display_name: string;
  email: string;
};

interface Props {
  setlistId: string;
  initialName: string;
  initialDescription: string | null;
  initialEventDate: string | null;
  initialLocation: string | null;
  initialVisibility: 'private' | 'link_only' | 'public';
  canEdit: boolean;
  isOwner: boolean;
  initialMembers: Member[];
}

function memberName(member: Member) {
  const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
  return profile?.display_name || 'Usuario registrado';
}

export default function SetlistSettings({
  setlistId,
  initialName,
  initialDescription,
  initialEventDate,
  initialLocation,
  initialVisibility,
  canEdit,
  isOwner,
  initialMembers
}: Props) {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription || '');
  const [eventDate, setEventDate] = useState(initialEventDate || '');
  const [location, setLocation] = useState(initialLocation || '');
  const [visibility, setVisibility] = useState(initialVisibility);
  const [members, setMembers] = useState(initialMembers);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'edit' | 'share' | 'delete'>('edit');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    const { error: updateError } = await supabase
      .from('setlists')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        event_date: eventDate || null,
        location: location.trim() || null,
        visibility
      })
      .eq('id', setlistId);
    setSaving(false);
    if (updateError) {
      setError('No se pudieron guardar los cambios de la lista.');
      return;
    }
    setMessage('Cambios guardados correctamente.');
    router.refresh();
  }

  async function searchUsers(event: FormEvent) {
    event.preventDefault();
    if (query.trim().length < 2) {
      setError('Escribe al menos 2 caracteres para buscar.');
      return;
    }
    setSearching(true);
    setError(null);
    const { data, error: searchError } = await supabase.rpc('search_shareable_users', { search_term: query.trim() });
    setSearching(false);
    if (searchError) {
      setError('No se pudieron buscar usuarios. Verifica que la migración 0018 esté aplicada.');
      return;
    }
    setResults((data || []) as UserResult[]);
  }

  async function addMember(user: UserResult, permission: Permission) {
    setError(null);
    const { error: addError } = await supabase
      .from('setlist_members')
      .upsert({ setlist_id: setlistId, user_id: user.user_id, permission }, { onConflict: 'setlist_id,user_id' });
    if (addError) {
      setError('No se pudo compartir la lista con este usuario.');
      return;
    }
    setMembers((current) => [
      ...current.filter((member) => member.user_id !== user.user_id),
      { user_id: user.user_id, permission, profiles: { display_name: user.display_name } }
    ]);
    setResults((current) => current.filter((result) => result.user_id !== user.user_id));
    setMessage(`Lista compartida con ${user.display_name}.`);
  }

  async function changePermission(userId: string, permission: Permission) {
    const { error: permissionError } = await supabase
      .from('setlist_members')
      .update({ permission })
      .eq('setlist_id', setlistId)
      .eq('user_id', userId);
    if (permissionError) {
      setError('No se pudo actualizar el permiso.');
      return;
    }
    setMembers((current) => current.map((member) => member.user_id === userId ? { ...member, permission } : member));
  }

  async function removeMember(userId: string) {
    const { error: removeError } = await supabase
      .from('setlist_members')
      .delete()
      .eq('setlist_id', setlistId)
      .eq('user_id', userId);
    if (removeError) {
      setError('No se pudo retirar el acceso del usuario.');
      return;
    }
    setMembers((current) => current.filter((member) => member.user_id !== userId));
  }

  async function deleteSetlist() {
    if (!window.confirm(`¿Eliminar definitivamente “${name}”? También se eliminarán sus canciones y permisos compartidos.`)) return;
    setDeleting(true);
    setError(null);
    const { error: deleteError } = await supabase.from('setlists').delete().eq('id', setlistId);
    if (deleteError) {
      setDeleting(false);
      setError('No se pudo eliminar la lista.');
      return;
    }
    router.push('/listas');
    router.refresh();
  }

  if (!canEdit && !isOwner) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => { setActiveSection('edit'); setOpen(true); }}
        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary transition hover:border-primary/40 hover:bg-primary/15 dark:border-accent-teal/20 dark:bg-accent-teal/10 dark:text-accent-teal"
        aria-haspopup="dialog"
      >
        <span aria-hidden="true">⚙</span>
        Administrar
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-gray-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="setlist-settings-title"
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-gray-200 bg-white shadow-2xl sm:max-w-xl sm:rounded-3xl dark:border-gray-800 dark:bg-gray-950"
          >
            <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-gray-100 bg-white/95 p-4 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 sm:px-6 sm:py-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-lg text-primary dark:bg-accent-teal/10 dark:text-accent-teal" aria-hidden="true">⚙</span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-primary dark:text-accent-teal">Administrar repertorio</p>
                <h2 id="setlist-settings-title" className="truncate text-lg font-bold">Administrar lista</h2>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full border border-gray-200 text-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-950 dark:border-gray-700 dark:hover:bg-gray-800 dark:hover:text-white" aria-label="Cerrar administración">×</button>
            </header>

            <nav className={`sticky top-[73px] z-10 grid gap-1 border-b border-gray-100 bg-white/95 p-2 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95 ${isOwner ? 'grid-cols-3' : 'grid-cols-1'}`} aria-label="Opciones de administración">
              <button type="button" onClick={() => { setActiveSection('edit'); setError(null); setMessage(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeSection === 'edit' ? 'bg-primary text-white shadow-sm dark:bg-accent-teal dark:text-gray-950' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-gray-800 dark:hover:text-white'}`}>Editar</button>
              {isOwner && <button type="button" onClick={() => { setActiveSection('share'); setError(null); setMessage(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeSection === 'share' ? 'bg-primary text-white shadow-sm dark:bg-accent-teal dark:text-gray-950' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-950 dark:hover:bg-gray-800 dark:hover:text-white'}`}>Compartir</button>}
              {isOwner && <button type="button" onClick={() => { setActiveSection('delete'); setError(null); setMessage(null); }} className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activeSection === 'delete' ? 'bg-red-600 text-white shadow-sm' : 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'}`}>Eliminar</button>}
            </nav>

            <div className="p-4 sm:p-6">

      {(error || message) && <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>{error || message}</div>}

      {canEdit && activeSection === 'edit' && (
        <form onSubmit={saveDetails} className="grid gap-4">
          <div><label htmlFor="edit-list-name" className="ui-label">Nombre</label><input id="edit-list-name" className="ui-input" value={name} onChange={(event) => setName(event.target.value)} required /></div>
          <div><label htmlFor="edit-list-description" className="ui-label">Descripción <span className="font-normal text-gray-400">(opcional)</span></label><textarea id="edit-list-description" className="ui-input min-h-24" value={description} onChange={(event) => setDescription(event.target.value)} /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div><label htmlFor="edit-list-date" className="ui-label">Fecha</label><input id="edit-list-date" type="date" className="ui-input" value={eventDate} onChange={(event) => setEventDate(event.target.value)} /></div>
            <div><label htmlFor="edit-list-location" className="ui-label">Lugar</label><input id="edit-list-location" className="ui-input" value={location} onChange={(event) => setLocation(event.target.value)} /></div>
            <div><label htmlFor="edit-list-visibility" className="ui-label">Visibilidad</label><select id="edit-list-visibility" className="ui-input" value={visibility} onChange={(event) => setVisibility(event.target.value as Props['initialVisibility'])}><option value="private">Privada</option><option value="link_only">Solo con enlace</option><option value="public">Pública</option></select></div>
          </div>
          <div><button type="submit" disabled={saving || !name.trim()} className="btn-primary">{saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </form>
      )}

      {isOwner && activeSection === 'share' && (
        <div>
          <h3 className="font-semibold">Compartir con usuarios registrados</h3>
          <p className="mt-1 text-sm text-gray-500">Busca por nombre o correo. “Lectura” permite usar y presentar la lista; “Edición” también permite cambiar canciones y datos.</p>
          <form onSubmit={searchUsers} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-input flex-1" placeholder="Nombre o correo del usuario" autoComplete="off" />
            <button type="submit" disabled={searching} className="btn-secondary">{searching ? 'Buscando...' : 'Buscar usuario'}</button>
          </form>

          {results.length > 0 && <ul className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-800 dark:border-gray-800">{results.map((user) => <li key={user.user_id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="font-semibold">{user.display_name}</div><div className="truncate text-xs text-gray-500">{user.email}</div></div><div className="flex gap-2"><button type="button" onClick={() => addMember(user, 'read')} className="btn-secondary">Dar lectura</button><button type="button" onClick={() => addMember(user, 'edit')} className="btn-primary">Dar edición</button></div></li>)}</ul>}

          <div className="mt-5 space-y-2">
            {members.length === 0 ? <p className="rounded-xl border border-dashed border-gray-300 p-4 text-sm text-gray-500 dark:border-gray-700">Esta lista todavía no se ha compartido con otros usuarios.</p> : members.map((member) => <div key={member.user_id} className="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 sm:flex-row sm:items-center dark:border-gray-800"><span className="flex-1 font-medium">{memberName(member)}</span><select value={member.permission} onChange={(event) => changePermission(member.user_id, event.target.value as Permission)} className="ui-input sm:w-36"><option value="read">Lectura</option><option value="edit">Edición</option></select><button type="button" onClick={() => removeMember(member.user_id)} className="btn-ghost text-red-600 hover:text-red-700">Quitar acceso</button></div>)}
          </div>
        </div>
      )}

              {isOwner && activeSection === 'delete' && <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 dark:border-red-900 dark:bg-red-950/25"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-red-100 text-xl text-red-700 dark:bg-red-950 dark:text-red-300" aria-hidden="true">!</span><h3 className="mt-4 text-lg font-bold text-red-700 dark:text-red-300">Eliminar esta lista</h3><p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-300">Se eliminarán permanentemente la lista, sus canciones asociadas y todos los accesos compartidos. Esta acción no se puede deshacer.</p><button type="button" onClick={deleteSetlist} disabled={deleting} className="btn-danger mt-5 w-full sm:w-auto">{deleting ? 'Eliminando...' : 'Eliminar lista definitivamente'}</button></div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function NewSetlistForm() {
  const supabase = createClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Debes iniciar sesión.');
      setSaving(false);
      return;
    }

    const { data, error } = await supabase
      .from('setlists')
      .insert({
        owner_id: user.id,
        name: name.trim(),
        event_date: eventDate || null,
        location: location.trim() || null,
        visibility: 'private',
        status: 'confirmed'
      })
      .select('id')
      .single();

    setSaving(false);
    if (error || !data) {
      console.error('Error creando la lista:', error);
      setError(`No se pudo crear la lista${error ? `: ${error.message}` : '.'}`);
      return;
    }

    router.push(`/listas/${data.id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/listas" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-primary">
        ← Volver a Mis listas
      </Link>

      <div className="grid overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950 lg:grid-cols-[0.8fr_1.2fr]">
        <aside className="bg-gradient-to-br from-primary to-primary-light p-6 text-white sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 text-2xl">♫</div>
          <h1 className="mt-6 text-3xl font-bold">Nueva lista</h1>
          <p className="mt-3 text-sm leading-6 text-white/80">
            Prepara un repertorio para un servicio, ensayo o evento y guarda el tono específico de cada canción.
          </p>
          <div className="mt-8 space-y-4 text-sm">
            <div className="flex gap-3"><span>✓</span><span>Ordena las canciones según el programa.</span></div>
            <div className="flex gap-3"><span>✓</span><span>Presenta la lista desde móvil o escritorio.</span></div>
            <div className="flex gap-3"><span>✓</span><span>Exporta el repertorio a PDF o DOCX.</span></div>
          </div>
        </aside>

        <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Información del repertorio</p>
            <h2 className="mt-1 text-2xl font-bold">Datos de la lista</h2>
            <p className="mt-1 text-sm text-gray-500">Podrás agregar y ordenar canciones después de crearla.</p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="setlist-name" className="mb-1.5 block text-sm font-semibold">Nombre de la lista</label>
            <input
              id="setlist-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Servicio del domingo"
              className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-gray-700"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="setlist-date" className="mb-1.5 block text-sm font-semibold">Fecha del evento</label>
              <input
                id="setlist-date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-gray-700"
              />
            </div>
            <div>
              <label htmlFor="setlist-location" className="mb-1.5 block text-sm font-semibold">Lugar <span className="font-normal text-gray-400">(opcional)</span></label>
              <input
                id="setlist-location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ej: Iglesia central"
                className="w-full rounded-xl border border-gray-300 bg-transparent px-4 py-3 outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-gray-700"
              />
            </div>
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
            La lista se creará como <strong>privada y confirmada</strong>. Luego podrás agregar canciones y compartirla según los permisos disponibles.
          </div>

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <Link href="/listas" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 font-semibold text-white shadow-sm transition hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
              {saving ? 'Creando lista...' : 'Crear lista'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

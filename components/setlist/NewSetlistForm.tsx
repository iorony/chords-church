'use client';

import { useState } from 'react';
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
        name,
        event_date: eventDate || null,
        location: location || null,
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
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <h1 className="text-2xl font-bold">Nueva lista</h1>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div>
        <label className="block text-sm mb-1">Nombre</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Servicio del domingo"
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Fecha del evento</label>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Lugar (opcional)</label>
        <input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
      >
        {saving ? 'Creando...' : 'Crear lista'}
      </button>
    </form>
  );
}

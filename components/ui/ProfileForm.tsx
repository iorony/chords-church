'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ProfileForm({
  initialDisplayName,
  initialChurchName,
  initialInstrument,
  email
}: {
  initialDisplayName: string;
  initialChurchName: string;
  initialInstrument: string;
  email: string;
}) {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [churchName, setChurchName] = useState(initialChurchName);
  const [instrument, setInstrument] = useState(initialInstrument);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ display_name: displayName, church_name: churchName, main_instrument: instrument })
        .eq('id', user.id);
      setSaved(true);
    }
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm mb-1">Correo</label>
        <input disabled value={email} className="w-full border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 rounded-md px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm mb-1">Nombre visible</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Iglesia (opcional)</label>
        <input
          value={churchName}
          onChange={(e) => setChurchName(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm mb-1">Instrumento principal (opcional)</label>
        <input
          value={instrument}
          onChange={(e) => setInstrument(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={saving}
        className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
      >
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
      {saved && <p className="text-success text-sm">Perfil actualizado.</p>}
    </form>
  );
}

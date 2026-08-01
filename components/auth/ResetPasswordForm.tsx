'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ResetPasswordForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/configuracion`
    });
    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="max-w-sm mx-auto text-center space-y-2">
        <h1 className="text-2xl font-bold">Revisa tu correo</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Si existe una cuenta con ese correo, te enviamos instrucciones para restablecer tu contraseña.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      <div>
        <label className="block text-sm mb-1">Correo electrónico</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
      >
        {loading ? 'Enviando...' : 'Enviar enlace'}
      </button>
    </form>
  );
}

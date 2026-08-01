'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function RegisterForm() {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${window.location.origin}/auth/callback`
      }
    });
    setLoading(false);
    if (error) {
      setError(error.message === 'User already registered' ? 'Ese correo ya está registrado.' : 'No se pudo crear la cuenta.');
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="max-w-sm mx-auto text-center space-y-3">
        <h1 className="text-2xl font-bold">Revisa tu correo</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm">
          Te enviamos un enlace de confirmación a <strong>{email}</strong>. Confírmalo para poder iniciar sesión.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold">Crear cuenta</h1>
      {error && <p className="text-danger text-sm">{error}</p>}
      <div>
        <label className="block text-sm mb-1">Nombre visible</label>
        <input
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
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
      <div>
        <label className="block text-sm mb-1">Contraseña</label>
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full bg-primary text-white py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
      >
        {loading ? 'Creando cuenta...' : 'Crear cuenta'}
      </button>
      <div className="text-sm text-gray-500 text-center">
        ¿Ya tienes cuenta? <Link href="/login" className="text-primary">Inicia sesión</Link>
      </div>
    </form>
  );
}

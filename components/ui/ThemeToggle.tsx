'use client';

import { useEffect, useState } from 'react';

/**
 * Alterna entre tema claro/oscuro. Al montar, respeta la preferencia
 * guardada en localStorage si existe; si no, sigue el tema del sistema
 * (ver el script inline en layout.tsx que evita el parpadeo inicial).
 * La preferencia elegida se guarda y persiste entre visitas.
 */
export default function ThemeToggle() {
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    setIsDark(next);
  }

  if (isDark === null) return <div className="w-8 h-8" />;

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={isDark ? 'Tema claro' : 'Tema oscuro'}
      className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  );
}

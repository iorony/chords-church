'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/admin', 'Dashboard'], ['/admin/canciones', 'Canciones'], ['/admin/usuarios', 'Usuarios'],
  ['/admin/moderacion', 'Moderación'], ['/admin/ia', 'IA'], ['/admin/fuentes', 'Fuentes'],
  ['/admin/configuracion', 'Configuración'], ['/admin/contacto', 'Contacto']
] as const;

export default function AdminNav() {
  const pathname = usePathname();
  return <nav aria-label="Administración" className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-2 text-sm dark:border-gray-800 dark:bg-gray-950 md:sticky md:top-20 md:block md:space-y-1 md:self-start">
    {LINKS.map(([href, label]) => {
      const active = href === '/admin' ? pathname === href : pathname.startsWith(href);
      return <Link key={href} href={href} className={`block whitespace-nowrap rounded-lg px-3 py-2 font-medium transition ${active ? 'bg-primary text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}>{label}</Link>;
    })}
  </nav>;
}

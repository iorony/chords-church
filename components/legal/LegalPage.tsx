import Link from 'next/link';

export const LEGAL_LINKS = [
  { href: '/aviso-legal', label: 'Aviso legal' },
  { href: '/terminos', label: 'Términos' },
  { href: '/privacidad', label: 'Privacidad' },
  { href: '/derechos-de-autor', label: 'Derechos de autor' },
  { href: '/licencias', label: 'Licencias' },
  { href: '/contacto', label: 'Contacto' }
];

export default function LegalPage({ title, updated = '31 de julio de 2026', children }: { title: string; updated?: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="h-fit rounded-xl border border-gray-200 p-4 dark:border-gray-800 lg:sticky lg:top-24">
        <p className="mb-3 text-sm font-semibold">Información legal</p>
        <nav className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 lg:grid-cols-1">
          {LEGAL_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-md px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-900">
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-950 sm:p-8">
        <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-xs text-gray-500">Última actualización: {updated}</p>
        <div className="legal-content mt-8 space-y-7 text-sm leading-7 sm:text-base">{children}</div>
      </article>
    </div>
  );
}

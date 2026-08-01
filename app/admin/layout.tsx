import Link from 'next/link';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/canciones', label: 'Canciones' },
  { href: '/admin/usuarios', label: 'Usuarios' },
  { href: '/admin/moderacion', label: 'Moderación' },
  { href: '/admin/ia', label: 'IA' },
  { href: '/admin/fuentes', label: 'Fuentes' },
  { href: '/admin/configuracion', label: 'Configuración' },
  { href: '/admin/contacto', label: 'Contacto' }
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid md:grid-cols-[180px_1fr] gap-8">
      <nav className="space-y-1 text-sm">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
            {l.label}
          </Link>
        ))}
      </nav>
      <div>{children}</div>
    </div>
  );
}

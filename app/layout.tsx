import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import NavAuthStatus from '@/components/ui/NavAuthStatus';
import MobileNavigation from '@/components/ui/MobileNavigation';
import ThemeToggle from '@/components/ui/ThemeToggle';

const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: 'Cancionero — Acordes para iglesias',
  description: 'Plataforma colaborativa de canciones y acordes para equipos de alabanza'
};

const NAV_LINKS = [
  { href: '/canciones', label: 'Canciones' },
  { href: '/artistas', label: 'Artistas' },
  { href: '/listas', label: 'Mis listas' },
  { href: '/favoritos', label: 'Favoritos' },
  { href: '/canciones/nueva', label: 'Agregar canción' }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('role, display_name').eq('id', user.id).single();
    role = profile?.role ?? null;
  }

  const links = [
    ...NAV_LINKS,
    ...((role === 'admin' || role === 'moderator')
      ? [{ href: '/admin', label: 'Administración' }]
      : [])
  ];

  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col overflow-x-hidden">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <header className="sticky top-0 z-40 border-b border-gray-200 bg-bg-light/95 backdrop-blur dark:border-gray-800 dark:bg-bg-dark/95">
          <div className="app-container flex min-h-16 items-center justify-between gap-3 py-3">
            <Link href="/" className="shrink-0 font-bold text-lg text-primary dark:text-accent-teal">
              🎵 Cancionero
            </Link>

            <nav className="hidden md:flex items-center gap-4 lg:gap-5 text-sm">
              {links.map((link) => (
                <Link key={link.href} href={link.href} className="whitespace-nowrap hover:text-primary dark:hover:text-accent-teal">
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="hidden md:flex items-center gap-3 min-w-0">
              <ThemeToggle />
              <NavAuthStatus />
            </div>
            <div className="flex items-center gap-1 md:hidden">
              <ThemeToggle />
              <MobileNavigation links={links} />
            </div>
          </div>
        </header>

        <main className="app-container flex-1 py-5 sm:py-7">{children}</main>

        <footer className="border-t border-gray-200 dark:border-gray-800">
          <div className="app-container py-7 text-sm text-gray-500">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p>© 2026 Cancionero — canciones y acordes para iglesias</p>
              <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                <Link href="/aviso-legal">Aviso legal</Link><Link href="/terminos">Términos</Link><Link href="/privacidad">Privacidad</Link><Link href="/derechos-de-autor">Derechos de autor</Link><Link href="/licencias">Licencias</Link><Link href="/contacto">Contacto</Link>
              </nav>
            </div>
            <p className="mt-4 text-center text-[11px] md:text-left">La información publicada no sustituye asesoría jurídica profesional.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}

import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import NavAuthStatus from '@/components/ui/NavAuthStatus';
import MobileNavigation from '@/components/ui/MobileNavigation';
import ThemeToggle from '@/components/ui/ThemeToggle';
import NavigationProgress from '@/components/ui/NavigationProgress';
import DesktopNavigation from '@/components/ui/DesktopNavigation';

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
      <body className="min-h-screen flex flex-col overflow-x-hidden antialiased">
        <NavigationProgress />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-bg-light/90 shadow-[0_1px_0_rgba(15,23,42,.03)] backdrop-blur-xl dark:border-gray-800 dark:bg-bg-dark/90">
          <div className="app-container flex min-h-[4.5rem] items-center justify-between gap-3 py-3">
            <Link href="/" className="group flex shrink-0 items-center gap-2.5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-lg text-white shadow-sm transition-transform group-hover:-rotate-3 dark:bg-accent-teal dark:text-gray-950">♪</span>
              <span className="hidden sm:block">
                <span className="block text-base font-extrabold tracking-tight text-gray-950 dark:text-white">Cancionero</span>
                <span className="block text-[10px] font-medium uppercase tracking-[.16em] text-gray-400">Acordes para iglesias</span>
              </span>
            </Link>

            <DesktopNavigation links={links} />

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

        <main className="app-container flex-1 py-6 sm:py-8 lg:py-10">{children}</main>

        <footer className="mt-8 border-t border-gray-200/80 bg-white/50 dark:border-gray-800 dark:bg-gray-950/30">
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

import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import NavAuthStatus from '@/components/ui/NavAuthStatus';
import MobileNavigation from '@/components/ui/MobileNavigation';
import ThemeToggle from '@/components/ui/ThemeToggle';
import DesktopNavigation from '@/components/ui/DesktopNavigation';
import BrandMark from '@/components/ui/BrandMark';
import { BRAND } from '@/lib/branding';

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
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description
};

const NAV_LINKS = [
  { href: '/canciones', label: 'Canciones' },
  { href: '/listas', label: 'Mis listas' },
  { href: '/favoritos', label: 'Favoritos' },
  { href: '/canciones/nueva', label: 'Agregar canción' }
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

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
      <body className="clay-app min-h-screen flex flex-col overflow-x-hidden antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <header className="clay-header sticky top-0 z-40 backdrop-blur-xl">
          <div className="app-container flex min-h-[4.75rem] items-center justify-between gap-3 py-3">
            <Link href="/" className="brand-lockup group shrink-0" aria-label={`${BRAND.name}, inicio`}>
              <BrandMark />
              <span className="hidden sm:block">
                <span className="brand-name">{BRAND.name}</span>
                <span className="brand-tagline">{BRAND.tagline}</span>
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

        <main className="app-container flex-1 py-7 sm:py-10 lg:py-12">{children}</main>

        <footer className="clay-footer mt-10">
          <div className="app-container py-8 text-sm text-gray-500">
            <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
              <p>© 2026 {BRAND.name} — canciones y acordes para iglesias</p>
              <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
                <Link href="/aviso-legal">Aviso legal</Link><Link href="/terminos">Términos</Link><Link href="/privacidad">Privacidad</Link><Link href="/derechos-de-autor">Derechos de autor</Link><Link href="/licencias">Licencias</Link><Link href="/contacto">Contacto</Link>
              </nav>
            </div>
            <p className="mt-4 text-center text-[11px] md:text-left">Las letras y los acordes pertenecen a sus respectivos autores y titulares de derechos.</p>
          </div>
        </footer>
        <div id="mobile-navigation-root" />
      </body>
    </html>
  );
}

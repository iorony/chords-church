'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavLink = { href: string; label: string };

export default function DesktopNavigation({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-1 rounded-xl border border-gray-200/80 bg-white/70 p-1 text-sm shadow-sm backdrop-blur md:flex dark:border-gray-800 dark:bg-gray-900/70" aria-label="Navegación principal">
      {links.map((link) => {
        const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`));
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-2 font-medium transition-colors ${
              active
                ? 'bg-primary text-white shadow-sm dark:bg-accent-teal dark:text-gray-950'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-950 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

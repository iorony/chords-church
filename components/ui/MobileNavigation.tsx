'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import NavAuthStatus from '@/components/ui/NavAuthStatus';

type NavLink = { href: string; label: string };

export default function MobileNavigation({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const menu = open ? (
    <div
      className="fixed inset-0 z-[9999] bg-slate-950/65 backdrop-blur-sm"
      onClick={() => setOpen(false)}
      role="presentation"
    >
      <aside
        className="absolute right-0 top-0 flex h-[100dvh] w-[min(88vw,23rem)] flex-col overflow-y-auto border-l border-gray-200 bg-bg-light shadow-2xl dark:border-gray-800 dark:bg-bg-dark"
        onClick={(event) => event.stopPropagation()}
        aria-label="Menú principal"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-bg-light px-5 py-4 dark:border-gray-800 dark:bg-bg-dark">
          <span className="flex items-center gap-2.5 font-bold text-gray-950 dark:text-white"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-white dark:bg-accent-teal dark:text-gray-950">♪</span>Cancionero</span>
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setOpen(false)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-300 bg-white text-xl shadow-sm dark:border-gray-700 dark:bg-gray-950"
          >
            ×
          </button>
        </div>

        <nav className="flex flex-col gap-2 px-5 py-4">
          {links.map((link) => {
            const active = pathname === link.href || (link.href !== '/' && pathname.startsWith(`${link.href}/`));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-3 text-sm font-medium ${
                  active ? 'bg-primary text-white shadow-sm dark:bg-accent-teal dark:text-gray-950' : 'border border-transparent text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-900'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <NavAuthStatus mobile />
        </div>
      </aside>
    </div>
  ) : null;

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-300 bg-white text-xl shadow-sm dark:border-gray-700 dark:bg-gray-950"
      >
        {open ? '×' : '☰'}
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}

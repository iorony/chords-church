'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface SetlistOverviewItem {
  id: string;
  name: string;
  event_date: string | null;
  location: string | null;
  visibility: string;
  songCount: number;
  isShared: boolean;
  sharedPermission: string | null;
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha definida';
  return new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${value}T00:00:00Z`));
}

function normalize(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
}

function accessLabel(item: SetlistOverviewItem) {
  if (item.isShared) return 'Compartida contigo';
  if (item.visibility === 'public') return 'Pública';
  if (item.visibility === 'link_only') return 'Solo con enlace';
  return 'Privada';
}

function SharedBadge({ item }: { item: SetlistOverviewItem }) {
  if (!item.isShared) return null;
  return <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 ring-1 ring-inset ring-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:ring-blue-900">{item.sharedPermission === 'edit' ? 'Compartida · edición' : 'Compartida · lectura'}</span>;
}

function CompactList({ items, title }: { items: SetlistOverviewItem[]; title: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950">
      <div className="border-b border-gray-100 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-800">{title}</div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item) => (
          <Link key={item.id} href={`/listas/${item.id}`} className="group grid gap-2 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-900/60 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h3 className="truncate font-semibold group-hover:text-primary">{item.name}</h3><SharedBadge item={item} /></div>
              <p className="mt-0.5 truncate text-xs text-gray-500 sm:hidden">{formatDate(item.event_date)} · {item.location || 'Sin lugar'}</p>
            </div>
            <span className="hidden whitespace-nowrap text-sm text-gray-500 sm:block">{formatDate(item.event_date)}</span>
            <span className="hidden max-w-48 truncate text-sm text-gray-500 sm:block">{item.location || 'Sin lugar'}</span>
            <span className="whitespace-nowrap text-sm font-semibold text-primary">{item.songCount} {item.songCount === 1 ? 'canción' : 'canciones'} →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function SetlistOverview({ setlists }: { setlists: SetlistOverviewItem[] }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = normalize(query);
  const recent = setlists.slice(0, 3);
  const remaining = setlists.slice(3);
  const matches = useMemo(() => normalizedQuery ? setlists.filter((item) => normalize(`${item.name} ${item.location || ''} ${formatDate(item.event_date)}`).includes(normalizedQuery)) : [], [normalizedQuery, setlists]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-lg font-semibold">Tus repertorios</h2><p className="text-sm text-gray-500">Incluye tus listas y las que otros usuarios compartieron contigo.</p></div>
        <div className="relative w-full sm:max-w-sm">
          <label htmlFor="setlist-search" className="sr-only">Buscar repertorios</label>
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">⌕</span>
          <input id="setlist-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar repertorios..." className="min-h-11 w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 dark:border-gray-700 dark:bg-gray-950" />
        </div>
      </div>

      {!normalizedQuery && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {recent.map((item) => (
            <Link key={item.id} href={`/listas/${item.id}`} className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg dark:border-gray-800 dark:bg-gray-950 dark:hover:border-primary/60">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary to-accent-teal opacity-70 transition group-hover:opacity-100" />
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-lg font-semibold group-hover:text-primary">{item.name}</h3><p className="mt-1 text-sm text-gray-500">{formatDate(item.event_date)}</p></div><SharedBadge item={item} /></div>
              <div className="mt-5 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900"><div className="text-xs text-gray-500">Canciones</div><div className="mt-0.5 font-semibold">{item.songCount}</div></div>
                <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-900"><div className="text-xs text-gray-500">Lugar</div><div className="mt-0.5 truncate font-semibold">{item.location || 'Sin definir'}</div></div>
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4 text-sm dark:border-gray-800"><span className="text-gray-500">{accessLabel(item)}</span><span className="font-semibold text-primary transition group-hover:translate-x-1">Abrir →</span></div>
            </Link>
          ))}
        </div>
      )}

      {normalizedQuery ? (
        matches.length ? <CompactList items={matches} title={`${matches.length} resultado${matches.length === 1 ? '' : 's'}`} /> : <div className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">No se encontraron repertorios para “{query.trim()}”.</div>
      ) : remaining.length ? <CompactList items={remaining} title="Repertorios anteriores" /> : null}
    </section>
  );
}

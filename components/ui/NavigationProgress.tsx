'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Indicador global para navegaciones del App Router.
 * Muestra una barra superior inmediatamente y una tarjeta solo si la carga tarda.
 */
export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const panelTimer = useRef<number | null>(null);
  const safetyTimer = useRef<number | null>(null);

  function clearTimers() {
    if (panelTimer.current) window.clearTimeout(panelTimer.current);
    if (safetyTimer.current) window.clearTimeout(safetyTimer.current);
    panelTimer.current = null;
    safetyTimer.current = null;
  }

  function start() {
    clearTimers();
    setLoading(true);
    setShowPanel(false);
    panelTimer.current = window.setTimeout(() => setShowPanel(true), 650);
    // Protección ante una navegación cancelada o un error inesperado.
    safetyTimer.current = window.setTimeout(() => {
      setLoading(false);
      setShowPanel(false);
    }, 15000);
  }

  function finish() {
    clearTimers();
    setShowPanel(false);
    window.setTimeout(() => setLoading(false), 180);
  }

  useEffect(() => {
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest('a');
      if (!anchor) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const current = `${window.location.pathname}${window.location.search}`;
      const next = `${destination.pathname}${destination.search}`;
      if (current === next) return;

      start();
    };

    const onPopState = () => start();
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!loading) return null;

  return (
    <>
      <div className="route-progress-track" aria-hidden="true">
        <div className="route-progress-bar" />
      </div>
      {showPanel && (
        <div className="route-progress-panel" role="status" aria-live="polite">
          <span className="route-progress-mini-animation" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>Cargando página…</strong>
            <p>Estamos preparando el contenido.</p>
          </div>
        </div>
      )}
    </>
  );
}

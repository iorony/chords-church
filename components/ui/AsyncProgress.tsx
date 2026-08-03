'use client';

import { useEffect, useMemo, useState } from 'react';

type AsyncProgressProps = {
  mode?: 'ai' | 'local' | 'saving';
  title?: string;
};

export default function AsyncProgress({ mode = 'ai', title }: AsyncProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsed(Date.now() - startedAt), 180);
    return () => window.clearInterval(timer);
  }, []);

  const config = useMemo(() => {
    if (mode === 'local') {
      return {
        heading: title || 'Estructurando la canción localmente',
        steps: ['Leyendo acordes y progresiones', 'Reconociendo secciones', 'Validando el contenido'],
        thresholds: [0, 450, 900]
      };
    }
    if (mode === 'saving') {
      return {
        heading: title || 'Guardando la canción',
        steps: ['Validando datos', 'Guardando contenido', 'Preparando la vista'],
        thresholds: [0, 450, 900]
      };
    }
    return {
      heading: title || 'Analizando y estructurando con IA',
      steps: ['Comprobando canciones existentes', 'Analizando bloques y secciones', 'Validando acordes y contenido', 'Preparando la vista previa'],
      thresholds: [0, 650, 1800, 3200]
    };
  }, [mode, title]);

  const activeStep = config.thresholds.reduce((current, threshold, index) => elapsed >= threshold ? index : current, 0);
  const progress = Math.min(92, Math.round(12 + 80 * (1 - Math.exp(-elapsed / (mode === 'ai' ? 3400 : 1400)))));

  return (
    <div className="async-progress-card" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="progress-music-animation" aria-hidden="true">
          <span className="progress-note">♫</span>
          <span className="progress-equalizer">
            <i />
            <i />
            <i />
            <i />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">{config.heading}</h2>
            <span className="text-xs tabular-nums text-gray-500">{progress}%</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">Esto puede tardar unos segundos. No cierres esta página.</p>
        </div>
      </div>

      <div className="async-progress-track" aria-hidden="true">
        <div className="async-progress-fill" style={{ width: `${progress}%` }}>
          <span className="async-progress-shine" />
        </div>
      </div>

      <ol className="mt-4 space-y-2 text-sm">
        {config.steps.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          return (
            <li key={step} className={`flex items-center gap-2 ${active ? 'font-medium text-primary dark:text-accent-teal' : done ? 'text-gray-600 dark:text-gray-300' : 'text-gray-400'}`}>
              <span className={`async-progress-step ${done ? 'is-done' : active ? 'is-active' : ''}`}>
                {done ? '✓' : index + 1}
              </span>
              {step}{active && <span className="loading-dots" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

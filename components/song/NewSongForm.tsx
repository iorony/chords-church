'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { renderSections } from '@/lib/chords/structure-parser';
import { ALL_KEYS_GENERAL } from '@/lib/chords/transposition';
import ChordChart from './ChordChart';
import type { AiReviewResponse } from '@/lib/ai/schema';
import { toProperName, toProperTitle } from '@/lib/services/text-utils';

type Step = 'form' | 'reviewing' | 'compare';
type ReviewMode = 'ai' | 'local';

export default function NewSongForm() {
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [reviewMode, setReviewMode] = useState<ReviewMode>('ai');
  const [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const [duplicateMatch, setDuplicateMatch] = useState<{ id: string; slug: string; title: string; artist?: string | null; promotedToPublic?: boolean; sharedListAccess?: boolean; canProposeCorrection?: boolean } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  const [aiResult, setAiResult] = useState<AiReviewResponse | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [useCorrected, setUseCorrected] = useState(true);
  const [alternateKey, setAlternateKey] = useState<{ key: string; confidence: number; isMinor: boolean } | null>(null);
  const [selectedKey, setSelectedKey] = useState('');

  async function checkExistingSong(
    candidate: { title: string; artist: string; content?: string },
    options: { promote?: boolean; silent?: boolean } = {}
  ) {
    const duplicateResponse = await fetch('/api/songs/duplicates', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...candidate, promote: Boolean(options.promote) })
    });
    const duplicateData = await duplicateResponse.json();
    if (!duplicateResponse.ok) {
      throw new Error(duplicateData.error || 'No se pudo comprobar si la canción ya existe.');
    }

    if (duplicateData.duplicate && duplicateData.duplicates?.length) {
      const match = duplicateData.duplicates[0];
      setDuplicateMatch(match);
      if (!options.silent) setError(
        match.promotedToPublic
          ? `La canción “${match.title}”${match.artist ? ` de ${match.artist}` : ''} ya existía como privada. Como no tenías acceso mediante una lista compartida, ahora es pública y puedes abrirla o proponer una corrección.`
          : match.sharedListAccess
            ? `La canción “${match.title}”${match.artist ? ` de ${match.artist}` : ''} ya existe y permanece privada porque tienes acceso mediante una lista compartida.`
            : `Esta canción ya está registrada como “${match.title}”${match.artist ? ` de ${match.artist}` : ''}. Usa la canción existente en lugar de crear otra copia.`
      );
      return match;
    }

    setDuplicateMatch(null);
    if (!options.silent) setError(null);
    return null;
  }

  useEffect(() => {
    const normalizedTitle = title.trim();
    const normalizedArtist = artist.trim();

    if (!normalizedTitle || !normalizedArtist) {
      setDuplicateMatch(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setCheckingDuplicate(true);
      try {
        await checkExistingSong(
          { title: normalizedTitle, artist: normalizedArtist, content },
          { promote: false, silent: false }
        );
      } catch {
        // La comprobación definitiva se repite al analizar.
      } finally {
        setCheckingDuplicate(false);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [title, artist, content]);

  async function openExistingSong(asProposal = false) {
    if (!duplicateMatch) return;

    setCheckingDuplicate(true);
    setError(null);

    try {
      // La vista previa no publica canciones privadas. Al abrirla, se repite la
      // comprobación con promote=true para aplicar la regla de reutilización.
      const resolved = await checkExistingSong(
        {
          title: toProperTitle(title),
          artist: toProperName(artist),
          content
        },
        { promote: true, silent: true }
      );

      const match = resolved || duplicateMatch;
      if (asProposal) {
        // La ruta de edición recibe el ID, no el slug.
        router.push(`/canciones/${match.id}/editar?proposal=1`);
      } else {
        router.push(`/canciones/${match.slug}`);
      }
      router.refresh();
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'No se pudo abrir la canción existente.');
    } finally {
      setCheckingDuplicate(false);
    }
  }

  async function handleReview() {
    setError(null);
    setDuplicateMatch(null);
    if (!title.trim()) {
      setError('El título de la canción es obligatorio.');
      return;
    }
    if (!artist.trim()) {
      setError('El artista de la canción es obligatorio.');
      return;
    }
    if (!content.trim()) {
      setError('Pega la letra (con o sin acordes) antes de continuar.');
      return;
    }
    setStep('reviewing');
    try {
      const existing = await checkExistingSong(
        { title: toProperTitle(title), artist: toProperName(artist), content },
        { promote: true }
      );
      if (existing) {
        setStep('form');
        return;
      }

      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: toProperTitle(title), artist: toProperName(artist), content, mode: reviewMode })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo revisar la canción.');
        setStep('form');
        return;
      }
      setAiResult(data.result);
      setSelectedKey(data.result.detectedKey || 'C');
      setAiAvailable(data.aiAvailable);
      setAiWarning(reviewMode === 'ai' ? data.error : null);
      setAlternateKey(data.alternateKey ?? null);

      const reviewedContent = renderSections(data.result.sections as any);
      const reviewedTitle = toProperTitle(title || data.result.detectedTitle || 'Sin título');
      const reviewedArtist = toProperName(artist || data.result.detectedArtist || '');
      try {
        await checkExistingSong({
          title: reviewedTitle,
          artist: reviewedArtist,
          content: reviewedContent || content
        }, { promote: true });
      } catch (duplicateError: any) {
        setError(duplicateError?.message || 'No se pudo comprobar si la canción ya existe.');
      }

      setStep('compare');
    } catch (reviewError: any) {
      setError(
        reviewError?.message ||
          (reviewMode === 'ai'
            ? 'Error de conexión al revisar con IA.'
            : 'Error de conexión al revisar localmente.')
      );
      setStep('form');
    }
  }

  const correctedContent = aiResult ? renderSections(aiResult.sections as any) : '';

  function useAlternateKey() {
    if (!alternateKey) return;
    setSelectedKey(`${alternateKey.key}${alternateKey.isMinor ? 'm' : ''}`);
  }

  async function resolveArtistId(name: string): Promise<string | null> {
    const displayName = toProperName(name);
    if (!displayName) return null;

    const normalized = displayName
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const { data: existing, error: lookupError } = await supabase
      .from('artists')
      .select('id')
      .eq('normalized_name', normalized)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing.id;

    const slugBase = normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'artista';
    const { data: created, error: createError } = await supabase
      .from('artists')
      .insert({
        name: displayName,
        slug: `${slugBase}-${Date.now().toString(36)}`,
        normalized_name: normalized
      })
      .select('id')
      .single();
    if (createError) throw createError;
    return created.id;
  }

  async function handleSave(publish: boolean) {
    setSaving(true);
    setError(null);

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setError('Debes iniciar sesión.');
      setSaving(false);
      return;
    }

    const finalTitle = toProperTitle(title || aiResult?.detectedTitle || 'Sin título');
    const finalArtist = toProperName(artist || aiResult?.detectedArtist || '');
    const finalContent = useCorrected ? correctedContent : content;

    try {
      const match = await checkExistingSong({
        title: finalTitle,
        artist: finalArtist,
        content: finalContent
      }, { promote: true });
      if (match) {
        setSaving(false);
        return;
      }
    } catch (duplicateError: any) {
      setSaving(false);
      setError(duplicateError?.message || 'No se pudo comprobar si la canción ya existe.');
      return;
    }

    const slugBase = finalTitle
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const slug = `${slugBase}-${Date.now().toString(36)}`;

    let artistId: string | null = null;
    try {
      artistId = await resolveArtistId(finalArtist);
    } catch (artistError: any) {
      setSaving(false);
      setError(`No se pudo guardar el artista: ${artistError?.message || 'error desconocido'}`);
      return;
    }

    const { data: song, error: insertError } = await supabase
      .from('songs')
      .insert({
        title: finalTitle,
        artist_id: artistId,
        slug,
        normalized_title: slugBase.replace(/-/g, ' '),
        original_key: selectedKey || aiResult?.detectedKey || 'C',
        detected_key: selectedKey || aiResult?.detectedKey || 'C',
        key_confidence: aiResult?.keyConfidence ?? null,
        content: finalContent,
        original_content: content,
        visibility,
        status: publish ? 'published' : 'draft',
        source_type: reviewMode === 'ai' ? 'ai_structured' : 'manual',
        created_by: user.id,
        published_at: publish ? new Date().toISOString() : null
      })
      .select('id, slug')
      .single();

    setSaving(false);

    if (insertError || !song) {
      console.error('Error guardando la canción:', insertError);
      setError(
        insertError
          ? `No se pudo guardar la canción: ${insertError.message}${
              insertError.hint ? ` (${insertError.hint})` : ''
            }`
          : 'No se pudo guardar la canción. Verifica los datos e intenta de nuevo.'
      );
      return;
    }

    // Registra la versión 1 en el historial (no bloquea la navegación si falla)
    const { error: versionError } = await supabase.rpc('save_song_version', {
      target_song_id: song.id,
      new_content: finalContent,
      new_key: selectedKey || aiResult?.detectedKey || 'C',
      summary: 'Versión inicial'
    });
    if (versionError) console.error('No se pudo registrar la versión inicial:', versionError);

    router.push(`/canciones/${song.slug}`);
  }

  if (step === 'form') {
    return (
      <div className="w-full max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold">Agregar canción</h1>
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
            <p className="text-danger">{error}</p>
            {duplicateMatch && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openExistingSong(false)}
                  disabled={checkingDuplicate}
                  className="rounded-md border border-primary px-3 py-1.5 text-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  {checkingDuplicate ? 'Comprobando...' : 'Abrir canción existente'}
                </button>
                {(duplicateMatch.canProposeCorrection || duplicateMatch.promotedToPublic || !duplicateMatch.sharedListAccess) && (
                  <button
                    type="button"
                    onClick={() => openExistingSong(true)}
                    disabled={checkingDuplicate}
                    className="rounded-md bg-primary px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50"
                  >
                    Proponer corrección
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1">Título <span className="text-danger">*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitle((value) => toProperTitle(value))}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
              placeholder="Título de la canción"
              required
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Artista <span className="text-danger">*</span></label>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              onBlur={() => setArtist((value) => toProperName(value))}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
              placeholder="Nombre del artista"
              required
            />
          </div>
        </div>
        {checkingDuplicate && <p className="text-xs text-gray-500">Comprobando si la canción ya existe...</p>}
        <div>
          <label className="block text-sm mb-1">Letra con o sin acordes <span className="text-danger">*</span></label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={14}
            className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2 font-mono text-sm"
            placeholder={'G        D\nGrande eres Dios\nEm             C\nTu amor nunca fallará'}
          />
        </div>
        <fieldset className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
          <legend className="px-1 text-sm font-medium">Método de reestructuración</legend>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className={`cursor-pointer rounded-md border p-3 ${reviewMode === 'ai' ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700'}`}>
              <input
                type="radio"
                name="reviewMode"
                value="ai"
                checked={reviewMode === 'ai'}
                onChange={() => setReviewMode('ai')}
                className="mr-2"
              />
              <strong>Con IA</strong>
              <span className="block text-xs text-gray-500 mt-1">Mejor detección semántica de estrofas, coros y puentes. Usa el failover configurado.</span>
            </label>
            <label className={`cursor-pointer rounded-md border p-3 ${reviewMode === 'local' ? 'border-primary bg-primary/5' : 'border-gray-300 dark:border-gray-700'}`}>
              <input
                type="radio"
                name="reviewMode"
                value="local"
                checked={reviewMode === 'local'}
                onChange={() => setReviewMode('local')}
                className="mr-2"
              />
              <strong>Local</strong>
              <span className="block text-xs text-gray-500 mt-1">No consume API. Conserva secciones existentes y agrega ESTROFA/CORO por bloques.</span>
            </label>
          </div>
        </fieldset>
        <button
          onClick={handleReview}
          disabled={!title.trim() || !artist.trim() || !content.trim() || checkingDuplicate || Boolean(duplicateMatch)}
          className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reviewMode === 'ai' ? 'Revisar y estructurar con IA' : 'Revisar y estructurar localmente'}
        </button>
      </div>
    );
  }

  if (step === 'reviewing') {
    return <p className="text-gray-500">{reviewMode === 'ai' ? 'Analizando la canción con IA...' : 'Estructurando la canción localmente...'}</p>;
  }

  // step === 'compare'
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Revisa los cambios propuestos</h1>

      {duplicateMatch && error && (
        <div className="rounded-lg border border-accent-gold bg-accent-gold/10 px-4 py-3 text-sm">
          <p>{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openExistingSong(false)}
              disabled={checkingDuplicate}
              className="rounded-md border border-primary px-3 py-1.5 text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              {checkingDuplicate ? 'Comprobando...' : 'Abrir canción existente'}
            </button>
            {(duplicateMatch.canProposeCorrection || duplicateMatch.promotedToPublic || !duplicateMatch.sharedListAccess) && (
              <button
                type="button"
                onClick={() => openExistingSong(true)}
                disabled={checkingDuplicate}
                className="rounded-md bg-primary px-3 py-1.5 text-white hover:opacity-90 disabled:opacity-50"
              >
                Proponer corrección
              </button>
            )}
          </div>
        </div>
      )}

      {reviewMode === 'ai' && !aiAvailable && (
        <div className="bg-accent-gold/10 border border-accent-gold rounded-md p-3 text-sm">
          La revisión con IA no está disponible en este momento; se muestra el análisis local basado en el
          motor de acordes. {aiWarning && <span className="block mt-1 text-gray-600 dark:text-gray-400">{aiWarning}</span>}
        </div>
      )}

      {aiResult && aiResult.warnings.length > 0 && (
        <ul className="text-sm text-accent-gold list-disc pl-5">
          {Array.from(new Set(aiResult.warnings))
            .filter((warning) => {
              const normalized = warning.toLowerCase();
              return !normalized.includes('revisión con ia no está disponible') &&
                !normalized.includes('todos los proveedores configurados fallaron') &&
                warning !== aiWarning;
            })
            .map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
        </ul>
      )}

      {alternateKey && (
        <div className="bg-accent-teal/10 border border-accent-teal rounded-md p-3 text-sm flex items-center justify-between flex-wrap gap-2">
          <span>
            La progresión de acordes también encaja con{' '}
            <strong>
              {alternateKey.key}
              {alternateKey.isMinor ? 'm' : ''}
            </strong>{' '}
            (confianza {Math.round(alternateKey.confidence * 100)}%) como tono alterno probable. Si el tono
            recomendado no te suena correcto, prueba con este.
          </span>
          <button
            type="button"
            onClick={useAlternateKey}
            className="text-accent-teal underline whitespace-nowrap"
          >
            Usar tono alterno
          </button>
        </div>
      )}

      <div className="max-w-sm rounded-lg border border-gray-200 dark:border-gray-800 p-3">
        <label htmlFor="final-song-key" className="block text-sm font-medium mb-1">
          Tono final de la canción
        </label>
        <select
          id="final-song-key"
          value={selectedKey || aiResult?.detectedKey || 'C'}
          onChange={(event) => setSelectedKey(event.target.value)}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        >
          <optgroup label="Tonos mayores">
            {ALL_KEYS_GENERAL.map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </optgroup>
          <optgroup label="Tonos menores">
            {ALL_KEYS_GENERAL.map((key) => (
              <option key={`${key}m`} value={`${key}m`}>{key}m</option>
            ))}
          </optgroup>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Puedes conservar el tono recomendado, usar el alternativo o elegir cualquier tono mayor o menor. Esta selección define el tono base al guardar y no transpone automáticamente el contenido.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="min-w-0 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-sm text-gray-500">Contenido original</h2>
          <ChordChart content={content} fontSizeClass="text-sm" />
        </div>
        <div className="min-w-0 overflow-hidden border border-primary rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-sm text-primary">
            Versión estructurada {reviewMode === 'ai' ? 'con IA ' : 'localmente '}{aiResult && `— tono seleccionado ${selectedKey || aiResult.detectedKey} (recomendado ${aiResult.detectedKey}, confianza ${Math.round(aiResult.keyConfidence * 100)}%)`}
          </h2>
          <ChordChart content={correctedContent} fontSizeClass="text-sm" />
        </div>
      </div>

      {aiResult && aiResult.corrections.length > 0 && (
        <div className="text-sm">
          <h3 className="font-semibold mb-1">Correcciones propuestas</h3>
          <ul className="space-y-1">
            {aiResult.corrections.map((c, i) => (
              <li key={i} className="text-gray-600 dark:text-gray-400">
                <span className="line-through">{c.original}</span> → <span className="text-primary">{c.corrected}</span>
                {c.reason ? ` (${c.reason})` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={useCorrected} onChange={(e) => setUseCorrected(e.target.checked)} />
          Usar la versión estructurada
        </label>
        <button onClick={() => setStep('form')} className="text-sm text-gray-500 underline">
          Volver a analizar
        </button>
      </div>

      <div className="max-w-sm">
        <label className="block text-sm font-medium mb-1">Visibilidad de la canción</label>
        <select
          value={visibility}
          onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}
          className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
        >
          <option value="private">Privada</option>
          <option value="public">Pública</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Una canción privada solo será visible para ti y para usuarios con acceso a una lista compartida que la contenga.
          Si otro usuario la agrega a una lista propia, se convertirá automáticamente en pública.
        </p>
      </div>

      {error && !duplicateMatch && <p className="text-danger text-sm">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => handleSave(false)}
          disabled={saving || Boolean(duplicateMatch)}
          className="border border-gray-300 dark:border-gray-700 px-5 py-2.5 rounded-md disabled:opacity-50"
        >
          Guardar como borrador
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving || Boolean(duplicateMatch)}
          className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Publicar'}
        </button>
      </div>
    </div>
  );
}

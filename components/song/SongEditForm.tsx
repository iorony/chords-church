'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { parseChord } from '@/lib/chords/chord-parser';
import { renderSections } from '@/lib/chords/structure-parser';
import type { AiReviewResponse } from '@/lib/ai/schema';
import ChordChart from './ChordChart';
import { toProperName, toProperTitle } from '@/lib/services/text-utils';
import YouTubePreview from './YouTubePreview';
import { getYouTubeVideoId } from '@/lib/services/youtube';

export interface SongEditFormProps {
  songId: string;
  slug: string;
  isOwnerOrModerator: boolean;
  initialContent: string;
  initialTitle: string;
  initialArtistName: string;
  initialKey: string;
  initialSourceUrl: string;
  initialVisibility: 'public' | 'private';
  canSetPrivate: boolean;
}

/** Valida que el texto ingresado como tono sea un acorde reconocible, admitiendo sufijo "m" de menor (p.ej. "Bm", "F#", "Eb") */
function isValidKeyInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const withoutMode = trimmed.replace(/m$/i, '');
  return parseChord(withoutMode).recognized;
}

export default function SongEditForm({
  songId,
  slug,
  isOwnerOrModerator,
  initialContent,
  initialTitle,
  initialArtistName,
  initialKey,
  initialSourceUrl,
  initialVisibility,
  canSetPrivate
}: SongEditFormProps) {
  const supabase = createClient();
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState(initialTitle);
  const [artistName, setArtistName] = useState(initialArtistName);
  const [keyInput, setKeyInput] = useState(initialKey);
  const [sourceUrl, setSourceUrl] = useState(initialSourceUrl);
  const [visibility, setVisibility] = useState<'public' | 'private'>(initialVisibility);
  const [changeSummary, setChangeSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AiReviewResponse | null>(null);
  const [alternateKey, setAlternateKey] = useState<{ key: string; confidence: number; isMinor: boolean } | null>(null);
  const [analysisWarning, setAnalysisWarning] = useState<string | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'ai' | 'local'>('ai');
  const [error, setError] = useState<string | null>(null);

  async function resolveArtistId(name: string): Promise<string | null> {
    const trimmed = toProperName(name);
    if (!trimmed) return null;

    const normalized = trimmed
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    const { data: existing } = await supabase
      .from('artists')
      .select('id')
      .eq('normalized_name', normalized)
      .maybeSingle();
    if (existing) return existing.id;

    const slugBase = normalized.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const { data: created, error: createError } = await supabase
      .from('artists')
      .insert({ name: trimmed, slug: `${slugBase}-${Date.now().toString(36)}`, normalized_name: normalized })
      .select('id')
      .single();
    if (createError) throw createError;
    return created.id;
  }

  async function handleReanalyze() {
    setAnalyzing(true);
    setError(null);
    setAnalysisWarning(null);
    try {
      const response = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: toProperTitle(title), artist: toProperName(artistName), content, mode: analysisMode })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo volver a analizar la canción.');
      setAnalysisResult(data.result);
      setAlternateKey(data.alternateKey ?? null);
      setAnalysisWarning(analysisMode === 'ai' && !data.aiAvailable ? data.error || 'Se utilizó el análisis local de respaldo.' : null);
    } catch (err: any) {
      setError(err?.message || 'Error de conexión al volver a analizar la canción.');
    } finally {
      setAnalyzing(false);
    }
  }

  function applyAnalysis() {
    if (!analysisResult) return;
    setContent(renderSections(analysisResult.sections as any));
    setKeyInput(analysisResult.detectedKey);
    if (!title.trim() && analysisResult.detectedTitle) setTitle(toProperTitle(analysisResult.detectedTitle));
    if (!artistName.trim() && analysisResult.detectedArtist) setArtistName(toProperName(analysisResult.detectedArtist));
    setAnalysisResult(null);
    setAlternateKey(null);
  }

  async function handleSaveDirect() {
    setSaving(true);
    setError(null);

    if (keyInput.trim() && !isValidKeyInput(keyInput)) {
      setError('El tono ingresado no es un acorde válido (ej: G, Bm, F#, Eb).');
      setSaving(false);
      return;
    }

    if (sourceUrl.trim() && !getYouTubeVideoId(sourceUrl)) {
      setError('El enlace de referencia debe ser un video válido de YouTube.');
      setSaving(false);
      return;
    }

    try {
      const normalizedTitle = toProperTitle(title);
      const normalizedArtist = toProperName(artistName);

      const duplicateResponse = await fetch('/api/songs/duplicates', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: normalizedTitle,
          artist: normalizedArtist,
          content,
          excludeId: songId
        })
      });
      const duplicateData = await duplicateResponse.json();
      if (!duplicateResponse.ok) {
        throw new Error(duplicateData.error || 'No se pudo comprobar si la canción ya existe.');
      }
      if (duplicateData.duplicate && duplicateData.duplicates?.length) {
        const match = duplicateData.duplicates[0];
        throw new Error(
          `Los cambios harían que esta canción duplique “${match.title}”${match.artist ? ` de ${match.artist}` : ''}.`
        );
      }

      const artistId = await resolveArtistId(normalizedArtist);
      const finalKey = keyInput.trim() || null;
      const metadataPayload: Record<string, unknown> = { title: normalizedTitle, artist_id: artistId, visibility, source_url: sourceUrl.trim() || null };
      setTitle(normalizedTitle);
      setArtistName(normalizedArtist);

      const { error: metadataError } = await supabase.from('songs').update(metadataPayload).eq('id', songId);
      if (metadataError) throw metadataError;

      // save_song_version actualiza songs.content/detected_key y crea una
      // fila nueva en song_versions de forma atómica (ver migración 0016).
      const { error: versionError } = await supabase.rpc('save_song_version', {
        target_song_id: songId,
        new_content: content,
        new_key: finalKey,
        summary: changeSummary.trim() || null
      });
      if (versionError) throw versionError;

      window.location.assign(`/canciones/${slug}?updated=${Date.now()}`);
    } catch (err: any) {
      console.error('Error guardando la canción:', err);
      setError(`No se pudo guardar: ${err?.message || 'error desconocido'}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleProposal() {
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
    const { error } = await supabase.from('song_edit_proposals').insert({
      song_id: songId,
      proposed_by: user.id,
      proposed_content: content,
      change_summary: changeSummary || 'Corrección propuesta'
    });
    setSaving(false);
    if (error) {
      console.error('Error enviando la propuesta:', error);
      setError(`No se pudo enviar la propuesta: ${error.message}`);
      return;
    }
    router.push(`/canciones/${slug}`);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-white/[0.02] p-5">
        <h1 className="text-2xl font-bold">{isOwnerOrModerator ? 'Editar canción' : 'Proponer corrección'}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isOwnerOrModerator
            ? 'Actualiza la información, visibilidad, tono, letra y acordes desde una sola vista.'
            : 'Revisa la letra y los acordes; la propuesta será evaluada antes de publicarse.'}
        </p>
      </section>

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/5 px-4 py-3 text-danger text-sm">{error}</div>
      )}

      {isOwnerOrModerator && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-white/[0.02] p-5">
          <h2 className="font-semibold mb-4">Información general</h2>
          <div className="grid md:grid-cols-12 gap-4">
          <div className="md:col-span-8">
            <label className="block text-sm font-medium mb-1.5">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitle((value) => toProperTitle(value))}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
            />
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-medium mb-1.5">Artista</label>
            <input
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              onBlur={() => setArtistName((value) => toProperName(value))}
              placeholder="Opcional"
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
            />
          </div>
          <div className="md:col-span-8">
            <label className="block text-sm font-medium mb-1.5">Visibilidad</label>
            <select
              value={visibility}
              onChange={(event) => setVisibility(event.target.value as 'public' | 'private')}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
            >
              <option value="public">Pública</option>
              <option value="private" disabled={!canSetPrivate}>Privada</option>
            </select>
            {!canSetPrivate && (
              <p className="text-xs text-accent-gold mt-1">
                No puede hacerse privada porque otro usuario ya la agregó a una lista propia.
              </p>
            )}
            {canSetPrivate && (
              <p className="text-xs text-gray-500 mt-1">
                Los usuarios con acceso a una lista compartida que contenga esta canción podrán verla aunque sea privada.
              </p>
            )}
          </div>
          <div className="md:col-span-4">
            <label className="block text-sm font-medium mb-1.5">
              Tono{' '}
              <span className="text-gray-400 font-normal">
                (corrígelo si el detectado automáticamente no es el correcto)
              </span>
            </label>
            <input
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="Ej: G, Bm, F#, Eb"
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2 font-mono"
            />
          </div>
          <div className="space-y-2 md:col-span-12">
            <label htmlFor="youtube-source" className="block text-sm font-medium">Video de referencia de YouTube <span className="font-normal text-gray-400">(opcional)</span></label>
            <div className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="min-w-0">
                <input id="youtube-source" type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 dark:border-gray-700" />
                {sourceUrl.trim() && !getYouTubeVideoId(sourceUrl) && <p className="mt-1 text-xs text-danger">Ingresa un enlace válido de YouTube.</p>}
              </div>
              <YouTubePreview url={sourceUrl} title={`Referencia de ${title || 'la canción'}`} />
            </div>
          </div>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-white/[0.02] p-5">
        <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className="min-w-0">
          <label className="block text-sm font-medium mb-2">Contenido (letra + acordes)</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="song-edit-content-input w-full h-[560px] border rounded-lg px-3 py-3 font-mono text-sm leading-relaxed resize-none overflow-y-auto"
          />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium mb-2">Vista previa</h2>
          <div className="h-[560px] overflow-y-auto border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white/60 dark:bg-black/10">
            <ChordChart content={content} fontSizeClass="text-sm" />
          </div>
        </div>
        </div>
      </section>

      {isOwnerOrModerator && (
        <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white/40 dark:bg-white/[0.02] p-5 space-y-4">
          <h2 className="font-semibold">Análisis y estructuración</h2>
          <div className="flex items-center gap-4 flex-wrap">
            <span className="text-sm font-medium">Volver a analizar con:</span>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="analysisMode" checked={analysisMode === 'ai'} onChange={() => setAnalysisMode('ai')} />
              IA
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="analysisMode" checked={analysisMode === 'local'} onChange={() => setAnalysisMode('local')} />
              Local
            </label>
          </div>
          <button
            type="button"
            onClick={handleReanalyze}
            disabled={analyzing || saving}
            className="border border-primary text-primary px-4 py-2 rounded-md hover:bg-primary/5 disabled:opacity-50"
          >
            {analyzing
              ? analysisMode === 'ai' ? 'Analizando con IA...' : 'Analizando localmente...'
              : analysisMode === 'ai' ? 'Volver a analizar con IA' : 'Volver a analizar localmente'}
          </button>

          {analysisWarning && (
            <p className="text-sm text-accent-gold">{analysisWarning}</p>
          )}

          {analysisResult && (
            <div className="border border-primary rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="font-semibold">Nuevo análisis propuesto</h2>
                <span className="text-sm text-primary">
                  Tono: {analysisResult.detectedKey} ({Math.round(analysisResult.keyConfidence * 100)}%)
                </span>
              </div>
              {alternateKey && (
                <div className="bg-accent-teal/10 border border-accent-teal rounded-md p-3 text-sm flex items-center justify-between gap-3 flex-wrap">
                  <span>
                    La progresión también encaja con <strong>{alternateKey.key}{alternateKey.isMinor ? 'm' : ''}</strong>{' '}
                    ({Math.round(alternateKey.confidence * 100)}%) como tono alternativo.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisResult({
                        ...analysisResult,
                        detectedKey: `${alternateKey.key}${alternateKey.isMinor ? 'm' : ''}`,
                        keyConfidence: alternateKey.confidence
                      });
                      setAlternateKey({
                        key: analysisResult.detectedKey.replace(/m$/i, ''),
                        isMinor: /m$/i.test(analysisResult.detectedKey),
                        confidence: analysisResult.keyConfidence
                      });
                    }}
                    className="text-accent-teal underline whitespace-nowrap"
                  >
                    Usar tono alternativo
                  </button>
                </div>
              )}
              {analysisResult.warnings.length > 0 && (
                <ul className="text-sm text-accent-gold list-disc pl-5">
                  {analysisResult.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              )}
              <div className="max-h-96 overflow-auto border border-gray-200 dark:border-gray-800 rounded-md p-3">
                <ChordChart content={renderSections(analysisResult.sections as any)} fontSizeClass="text-sm" />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={applyAnalysis} className="bg-primary text-white px-4 py-2 rounded-md">
                  Aplicar análisis
                </button>
                <button type="button" onClick={() => { setAnalysisResult(null); setAlternateKey(null); }} className="text-sm text-gray-500 underline">
                  Descartar
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {isOwnerOrModerator && (
        <div>
          <label className="block text-sm mb-1">
            Resumen del cambio <span className="text-gray-400 font-normal">(opcional, queda en el historial)</span>
          </label>
          <input
            value={changeSummary}
            onChange={(e) => setChangeSummary(e.target.value)}
            className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
            placeholder="Ej: corregí el acorde de la segunda estrofa"
          />
        </div>
      )}

      {!isOwnerOrModerator && (
        <>
          <p className="text-xs text-gray-500">
            Como no eres el autor de esta canción, tu cambio se envía como propuesta para que el autor o un
            moderador la revise. Por ahora las propuestas cubren solo la letra y los acordes — si crees que el
            artista o el tono están mal, indícalo en el resumen del cambio.
          </p>
          <div>
            <label className="block text-sm mb-1">Resumen del cambio</label>
            <input
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
              placeholder="Ej: corregí el acorde de la segunda estrofa"
            />
          </div>
        </>
      )}

      <div className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-800 bg-white/95 dark:bg-gray-950/95 backdrop-blur py-4">
        <button
          type="button"
          onClick={() => router.back()}
          disabled={saving}
          className="border border-gray-300 dark:border-gray-700 px-6 py-2.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          onClick={isOwnerOrModerator ? handleSaveDirect : handleProposal}
          disabled={saving}
          className="bg-primary text-white px-6 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50"
        >
          {saving ? 'Guardando...' : isOwnerOrModerator ? 'Guardar cambios' : 'Enviar propuesta'}
        </button>
      </div>
    </div>
  );
}

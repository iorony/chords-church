'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { renderSections } from '@/lib/chords/structure-parser';
import { ALL_KEYS_GENERAL } from '@/lib/chords/transposition';
import ChordChart from './ChordChart';
import type { AiReviewResponse } from '@/lib/ai/schema';
import { normalizeText, toProperName, toProperTitle } from '@/lib/services/text-utils';
import AsyncProgress from '@/components/ui/AsyncProgress';

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
  const [artistSuggestions, setArtistSuggestions] = useState<Array<{ id: string; name: string; normalized_name: string | null }>>([]);
  const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
  const [checkingArtists, setCheckingArtists] = useState(false);

  const [aiResult, setAiResult] = useState<AiReviewResponse | null>(null);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [aiWarning, setAiWarning] = useState<string | null>(null);
  const [useCorrected, setUseCorrected] = useState(true);
  const [alternateKey, setAlternateKey] = useState<{ key: string; confidence: number; isMinor: boolean } | null>(null);
  const [selectedKey, setSelectedKey] = useState('');
  const [editingDetectedArtist, setEditingDetectedArtist] = useState(false);

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
    const query = artist.trim();
    if (query.length < 2) {
      setArtistSuggestions([]);
      setShowArtistSuggestions(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setCheckingArtists(true);
      try {
        const normalizedQuery = normalizeText(query);
        const { data, error: artistLookupError } = await supabase
          .from('artists')
          .select('id, name, normalized_name')
          .order('name')
          .limit(500);

        if (artistLookupError) throw artistLookupError;

        const ranked = (data || [])
          .map((item) => {
            const normalizedName = normalizeText(item.normalized_name || item.name);
            let score = 0;
            if (normalizedName === normalizedQuery) score = 100;
            else if (normalizedName.startsWith(normalizedQuery)) score = 90;
            else if (normalizedName.includes(normalizedQuery)) score = 80;
            else {
              const queryTokens = normalizedQuery.split(' ').filter(Boolean);
              const nameTokens = normalizedName.split(' ').filter(Boolean);
              const matches = queryTokens.filter((token) =>
                nameTokens.some((nameToken) => nameToken.startsWith(token) || token.startsWith(nameToken))
              ).length;
              score = queryTokens.length ? (matches / queryTokens.length) * 70 : 0;
            }
            return { item, score };
          })
          .filter(({ score }) => score >= 45)
          .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name, 'es'))
          .slice(0, 8)
          .map(({ item }) => item);

        setArtistSuggestions(ranked);
        setShowArtistSuggestions(ranked.length > 0);
      } catch (artistLookupError) {
        console.warn('No se pudieron cargar sugerencias de artistas:', artistLookupError);
        setArtistSuggestions([]);
      } finally {
        setCheckingArtists(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [artist]);

  async function findOfficialArtistName(name: string): Promise<string> {
    const proper = toProperName(name);
    if (!proper) return '';

    const normalized = normalizeText(proper);
    const { data, error: lookupError } = await supabase
      .from('artists')
      .select('name, normalized_name')
      .order('name')
      .limit(500);

    if (lookupError) {
      console.warn('No se pudo verificar el artista detectado por IA:', lookupError);
      return proper;
    }

    const exact = (data || []).find(
      (item) => normalizeText(item.normalized_name || item.name) === normalized
    );
    if (exact) return exact.name;

    const strongMatches = (data || []).filter((item) => {
      const candidate = normalizeText(item.normalized_name || item.name);
      return candidate.startsWith(normalized) || normalized.startsWith(candidate);
    });

    return strongMatches.length === 1 ? strongMatches[0].name : proper;
  }

  function normalizeArtistAndUseExisting() {
    const proper = toProperName(artist);
    const normalized = normalizeText(proper);
    const exact = artistSuggestions.find(
      (item) => normalizeText(item.normalized_name || item.name) === normalized
    );

    if (exact) {
      setArtist(exact.name);
      setShowArtistSuggestions(false);
      return;
    }

    // Si solo existe una coincidencia clara por prefijo, usa el nombre oficial
    // almacenado para evitar duplicados como "Miel san marcos"/"Miel San Marcos".
    const strongMatches = artistSuggestions.filter((item) => {
      const candidate = normalizeText(item.normalized_name || item.name);
      return candidate.startsWith(normalized) || normalized.startsWith(candidate);
    });

    setArtist(strongMatches.length === 1 ? strongMatches[0].name : proper);
    setShowArtistSuggestions(false);
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
    const normalizedTitle = toProperTitle(title);
    const normalizedArtist = toProperName(artist);
    setTitle(normalizedTitle);
    setArtist(normalizedArtist);
    setError(null);
    setDuplicateMatch(null);
    if (!normalizedTitle) {
      setError('El título de la canción es obligatorio.');
      return;
    }
    if (!normalizedArtist && reviewMode === 'local') {
      setError('Para el análisis local debes escribir el artista. En modo IA puede detectarse automáticamente.');
      return;
    }
    if (!content.trim()) {
      setError('Pega la letra (con o sin acordes) antes de continuar.');
      return;
    }
    setStep('reviewing');
    try {
      if (normalizedArtist) {
        const existing = await checkExistingSong(
          { title: normalizedTitle, artist: normalizedArtist, content },
          { promote: true }
        );
        if (existing) {
          setStep('form');
          return;
        }
      }

      const res = await fetch('/api/ai/review', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: normalizedTitle, artist: normalizedArtist, content, mode: reviewMode })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'No se pudo revisar la canción.');
        setStep('form');
        return;
      }
      const reviewedContent = renderSections(data.result.sections as any);
      const reviewedTitle = toProperTitle(title || data.result.detectedTitle || 'Sin título');
      const userProvidedArtist = Boolean(normalizedArtist);

      // Cuando el usuario dejó el artista vacío, la IA solo propone candidatos.
      // No se guarda automáticamente el primer resultado para evitar asignar una
      // versión incorrecta de una canción con múltiples intérpretes.
      const detectedArtist = data.result.detectedArtist
        ? await findOfficialArtistName(data.result.detectedArtist)
        : '';
      const normalizedAlternatives = await Promise.all(
        (data.result.artistAlternatives || []).map(async (candidate: { name: string; confidence: number }) => ({
          ...candidate,
          name: await findOfficialArtistName(candidate.name)
        }))
      );
      const reviewedArtist = userProvidedArtist
        ? await findOfficialArtistName(normalizedArtist)
        : '';

      if (reviewMode === 'local' && !reviewedArtist) {
        setError('El artista de la canción es obligatorio.');
        setStep('form');
        return;
      }

      setTitle(reviewedTitle);
      setArtist(reviewedArtist);
      setEditingDetectedArtist(false);
      setAiResult({
        ...data.result,
        detectedArtist: detectedArtist || null,
        artistAlternatives: normalizedAlternatives.filter((candidate) => candidate.name),
        detectedTitle: reviewedTitle
      });
      setSelectedKey(data.result.detectedKey || 'C');
      setAiAvailable(data.aiAvailable);
      setAiWarning(reviewMode === 'ai' ? data.error : null);
      setAlternateKey(data.alternateKey ?? null);

      if (reviewedArtist) {
        try {
          await checkExistingSong({
            title: reviewedTitle,
            artist: reviewedArtist,
            content: reviewedContent || content
          }, { promote: true });
        } catch (duplicateError: any) {
          setError(duplicateError?.message || 'No se pudo comprobar si la canción ya existe.');
        }
      } else if (reviewMode === 'ai') {
        setError(null);
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

  async function chooseDetectedArtist(name: string) {
    const officialName = await findOfficialArtistName(name);
    if (!officialName) return;

    setArtist(officialName);
    setAiResult((current) => current ? { ...current, detectedArtist: officialName } : current);
    setEditingDetectedArtist(false);
    setDuplicateMatch(null);
    setError(null);

    try {
      await checkExistingSong(
        { title: toProperTitle(title), artist: officialName, content: correctedContent || content },
        { promote: false, silent: true }
      );
    } catch (artistDuplicateError) {
      console.warn('No se pudo comprobar el artista seleccionado:', artistDuplicateError);
    }
  }

  const artistOptions = aiResult
    ? [
        ...(aiResult.detectedArtist ? [{ name: aiResult.detectedArtist, confidence: aiResult.detectedArtistConfidence || 0 }] : []),
        ...(aiResult.artistAlternatives || [])
      ].filter((item, index, items) => {
        const normalized = normalizeText(item.name);
        return normalized && items.findIndex((candidate) => normalizeText(candidate.name) === normalized) === index;
      })
    : [];

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

    if (!finalArtist) {
      setSaving(false);
      setError('No se pudo determinar el artista. Escríbelo antes de guardar la canción.');
      return;
    }

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
          <div className="relative">
            <label className="block text-sm mb-1">
              Artista {reviewMode === 'local' ? <span className="text-danger">*</span> : <span className="text-xs text-gray-500">(opcional con IA)</span>}
            </label>
            <input
              value={artist}
              onChange={(e) => {
                setArtist(e.target.value);
                setShowArtistSuggestions(true);
              }}
              onFocus={() => artistSuggestions.length > 0 && setShowArtistSuggestions(true)}
              onBlur={() => window.setTimeout(normalizeArtistAndUseExisting, 120)}
              className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
              placeholder={reviewMode === 'ai' ? 'Opcional: la IA puede detectarlo' : 'Nombre del artista'}
              autoComplete="off"
              required={reviewMode === 'local'}
            />
            {checkingArtists && (
              <span className="absolute right-3 top-9 text-xs text-gray-500">Buscando...</span>
            )}
            {showArtistSuggestions && artistSuggestions.length > 0 && (
              <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-950">
                {artistSuggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      setArtist(suggestion.name);
                      setShowArtistSuggestions(false);
                    }}
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {suggestion.name}
                  </button>
                ))}
              </div>
            )}
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
          disabled={!title.trim() || !content.trim() || (reviewMode === 'local' && !artist.trim()) || checkingDuplicate || Boolean(duplicateMatch)}
          className="bg-primary text-white px-5 py-2.5 rounded-md hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {reviewMode === 'ai' ? 'Revisar y estructurar con IA' : 'Revisar y estructurar localmente'}
        </button>
      </div>
    );
  }

  if (step === 'reviewing') {
    return (
      <div className="mx-auto w-full max-w-2xl py-8 sm:py-14">
        <AsyncProgress mode={reviewMode} />
      </div>
    );
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

      {reviewMode === 'ai' && aiResult && (
        <div className="w-full rounded-lg border border-gray-200 dark:border-gray-800 p-3 sm:p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0 md:flex-1 md:pr-6">
              <p className="text-sm font-medium">Confirma el artista de esta versión</p>
              <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                La IA propone opciones, pero ninguna se guardará hasta que la selecciones. Si ninguna es correcta, indica otro artista.
              </p>
            </div>

            <div className="w-full space-y-2 md:w-80 md:flex-none">
              {artistOptions.length > 0 && !editingDetectedArtist ? (
                <select
                  value={artist}
                  onChange={(event) => void chooseDetectedArtist(event.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
                >
                  <option value="" disabled>Selecciona el artista correcto…</option>
                  {artistOptions.map((option) => (
                    <option key={`${option.name}-${option.confidence}`} value={option.name}>
                      {option.name}{option.confidence > 0 ? ` — ${Math.round(option.confidence * 100)}%` : ''}
                    </option>
                  ))}
                </select>
              ) : !editingDetectedArtist ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  La IA no encontró una opción suficientemente clara. Indica el artista manualmente.
                </div>
              ) : null}

              {editingDetectedArtist ? (
                <div className="flex gap-2">
                  <input
                    value={artist}
                    onChange={(event) => setArtist(event.target.value)}
                    onBlur={() => setArtist(toProperName(artist))}
                    placeholder="Escribe otro artista"
                    className="min-w-0 flex-1 border border-gray-300 dark:border-gray-700 bg-transparent rounded-md px-3 py-2"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => void chooseDetectedArtist(artist)}
                    className="rounded-md bg-primary px-3 py-2 text-sm text-white"
                  >
                    Usar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDetectedArtist(true)}
                  className="text-left text-sm text-primary underline"
                >
                  Indicar otro artista
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {reviewMode === 'ai' && aiResult && !artist && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Debes confirmar un artista sugerido o escribir uno manualmente antes de guardar la canción.
        </div>
      )}

      <div className="w-full rounded-lg border border-gray-200 dark:border-gray-800 p-3 sm:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 md:flex-1 md:pr-6">
            <p className="text-sm font-medium">Tono final de la canción</p>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              Conserva el tono recomendado, usa el alternativo o elige cualquier tono mayor o menor.
              Esta selección define el tono base al guardar y no transpone automáticamente el contenido.
            </p>
          </div>

          <div className="w-full md:w-64 md:flex-none">
            <label htmlFor="final-song-key" className="sr-only">
              Seleccionar tono final de la canción
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
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="min-w-0 overflow-hidden border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-sm text-gray-500">Contenido original</h2>
          <ChordChart content={content} fontSizeClass="text-sm" />
        </div>
        <div className="min-w-0 overflow-hidden border border-primary rounded-lg p-4">
          <h2 className="font-semibold mb-2 text-sm text-primary">
            Versión estructurada {reviewMode === 'ai' ? 'con IA ' : 'localmente '}{aiResult && `— artista ${artist || aiResult.detectedArtist || 'sin identificar'} · tono seleccionado ${selectedKey || aiResult.detectedKey} (recomendado ${aiResult.detectedKey}, confianza ${Math.round(aiResult.keyConfidence * 100)}%)`}
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

import { parseChord, tokenizeChordLine, stripChordWrapper } from './chord-parser';
import { ALL_KEYS_GENERAL } from './transposition';

const NOTE_INDEX: Record<string, number> = {};
ALL_KEYS_GENERAL.forEach((n, i) => (NOTE_INDEX[n] = i));
Object.assign(NOTE_INDEX, {
  Db: 1, 'D#': 3, Gb: 6, Ab: 8, 'A#': 10, 'B#': 0, 'E#': 5, Cb: 11, Fb: 4
});

export interface KeyDetectionResult {
  key: string;
  confidence: number;
  isMinor: boolean;
}

interface DetectedChord {
  root: number;
  quality: 'major' | 'minor' | 'diminished' | 'suspended' | 'unknown';
  lineIndex: number;
}

interface InternalKeyCandidate extends KeyDetectionResult {
  score: number;
}

const MAJOR_TRIADS: Array<'major' | 'minor' | 'diminished'> = [
  'major', 'minor', 'minor', 'major', 'major', 'minor', 'diminished'
];
const MINOR_TRIADS: Array<'major' | 'minor' | 'diminished'> = [
  'minor', 'diminished', 'major', 'minor', 'minor', 'major', 'major'
];
const MAJOR_DEGREES = [0, 2, 4, 5, 7, 9, 11];
const MINOR_DEGREES = [0, 2, 3, 5, 7, 8, 10];

function chordQuality(parsed: ReturnType<typeof parseChord>): DetectedChord['quality'] {
  const quality = parsed.quality.toLowerCase();
  if (quality.includes('dim')) return 'diminished';
  if (quality.includes('sus')) return 'suspended';
  if (quality === 'm' || quality.includes('min')) return 'minor';
  if (quality.includes('aug')) return 'unknown';
  return 'major';
}

function extractChords(content: string): DetectedChord[] {
  const chords: DetectedChord[] = [];
  content.split('\n').forEach((line, lineIndex) => {
    for (const token of tokenizeChordLine(line)) {
      if (token.kind !== 'chord') continue;
      const { core } = stripChordWrapper(token.value);
      const parsed = parseChord(core);
      if (!parsed.recognized) continue;
      const note = `${parsed.root}${parsed.accidental}`;
      if (!(note in NOTE_INDEX)) continue;
      chords.push({ root: NOTE_INDEX[note], quality: chordQuality(parsed), lineIndex });
    }
  });
  return chords;
}

function sectionEndingChords(content: string): DetectedChord[] {
  const endings: DetectedChord[] = [];
  let current: DetectedChord[] = [];
  for (const line of content.split('\n')) {
    if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
      if (current.length) endings.push(current[current.length - 1]);
      current = [];
      continue;
    }
    const lineChords = extractChords(line);
    if (lineChords.length) current.push(...lineChords);
  }
  if (current.length) endings.push(current[current.length - 1]);
  return endings;
}

function rankKeyCandidates(chords: DetectedChord[], content: string): InternalKeyCandidate[] {
  const candidates: InternalKeyCandidate[] = [];
  const endings = sectionEndingChords(content);

  for (let tonic = 0; tonic < 12; tonic++) {
    for (const isMinor of [false, true]) {
      const degrees = isMinor ? MINOR_DEGREES : MAJOR_DEGREES;
      const triads = isMinor ? MINOR_TRIADS : MAJOR_TRIADS;
      let score = 0;
      let maxScore = 0;

      for (const chord of chords) {
        maxScore += 3;
        const relative = (chord.root - tonic + 12) % 12;
        const degreeIndex = degrees.indexOf(relative);
        if (degreeIndex === -1) {
          score -= 1.8;
          continue;
        }

        score += 1.35;
        const expected = triads[degreeIndex];
        if (chord.quality === 'suspended' || chord.quality === 'unknown') {
          score += 0.45;
        } else if (chord.quality === expected) {
          score += 1.4;
        } else {
          // En tonalidad menor se admite V mayor por la escala menor armónica.
          const isHarmonicMinorDominant = isMinor && degreeIndex === 4 && chord.quality === 'major';
          score += isHarmonicMinorDominant ? 1.15 : -0.85;
        }

        if (relative === 0) score += 0.35;
        if (relative === 7) score += 0.2;
      }

      // Las resoluciones y cierres pesan más que el primer acorde de una sección.
      for (let i = 1; i < chords.length; i++) {
        const previous = (chords[i - 1].root - tonic + 12) % 12;
        const current = (chords[i].root - tonic + 12) % 12;
        if (previous === 7 && current === 0) score += 2.4; // V-I / V-i
        if (previous === 5 && current === 0) score += 1.2; // IV-I / iv-i
        if (!isMinor && previous === 9 && current === 7) score += 0.75; // vi-V frecuente
      }

      const tonicQuality = isMinor ? 'minor' : 'major';
      const tonicClosures = endings.filter((chord) =>
        chord.root === tonic && (chord.quality === tonicQuality || chord.quality === 'suspended')
      ).length;
      score += tonicClosures * 1.6;
      const lastChord = chords[chords.length - 1];
      if (lastChord?.root === tonic && (lastChord.quality === tonicQuality || lastChord.quality === 'suspended')) {
        score += 1.8;
      }
      const firstChord = chords[0];
      if (firstChord?.root === tonic && (firstChord.quality === tonicQuality || firstChord.quality === 'suspended')) {
        score += 0.25;
      }

      // Preferencia leve por mayor cuando toda la armonía coincide con su relativo menor,
      // pero los grados IV, V y vi mayores están claramente presentes (caso D / Bm).
      if (!isMinor) {
        const hasIV = chords.some((c) => (c.root - tonic + 12) % 12 === 5 && c.quality === 'major');
        const hasV = chords.some((c) => (c.root - tonic + 12) % 12 === 7 && (c.quality === 'major' || c.quality === 'suspended'));
        const hasVi = chords.some((c) => (c.root - tonic + 12) % 12 === 9 && c.quality === 'minor');
        if (hasIV && hasV && hasVi) score += 1.75;
      }

      const normalized = Math.max(0, Math.min(1, (score + maxScore * 0.45) / (maxScore * 1.45 + 4)));
      candidates.push({
        key: ALL_KEYS_GENERAL[tonic],
        isMinor,
        confidence: Number(normalized.toFixed(2)),
        score
      });
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function detectKey(content: string): KeyDetectionResult {
  const chords = extractChords(content);
  if (!chords.length) return { key: 'C', confidence: 0, isMinor: false };
  const best = rankKeyCandidates(chords, content)[0];
  return { key: best.key, confidence: best.confidence, isMinor: best.isMinor };
}


function parseKeyLabel(label: string): { root: number; isMinor: boolean } | null {
  const match = /^\s*([A-Ga-g])([#b]?)(m)?\s*$/.exec(label);
  if (!match) return null;
  const note = `${match[1].toUpperCase()}${match[2] || ''}`;
  if (!(note in NOTE_INDEX)) return null;
  return { root: NOTE_INDEX[note], isMinor: Boolean(match[3]) };
}

/**
 * Obtiene un tono alternativo armónicamente plausible a partir de la progresión.
 * Se usa tanto para análisis local como con IA. Evita devolver el mismo tono
 * principal y prioriza el relativo mayor/menor o el siguiente candidato cercano.
 */
export function detectAlternateKeyForPrimary(
  content: string,
  primaryLabel: string
): KeyDetectionResult | null {
  const chords = extractChords(content);
  if (!chords.length) return null;

  const ranked = rankKeyCandidates(chords, content);
  const parsedPrimary = parseKeyLabel(primaryLabel);

  const isSameAsPrimary = (candidate: InternalKeyCandidate) =>
    parsedPrimary
      ? NOTE_INDEX[candidate.key] === parsedPrimary.root && candidate.isMinor === parsedPrimary.isMinor
      : formatKeyLabel(candidate).toLowerCase() === primaryLabel.trim().toLowerCase();

  const primaryCandidate = ranked.find(isSameAsPrimary) ?? ranked[0];
  const primaryRoot = parsedPrimary?.root ?? NOTE_INDEX[primaryCandidate.key];
  const primaryMinor = parsedPrimary?.isMinor ?? primaryCandidate.isMinor;

  // Relativo menor: VI grado de mayor. Relativo mayor: III grado de menor.
  const relativeRoot = primaryMinor
    ? (primaryRoot + 3) % 12
    : (primaryRoot + 9) % 12;
  const relativeMinor = !primaryMinor;
  const relative = ranked.find((candidate) =>
    NOTE_INDEX[candidate.key] === relativeRoot && candidate.isMinor === relativeMinor
  );

  const nextBest = ranked.find((candidate) => !isSameAsPrimary(candidate));
  const candidate = relative && relative.score >= (nextBest?.score ?? -Infinity) - 2.5
    ? relative
    : nextBest;

  if (!candidate) return null;

  // Mostrar una alternativa cuando existe evidencia razonable en la progresión.
  // El umbral es más flexible que antes para no ocultar relativos mayor/menor.
  const scoreGap = primaryCandidate.score - candidate.score;
  const plausible = candidate.confidence >= 0.28 && scoreGap < Math.max(7, chords.length * 0.65);
  if (!plausible) return null;

  return {
    key: candidate.key,
    isMinor: candidate.isMinor,
    confidence: candidate.confidence
  };
}
export function detectKeyWithAlternate(content: string): {
  recommended: KeyDetectionResult;
  alternate: KeyDetectionResult | null;
} {
  const recommended = detectKey(content);
  return {
    recommended,
    alternate: detectAlternateKeyForPrimary(content, formatKeyLabel(recommended))
  };
}

export function formatKeyLabel(result: Pick<KeyDetectionResult, 'key' | 'isMinor'>): string {
  return `${result.key}${result.isMinor ? 'm' : ''}`;
}

export function detectModulation(content: string): boolean {
  const lines = content.split('\n');
  if (lines.length < 8) return false;
  const mid = Math.floor(lines.length / 2);
  const keyA = detectKey(lines.slice(0, mid).join('\n'));
  const keyB = detectKey(lines.slice(mid).join('\n'));
  if (keyA.confidence < 0.48 || keyB.confidence < 0.48) return false;
  return keyA.key !== keyB.key || keyA.isMinor !== keyB.isMinor;
}

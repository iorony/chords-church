/** Normaliza texto para comparaciones de búsqueda/duplicados: sin acentos, minúsculas, espacios colapsados */
export function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(input: string): string {
  return normalizeText(input).replace(/\s+/g, '-');
}


/**
 * Convierte a tipo oración únicamente cuando todo el valor fue escrito
 * completamente en mayúsculas o completamente en minúsculas.
 * Los textos con capitalización mixta se conservan para no dañar nombres propios.
 */
export function sentenceCaseIfUniform(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return '';

  const letters = value.match(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g)?.join('') || '';
  if (!letters) return value;

  const isAllUpper = letters === letters.toLocaleUpperCase('es');
  const isAllLower = letters === letters.toLocaleLowerCase('es');
  if (!isAllUpper && !isAllLower) return value;

  const lower = value.toLocaleLowerCase('es');
  const firstLetterIndex = lower.search(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
  if (firstLetterIndex < 0) return lower;
  return lower.slice(0, firstLetterIndex) + lower[firstLetterIndex].toLocaleUpperCase('es') + lower.slice(firstLetterIndex + 1);
}

/** Firma simple de acordes de una canción, usada para detección de duplicados */
export function chordSignature(chordRoots: string[]): string {
  return Array.from(new Set(chordRoots)).sort().join(',');
}

/** Similitud de Jaccard entre dos conjuntos de palabras, usada como aproximación de similitud semántica */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(' '));
  const setB = new Set(normalizeText(b).split(' '));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

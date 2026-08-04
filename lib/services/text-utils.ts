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


const NAME_CONNECTORS = new Set([
  'a', 'al', 'and', 'con', 'da', 'das', 'de', 'del', 'do', 'dos', 'e', 'el',
  'en', 'la', 'las', 'los', 'o', 'of', 'para', 'por', 'sin', 'the', 'y'
]);

function capitalizeWord(word: string): string {
  const lower = word.toLocaleLowerCase('es');
  const index = lower.search(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/);
  if (index < 0) return lower;
  return (
    lower.slice(0, index) +
    lower[index].toLocaleUpperCase('es') +
    lower.slice(index + 1)
  );
}

/**
 * Convierte nombres de artistas a nombre propio.
 *
 * - Capitaliza cada palabra significativa.
 * - Mantiene conectores como "de", "del", "la", "y" en minúscula.
 * - Conserva siglas de 2 a 4 letras cuando fueron escritas completamente
 *   en mayúsculas (BJ, MCI, IHOP).
 * - Conserva guiones y apóstrofes dentro de una palabra.
 */
export function toProperName(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return '';

  const words = value.split(' ');
  return words
    .map((word, index) => {
      const plain = word.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/g, '');
      const normalized = plain.toLocaleLowerCase('es');

      // Los conectores tienen prioridad sobre la conservación de siglas.
      // Así, títulos como "Fiesta EN EL Desierto" quedan como
      // "Fiesta en el Desierto", en lugar de conservar EN/EL en mayúsculas.
      if (index > 0 && NAME_CONNECTORS.has(normalized)) return normalized;
      if (/^[A-ZÁÉÍÓÚÜÑ]{2}$/.test(plain) || /^(MCI|IHOP)$/.test(plain)) return word;

      return word
        .split(/([-'’])/g)
        .map((part) => (/^[-'’]$/.test(part) ? part : capitalizeWord(part)))
        .join('');
    })
    .join(' ');
}

/**
 * Convierte títulos de canciones a estilo editorial, dejando conectores en
 * minúscula salvo cuando son la primera palabra.
 */
export function toProperTitle(input: string): string {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value) return '';

  return value
    .split(' ')
    .map((word, index) => {
      const plain = word.replace(/^[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+|[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+$/g, '');
      const normalized = plain.toLocaleLowerCase('es');

      if (index > 0 && NAME_CONNECTORS.has(normalized)) return normalized;
      // Conserva únicamente numeración romana; en títulos, palabras cortas en
      // mayúsculas como RÍO, MI o EL no deben confundirse con siglas.
      if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i.test(plain)) return plain.toLocaleUpperCase('es');

      return word
        .split(/([-'’])/g)
        .map((part) => (/^[-'’]$/.test(part) ? part : capitalizeWord(part)))
        .join('');
    })
    .join(' ');
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

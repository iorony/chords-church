/** Construye el nombre de exportación de una lista: aammdd - lugar - nombre. */
export function buildSetlistExportFilename(setlist: {
  name: string;
  eventDate?: string | null;
  location?: string | null;
}): string {
  const datePart = formatCompactDate(setlist.eventDate);
  return [datePart, cleanFilenamePart(setlist.location || ''), cleanFilenamePart(setlist.name)]
    .filter(Boolean)
    .join(' - ');
}

function formatCompactDate(value?: string | null): string {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${year.slice(-2)}${month}${day}`;
  }

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Guatemala',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}`;
}

function cleanFilenamePart(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '');
}

export function contentDisposition(filename: string, extension: 'pdf' | 'docx'): string {
  const fullName = `${filename}.${extension}`;
  const ascii = fullName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/["\\]/g, '') || `export.${extension}`;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fullName)}`;
}

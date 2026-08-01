import 'server-only';

export function getAiTimeoutMs(): number {
  const configured = Number(process.env.AI_TIMEOUT_MS || 20000);
  return Number.isFinite(configured) && configured >= 1000 ? configured : 20000;
}

export async function fetchWithAiTimeout(
  input: string | URL | Request,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getAiTimeoutMs());

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function readMaxRetries(): number {
  const configured = Number(process.env.AI_MAX_RETRIES ?? 1);
  if (!Number.isFinite(configured)) return 0;
  return Math.min(2, Math.max(0, Math.trunc(configured)));
}

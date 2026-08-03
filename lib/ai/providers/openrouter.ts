import 'server-only';

import {
  AiProvider,
  AiProviderError,
  AiReviewInput,
  getSystemPrompt,
  buildUserPrompt
} from '../provider';

import { AiReviewResponse } from '../schema';
import { fetchWithAiTimeout } from '../http';
import { parseAiJson } from './anthropic';

function extractTextContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') return part;

        if (part && typeof part === 'object') {
          const record = part as Record<string, unknown>;
          if (typeof record.text === 'string') return record.text;
          if (typeof record.content === 'string') return record.content;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

export const openrouterProvider: AiProvider = {
  name: 'openrouter',

  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new AiProviderError(
        'OPENROUTER_API_KEY no está configurada en el servidor.'
      );
    }

    const model = process.env.OPENROUTER_MODEL || 'openrouter/free';

    const response = await fetchWithAiTimeout(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer':
            process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': process.env.OPENROUTER_APP_NAME || 'Church Chords'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: getSystemPrompt(input)
            },
            {
              role: 'user',
              content: buildUserPrompt(input)
            }
          ],
          temperature: 0.1,
          max_tokens: 1800,
          response_format: {
            type: 'json_object'
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new AiProviderError(
        `Error de la API de OpenRouter (${response.status}): ${errorText}`
      );
    }

    const data = (await response.json()) as Record<string, any>;
    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = extractTextContent(message?.content);

    if (!content) {
      const finishReason = choice?.finish_reason ?? 'desconocido';
      const modelUsed = data?.model ?? model;
      const reasoningPresent =
        typeof message?.reasoning === 'string' &&
        message.reasoning.trim().length > 0;

      console.error('[OpenRouter] Respuesta sin contenido visible:', {
        model: modelUsed,
        finishReason,
        reasoningPresent,
        usage: data?.usage ?? null,
        responseId: data?.id ?? null,
        error: data?.error ?? null
      });

      if (data?.error) {
        const apiMessage =
          data.error?.message || JSON.stringify(data.error);
        throw new AiProviderError(
          `OpenRouter devolvió un error interno: ${apiMessage}`
        );
      }

      if (finishReason === 'length') {
        throw new AiProviderError(
          'OpenRouter agotó el límite de tokens antes de generar el JSON final.'
        );
      }

      if (reasoningPresent) {
        throw new AiProviderError(
          'OpenRouter generó razonamiento, pero no produjo el JSON final.'
        );
      }

      throw new AiProviderError(
        `OpenRouter no devolvió contenido de texto. Modelo: ${modelUsed}; finalización: ${finishReason}.`
      );
    }

    return parseAiJson(content, input);
  }
};

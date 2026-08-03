import 'server-only';

import {
  AiProvider,
  AiProviderError,
  AiReviewInput,
  getSystemPrompt,
  buildUserPrompt
} from '../provider';
import { fetchWithAiTimeout } from '../http';
import { AiReviewResponse } from '../schema';
import { parseAiJson } from './anthropic';

/**
 * Groq ofrece una API compatible con OpenAI y destaca por su baja latencia.
 * La clave se mantiene exclusivamente en el servidor.
 */
export const groqProvider: AiProvider = {
  name: 'groq',

  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('GROQ_API_KEY no está configurada en el servidor.');
    }

    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
    const response = await fetchWithAiTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          reasoning_effort: 'low',
          max_completion_tokens: 1400,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: getSystemPrompt(input) },
            { role: 'user', content: buildUserPrompt(input) }
          ]
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError(`Error de la API de Groq (${response.status}): ${text}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new AiProviderError('Groq no devolvió contenido de texto.');
    }

    return parseAiJson(content, input);
  }
};

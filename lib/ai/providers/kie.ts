import 'server-only';
import { AiProvider, AiProviderError, AiReviewInput, buildUserPrompt, getSystemPrompt } from '../provider';
import { AiReviewResponse } from '../schema';
import { fetchWithAiTimeout } from '../http';
import { parseAiJson } from './anthropic';

/** Adaptador para endpoints de chat compatibles de Kie.ai. */
export const kieProvider: AiProvider = {
  name: 'kie',
  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.KIE_API_KEY;
    if (!apiKey) throw new AiProviderError('KIE_API_KEY no está configurada en el servidor.');

    const model = process.env.KIE_MODEL || 'gemini-3-pro';
    const apiUrl = process.env.KIE_API_URL || 'https://api.kie.ai/gemini-3-pro/v1/chat/completions';
    const response = await fetchWithAiTimeout(apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        stream: false,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: getSystemPrompt(input) },
          { role: 'user', content: buildUserPrompt(input) }
        ]
      })
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1200);
      throw new AiProviderError(`Error de la API de Kie.ai (${response.status}): ${detail}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    const text = typeof content === 'string'
      ? content
      : Array.isArray(content)
        ? content.find((part: { type?: string; text?: string }) => part.type === 'text')?.text
        : null;
    if (!text) throw new AiProviderError('Kie.ai no devolvió contenido de texto.');
    return parseAiJson(text, input);
  }
};

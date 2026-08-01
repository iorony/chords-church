import 'server-only';
import { AiProvider, AiProviderError, AiReviewInput, SYSTEM_PROMPT, buildUserPrompt } from '../provider';
import { AiReviewResponse } from '../schema';
import { fetchWithAiTimeout } from '../http';
import { parseAiJson } from './anthropic';

export const geminiProvider: AiProvider = {
  name: 'gemini',
  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('GOOGLE_GENERATIVE_AI_API_KEY no está configurada en el servidor.');
    }
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

    const response = await fetchWithAiTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: buildUserPrompt(input) }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError(`Error de la API de Gemini (${response.status}): ${text}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new AiProviderError('Gemini no devolvió contenido.');
    }
    return parseAiJson(text, input);
  }
};

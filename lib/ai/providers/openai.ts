import 'server-only';
import { AiProvider, AiProviderError, AiReviewInput, getSystemPrompt, buildUserPrompt } from '../provider';
import { AiReviewResponse } from '../schema';
import { parseAiJson } from './anthropic';

export const openaiProvider: AiProvider = {
  name: 'openai',
  async review(input: AiReviewInput): Promise<AiReviewResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new AiProviderError('OPENAI_API_KEY no está configurada en el servidor.');
    }
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: getSystemPrompt(input) },
          { role: 'user', content: buildUserPrompt(input) }
        ]
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new AiProviderError(`Error de la API de OpenAI (${response.status}): ${text}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new AiProviderError('OpenAI no devolvió contenido.');
    }
    return parseAiJson(text, input);
  }
};

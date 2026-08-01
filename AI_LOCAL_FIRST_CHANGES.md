# Flujo de IA local-first

La canción se estructura primero con el motor local. La IA solo clasifica los bloques existentes y revisa metadatos armónicos.

## Garantías

- La letra y los acordes guardados siempre provienen del parser local.
- La IA no puede eliminar, resumir ni inventar líneas.
- Cada bloque se envía una sola vez, identificado como `BLOCK_n`.
- La respuesta de la IA contiene referencias `BLOCK_n`, no una copia completa de la canción.
- Si la IA falla, la estructura local ya está lista y se devuelve inmediatamente.
- Gemini ya no forma parte del orden predeterminado; puede agregarse manualmente cuando la clave tenga acceso.

## Variables recomendadas

```env
AI_PROVIDER_ORDER=groq,openrouter
AI_TIMEOUT_MS=30000
AI_MAX_RETRIES=0
```

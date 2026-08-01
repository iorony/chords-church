# Mejoras del pipeline de IA

- La canción se envía una sola vez a cada proveedor.
- El preanálisis local genera tono, alternativo, modulación, etiquetas y un resumen compacto de acordes.
- Se eliminó del prompt la copia completa de las secciones locales.
- Groq: `max_completion_tokens=2200` y `reasoning_effort=low`.
- OpenRouter/Anthropic: salida limitada a 2600 tokens.
- Los errores 400, 401, 403 y 413 no se reintentan.
- Una respuesta de IA que conserve menos del 92 % del contenido se rechaza y activa failover.
- El postprocesado local conserva etiquetas existentes, normaliza `VERSO` a `ESTROFA`, elimina duplicados idénticos y valida el tono.
- `.env.example`: `AI_MAX_RETRIES=0` y `AI_TIMEOUT_MS=30000`.

# Reconocimiento de INTERMEDIO

Se añadió soporte en el parser local y en el flujo con IA para normalizar como `[INTERLUDIO]` las variantes:

- INTERMEDIO / INTERMEDIO:
- INTERLUDE
- BREAK
- MÚSICA
- SECCIÓN INSTRUMENTAL

El parser cierra la sección anterior y abre una nueva sección de interludio, evitando que la progresión instrumental quede dentro del coro u otra sección.

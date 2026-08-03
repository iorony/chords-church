# Detección de duplicados por artista

La detección de canciones duplicadas ahora requiere que el artista coincida.

- Mismo título + mismo artista: se considera existente.
- Letra muy similar + mismo artista: se considera posible duplicado.
- Mismo título o letra similar + artista diferente: se permite crear como una canción nueva.

La comparación del artista ignora mayúsculas, minúsculas, tildes y espacios adicionales.

## Migración requerida

Ejecutar `supabase/migrations/0015_duplicate_detection_requires_same_artist.sql`.

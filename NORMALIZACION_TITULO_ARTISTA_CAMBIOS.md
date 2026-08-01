# Normalización de título y sugerencias de artista

## Título
- Corrige capitalización al perder el foco y antes de analizar/guardar.
- Los conectores internos (`en`, `el`, `de`, `del`, `la`, `y`, etc.) quedan en minúscula.
- Ejemplo: `Fiesta EN EL Desierto` → `Fiesta en el Desierto`.
- Ejemplo: `DANZO EN EL RÍO` → `Danzo en el Río`.
- Conserva numeración romana (`II`, `III`, etc.).

## Artista
- Consulta artistas existentes mientras se escribe (desde 2 caracteres).
- Muestra hasta 8 coincidencias por nombre normalizado, sin distinguir mayúsculas ni tildes.
- Al elegir una sugerencia usa el nombre oficial almacenado.
- Al salir del campo, una coincidencia exacta o una única coincidencia fuerte se completa automáticamente.
- Si no hay coincidencia, aplica formato de nombre propio.

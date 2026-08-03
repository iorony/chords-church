# Detección automática de artista con IA

- En modo IA, el campo Artista es opcional.
- Si el usuario proporciona título y letra, la IA intenta identificar al intérprete o agrupación.
- Si la IA detecta un artista, el formulario usa el nombre oficial existente en la tabla `artists` cuando encuentra una coincidencia.
- Después de detectar el artista, se ejecuta la comprobación de duplicados usando título + artista + contenido.
- Si la IA no puede identificarlo con suficiente certeza, se solicita al usuario escribirlo manualmente.
- En modo Local, el artista sigue siendo obligatorio.
- La detección de metadatos también funciona cuando toda la canción ya contiene secciones explícitas.

# Clasificador IA por bloques

- El parser local divide el documento sin reescribir letra ni acordes.
- Las regiones con encabezado explícito quedan bloqueadas y no se envían a la IA.
- Las regiones sin encabezado se dividen por líneas en blanco.
- La IA recibe solo bloques `BLOCK_n` y devuelve únicamente su clasificación.
- El reconstructor local reinserta el contenido original exacto.
- La IA no puede unir, dividir, mover, resumir ni eliminar líneas.
- Si omite un bloque, se usa failover al siguiente proveedor y finalmente el resultado local.

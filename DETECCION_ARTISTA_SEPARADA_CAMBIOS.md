# Detección de artista separada

- La identificación del artista se ejecuta antes de clasificar la estructura.
- Usa un prompt exclusivo de metadatos basado en título y frases distintivas de la letra.
- Se ejecuta incluso cuando todas las secciones ya están explícitamente etiquetadas.
- Sigue el orden de failover configurado.
- Admite confianza del artista y alternativas.
- Una confianza media (>= 55 %) puede completar automáticamente el artista; una alternativa fuerte (>= 62 %) también puede utilizarse.
- La segunda llamada de estructura recibe el artista ya detectado y no vuelve a depender de la clasificación de bloques para identificarlo.

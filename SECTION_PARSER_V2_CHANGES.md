# Section Parser v2

- Reconoce encabezados compuestos: INTRO PIANO/PAD/GUITARRA, SOLO GUITARRA/PIANO y ESTROFA FIN.
- Conserva PARTE I, II, III, etc.
- Distingue indicaciones de repetición de encabezados reales.
- Evita crear un INTRO nuevo con secuencias como `-intro-` + `-estrofa-coro-`.
- Usa las mismas reglas en análisis local, preanálisis y validación posterior de IA.

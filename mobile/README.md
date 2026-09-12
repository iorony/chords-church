# Cancionero móvil

Aplicación nativa para Android e iOS construida con Expo y React Native.

## Configuración

1. Copia `.env.example` como `.env.local` dentro de esta carpeta.
2. Usa los mismos valores de `NEXT_PUBLIC_SUPABASE_URL` y
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` que utiliza la aplicación web, con estos nombres:

```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-clave-anon
```

No agregues aquí la clave `SUPABASE_SERVICE_ROLE_KEY` ni claves de IA.

## Ejecutar

```bash
npm install
npm start
```

Instala **Expo Go** en el teléfono, abre la app y escanea el código QR. Para
abrir directamente los emuladores usa `npm run android` o `npm run ios`.

## Alcance inicial

- Inicio y cierre de sesión con Supabase.
- Persistencia segura de sesión en el teléfono.
- Catálogo de canciones y búsqueda por título.

Siguientes pantallas: detalle con acordes y transposición, favoritos,
repertorios, modo presentación y disponibilidad sin conexión.

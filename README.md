# Cancionero — Plataforma de canciones y acordes para iglesias

Plataforma web colaborativa de canciones cristianas con acordes, inspirada
funcionalmente en sitios como LaCuerda: revisión de canciones con IA,
motor propio de acordes y transposición, repertorios con tono por canción,
vista de dos hojas, modo presentación en vivo y exportación a PDF/DOCX.

Construido con Next.js (App Router) + TypeScript + Supabase (Postgres,
Auth, RLS) + Tailwind CSS.

## 1. Requisitos

- Node.js 18.18 o superior
- Una cuenta de [Supabase](https://supabase.com) (plan gratuito es suficiente para empezar)
- Opcional: una clave de API de OpenAI, Google Gemini o Anthropic para la revisión con IA

## 2. Instalación local

```bash
npm install
cp .env.example .env.local
```

Completa `.env.local` (ver sección 4).

```bash
npm run dev
```

Abre http://localhost:3000

## 3. Configurar Supabase

### 3.1 Crear el proyecto

1. Crea un proyecto nuevo en https://supabase.com/dashboard
2. Copia la **URL del proyecto** y las claves **anon** y **service_role**
   desde *Project Settings → API*.

### 3.2 Aplicar las migraciones

Puedes hacerlo de dos formas:

**Opción A — Panel SQL de Supabase (más simple):**
Abre *SQL Editor* en el panel de Supabase y ejecuta, en este orden, el
contenido de:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_seed.sql`
4. `supabase/migrations/0004_grants.sql` — **imprescindible**: sin este
   paso, todas las operaciones de escritura fallan con
   `permission denied for table ...` aunque las políticas RLS estén bien
   (ver sección 9).
5. `supabase/migrations/0005_fix_setlist_rls_recursion.sql` — corrige un
   error de `infinite recursion detected in policy for relation
   "setlists"` al crear listas (ver sección 9). Si ya aplicaste las
   primeras cuatro migraciones antes de que este archivo se agregara al
   repo, es el único paso pendiente.
6. `supabase/migrations/0006_songs_always_public.sql` y
   `0007_song_visibility_and_shared_setlists.sql` — evolución del modelo
   de visibilidad: la 0006 forzó temporalmente todas las canciones a
   públicas, y la 0007 la reemplaza por el modelo definitivo (canción
   privada por defecto, pero accesible si forma parte de una lista
   compartida). Aplica ambas en orden aunque la 0006 quede luego
   superada — así el historial de la base queda consistente.
7. `supabase/migrations/0008` a `0012` — detección de canciones
   duplicadas (por título, artista y contenido, usando similitud
   difusa con `pg_trgm`), incluyendo promoción automática de una
   canción privada a pública cuando otro usuario sin acceso por lista
   compartida intenta reutilizarla. Las migraciones 0011 y 0012 son
   correcciones consolidadas de las anteriores — aplica **todas en
   orden** (0008, 0009, 0010, 0011, 0012); no te saltes a la 0012
   directamente porque depende de objetos creados por las previas.
8. `supabase/migrations/0013_live_catalog_search_private_songs.sql` —
   función de búsqueda instantánea del catálogo (incluye canciones
   privadas propias) usada por el buscador de "Agregar canción".
9. `supabase/migrations/0014_legal_contact_messages.sql` — soporte para
   las páginas legales (términos, privacidad, derechos de autor,
   licencias) y el formulario de contacto.
10. `supabase/migrations/0015_admin_merge_duplicate_songs.sql` — función
    `merge_duplicate_songs` que usa el panel `/admin/canciones` para
    fusionar canciones duplicadas: selecciona 2 o más en la tabla, marca
    cuál se conserva como canónica, y reasigna listas, favoritos,
    propuestas, reportes y versiones antes de archivar las demás.
11. `supabase/migrations/0016_song_version_history.sql` — activa el
    historial de versiones: cada vez que el autor o un moderador guarda
    cambios (o crea la canción) se registra una versión nueva en
    `song_versions`, visible en "Ver historial" desde cada canción, con
    opción de comparar y restaurar sin perder nada del historial previo.

**Opción B — Supabase CLI:**

```bash
npx supabase login
npx supabase link --project-ref <tu-project-ref>
npx supabase db push
```

### 3.3 Regenerar los tipos de TypeScript (opcional pero recomendado)

`lib/supabase/database.types.ts` incluido es un placeholder mínimo para
que el proyecto compile sin depender de una base de datos real. Después de
aplicar las migraciones, regenera el tipado real:

```bash
npx supabase gen types typescript --project-id <tu-project-id> > lib/supabase/database.types.ts
```

### 3.4 Crear tu usuario administrador

1. Regístrate normalmente desde la app (`/registro`).
2. En el SQL Editor de Supabase, ejecuta:

```sql
update profiles set role = 'admin'
where id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

### 3.5 Habilitar login con Google (opcional)

En *Authentication → Providers → Google*, activa el proveedor y configura
las credenciales OAuth. La URL de callback ya está implementada en
`app/auth/callback/route.ts`.

## 4. Variables de entorno

Ver `.env.example`. Resumen:

| Variable | Descripción |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Claves públicas de Supabase (seguras en el navegador) |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave administrativa. **Nunca** se usa en componentes de cliente — solo en `lib/supabase/admin.ts`, importado exclusivamente desde código de servidor |
| `AI_PROVIDER` | `openai` \| `gemini` \| `anthropic` — proveedor activo para la revisión de canciones |
| `OPENAI_API_KEY` / `GOOGLE_GENERATIVE_AI_API_KEY` / `ANTHROPIC_API_KEY` | Clave del proveedor de IA elegido (solo necesitas configurar una) |
| `SEARCH_PROVIDER` / `SEARCH_API_KEY` | Ver limitación conocida sobre búsqueda web en la sección 8 |

Si no configuras ninguna clave de IA, la revisión de canciones sigue
funcionando: se degrada automáticamente al motor local de acordes
(heurística de detección de tonalidad y estructura), avisando al usuario
que la IA no está disponible — nunca falla en silencio.

## 5. Pruebas

El motor musical (parser de acordes, transposición, detección de
tonalidad, estructuración de secciones) tiene pruebas unitarias:

```bash
npm run test
```

## 6. Desplegar en Vercel

1. Sube el repositorio a GitHub.
2. Importa el proyecto en https://vercel.com/new
3. Configura las mismas variables de entorno de `.env.example` en
   *Project Settings → Environment Variables*.
4. Deploy.

No se requiere configuración adicional: las rutas de exportación PDF/DOCX
y de IA corren como Route Handlers (serverless functions) de Next.js.

## 7. Arquitectura

```
app/                    Rutas (App Router)
  (auth)/                Login, registro, recuperar contraseña
  (public)/               Canciones, artistas, listas, favoritos, perfil, búsqueda
  admin/                  Panel de administración (protegido por middleware)
  api/                    Route Handlers: revisión IA, transposición, exportación
components/
  song/                   Editor de acordes, comparador IA, control de tono, modo presentación
  setlist/                Gestión de repertorios
  admin/                  Tablas y acciones de moderación
lib/
  chords/                 Motor musical puro (sin dependencias externas, 100% testeable)
    chord-parser.ts        Reconoce acordes en cifrado americano (incluye slash chords, extensiones)
    transposition.ts       Transpone preservando alineación con la letra
    key-detection.ts       Detecta tonalidad probable + confianza
    structure-parser.ts    Agrupa el contenido en secciones ([CORO], [ESTROFA]...)
  ai/                     Capa de IA desacoplada (proveedores intercambiables + validación Zod)
  services/               Revisión IA, exportación PDF/DOCX, duplicados, búsqueda externa
  supabase/               Clientes de Supabase (browser / server / admin)
supabase/migrations/     Esquema SQL + políticas RLS + datos de ejemplo
tests/                   Pruebas del motor musical (vitest)
```

### Seguridad

- Row Level Security activo en todas las tablas con datos privados
  (`supabase/migrations/0002_rls.sql`).
- La `service_role` key solo se importa en `lib/supabase/admin.ts`, marcado
  con `import 'server-only'` — el build falla si se intenta usar desde un
  Client Component.
- Las claves de proveedores de IA solo viven en el servidor (Route Handlers).
- Middleware protege rutas de escritura (`/canciones/nueva`, `/listas/nueva`,
  `/perfil`, `/admin`) y valida rol de administrador/moderador para `/admin`.

## 8. Limitaciones conocidas y funciones pendientes

Este proyecto entrega un núcleo funcional completo y desplegable. Las
siguientes áreas quedan como puntos de extensión documentados, tal como
pide la especificación original (sección "no inventar integraciones que no
estén operativas"):

- **Búsqueda web externa** (`lib/services/external-search-service.ts`):
  la arquitectura de proveedores (`SongSearchProvider`) está implementada
  y lista, pero no incluye un proveedor real conectado por defecto —
  requiere que un administrador contrate y configure una API de búsqueda
  autorizada (`SEARCH_PROVIDER` / `SEARCH_API_KEY`). Sin configurar, la
  página `/buscar/web` lo indica claramente al usuario en vez de simular
  resultados falsos.
- **Metadatos opcionales al agregar una canción** (sección 6): el
  formulario `NewSongForm` solo pide título, artista y contenido. Los
  campos que ya existen en la tabla `songs` — álbum, año, tempo (BPM),
  compás, capo por defecto, categoría, etiquetas y notas para músicos —
  no tienen ningún campo en el formulario para completarlos.
- **Aceptar correcciones de la IA una por una**: la pantalla de
  comparación lista las correcciones propuestas, pero solo se pueden
  aceptar todas juntas o todas rechazadas (checkbox "usar versión
  corregida"); no hay manera de aceptar unas sí y otras no, como pide
  la especificación.
- **Compartir listas / colaboradores**: la tabla `setlist_members` y
  las políticas RLS para permisos de lectura/edición ya existen, pero
  no hay ninguna pantalla para invitar a alguien a una lista ni para
  ver quién tiene acceso — hoy una lista compartida solo se puede crear
  manualmente insertando filas en Supabase.
- **Foto de perfil**: el campo `avatar_url` existe en `profiles`, pero
  `ProfileForm` no tiene un campo para subir o cambiar la foto (además
  haría falta crear un bucket de Supabase Storage para alojarlas, que
  tampoco está configurado).
- **Vista previa de dos páginas tipo documento** (sección 14 del prompt
  original): la exportación a PDF ya respeta tamaño de papel, orientación,
  columnas y márgenes; la vista previa *interactiva* en el navegador antes
  de exportar no está implementada — se puede construir reutilizando
  `ChordChart` dentro de un contenedor con paginación CSS.
- **Control remoto del modo presentación desde otro dispositivo**: la
  arquitectura del modo presentación (`components/song/PresentationMode.tsx`)
  es autocontenida y no depende de estado del servidor, lo que la deja
  preparada para agregar sincronización en tiempo real vía Supabase
  Realtime, pero esa sincronización no está implementada todavía.
- **Autocompletado de acordes y atajos de teclado avanzados en el editor**:
  el editor actual (`SongEditForm`) es un textarea con vista previa en vivo;
  no incluye inserción rápida de acordes/secciones ni resaltado de sintaxis
  en tiempo real mientras se escribe.
- **Dashboard de métricas de consumo de IA por usuario**: se registra cada
  llamada en `song_ai_reviews` y se aplica un límite diario (30/día,
  configurable en `app/api/ai/review/route.ts`), pero no hay una vista de
  administración que grafique el consumo histórico.
- El tipado `lib/supabase/database.types.ts` incluido es un placeholder
  mínimo — regenéralo con la CLI de Supabase (paso 3.3) para tener
  autocompletado y chequeo de tipos exacto de tu esquema real.

## 9. Diagnóstico de errores comunes

**"infinite recursion detected in policy for relation setlists"**

Ocurre al crear o abrir listas/repertorios. Causa: la política de
`setlists` consulta `setlist_members` para saber si eres colaborador, y
las políticas de `setlist_members` consultan `setlists` para saber si eres
el dueño — un ciclo que Postgres detecta y aborta. Corre
`supabase/migrations/0005_fix_setlist_rls_recursion.sql` en el SQL Editor
de Supabase; reemplaza esas políticas por funciones `SECURITY DEFINER`
que rompen el ciclo (mismo patrón que ya usan las políticas de
moderación).

**"permission denied for table songs" (o cualquier otra tabla)**

Este es distinto a un problema de RLS. Significa que al rol `authenticated`
(o `anon`) de Supabase le falta el privilegio de PostgreSQL a nivel de
tabla — un requisito *previo* e independiente de las políticas RLS. Si ves
este error, ejecuta `supabase/migrations/0004_grants.sql` en el SQL Editor
de Supabase (si ya tenías el proyecto funcionando antes de que este archivo
se agregara al repo, es el único paso que te falta). Es seguro volver a
ejecutarlo aunque ya existan los permisos.

**"No se pudo guardar la canción" / errores al guardar listas o propuestas**

El formulario ahora muestra el mensaje de error real de Supabase (antes
mostraba un texto genérico). Las causas más comunes son:

- **Falta la fila en `profiles` para tu usuario** (la más frecuente). La
  tabla `songs` tiene una llave foránea `created_by → profiles(id)`. Esa
  fila se crea automáticamente con el trigger `trg_on_auth_user_created`
  cuando te registras *después* de aplicar `0001_schema.sql`. Si creaste
  tu usuario antes de aplicar las migraciones, o lo creaste manualmente
  desde el panel de Supabase, no tendrás perfil y cualquier inserción
  fallará con un error de tipo `violates foreign key constraint
  "songs_created_by_fkey"`. Solución: ejecuta en el SQL Editor:

  ```sql
  insert into public.profiles (id, display_name, role)
  select id, split_part(email, '@', 1), 'user'
  from auth.users
  where id = auth.uid()
  on conflict (id) do nothing;
  ```

  o simplemente cierra sesión, vuelve a registrarte con otro correo una
  vez aplicadas las migraciones, y confirma con:

  ```sql
  select * from profiles where id = auth.uid();
  ```

- **Políticas RLS no aplicadas**: si solo corriste `0001_schema.sql` y no
  `0002_rls.sql`, Row Level Security queda activo (Supabase lo activa por
  defecto en proyectos nuevos) pero sin políticas, lo que bloquea todas las
  escrituras. Verifica que las tres migraciones se hayan ejecutado en
  orden.
- **Sesión expirada**: revisa que `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local` correspondan al mismo
  proyecto donde iniciaste sesión.

**Error 429 `insufficient_quota` de OpenAI (u otro proveedor de IA)**

No es un bug: significa que la cuenta de OpenAI (o el proveedor que hayas
configurado en `AI_PROVIDER`) se quedó sin saldo/cupo. El sistema está
funcionando como se diseñó — cuando el proveedor de IA falla, la app se
degrada automáticamente al análisis local (motor de acordes propio, sin
costo) en vez de romperse, y te avisa con el mensaje amarillo. Para tener
revisión real con IA: revisa la facturación en
https://platform.openai.com/account/billing, o cambia `AI_PROVIDER` en
`.env.local` a `anthropic` o `gemini` si tienes clave de esos proveedores.

## 10. Flujo principal (según especificación)

1. El usuario inicia sesión.
2. Va a "Agregar canción", pega letra con o sin acordes.
3. Presiona "Revisar y estructurar con IA".
4. El servidor valida sesión y límite diario, corre el motor local de
   acordes como contexto, y llama al proveedor de IA configurado.
5. Se muestra el comparador lado a lado (original vs. estructurado).
6. El usuario acepta la versión de IA, la edita, o vuelve a analizar.
7. Guarda como borrador o publica.
8. La canción aparece en el catálogo según su visibilidad.

## 11. Licencia y contenido de terceros

Este código es tuyo para usar y modificar. Recuerda que las **letras y
acordes de canciones** que agregues a la plataforma pueden estar protegidas
por derechos de autor — la plataforma registra la fuente de cada canción
(`song_sources`) precisamente para que puedas gestionar atribución y
solicitudes de retiro, pero la responsabilidad de respetar esos derechos
es de quien administra el contenido.

## Failover de proveedores de IA

La revisión de canciones puede probar varios proveedores en orden. Configura en `.env.local`:

```env
AI_PROVIDER_ORDER=groq,openrouter,gemini
AI_TIMEOUT_MS=20000
AI_MAX_RETRIES=0

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-20b

OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free

GOOGLE_GENERATIVE_AI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Los proveedores sin API key se omiten. Si un proveedor falla, se prueba el siguiente. Si todos fallan, la aplicación conserva el análisis local de acordes.

## Mejoras de análisis de canciones

- Si la canción ya incluye etiquetas como `[CORO]`, `[ESTROFA]` o `[PUENTE]`, la revisión conserva exactamente esos encabezados y evita duplicarlos dentro de cada sección.
- La detección tonal considera raíz, calidad mayor/menor/disminuida, acordes suspendidos, cadencias y cierres de sección; esto ayuda a distinguir tonalidades relativas como D y Bm.
- En la pantalla de edición, los propietarios y moderadores pueden ejecutar nuevamente el análisis, previsualizar el resultado y aplicarlo antes de guardar.

## Reestructuración con IA o local

Al agregar o editar una canción se puede elegir entre **IA** y **Local**. El modo local no consume API, conserva las secciones existentes, normaliza `[VERSO]`/`[VERSE]` como `[ESTROFA]` y, cuando no hay encabezados, crea secciones por bloques (los bloques repetidos se consideran coros).

## Estructuración semántica con IA

Cuando el texto original no contiene encabezados, la IA recibe una instrucción explícita para inferir INTRO, ESTROFA, PRE-CORO, CORO, PUENTE y otras secciones por su función musical. Las secciones locales por párrafos ya no se envían como estructura obligatoria. Si el original sí contiene encabezados, se conservan; VERSO/VERSE se normaliza a ESTROFA.

## Prevención de canciones duplicadas
Antes de crear o editar una canción, el sistema comprueba coincidencias por título + artista normalizados y por alta similitud del contenido. Si encuentra una copia, bloquea el guardado y dirige al usuario a trabajar sobre la canción existente.

## Pipeline híbrido de análisis de canciones

El análisis usa tres fases:

1. **Preanálisis local:** detecta tono, tono alternativo, modulación, acordes y encabezados sin consumir API.
2. **IA focalizada:** recibe la canción una sola vez y se concentra en estructura semántica y ambigüedades. Los prompts ya no duplican la letra ni las secciones locales.
3. **Validación local:** normaliza etiquetas, elimina secciones idénticas, valida el tono y comprueba que la IA haya conservado al menos el 92 % de las líneas. Una respuesta incompleta activa el siguiente proveedor.

Para evitar límites gratuitos de tokens, Groq usa salida máxima de 2200 tokens, razonamiento bajo y los errores 413 pasan directamente al siguiente proveedor sin reintento.

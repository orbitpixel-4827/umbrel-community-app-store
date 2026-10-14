# Registro multimedia para UmbrelOS

Versión 2.0.0 con interfaz MiEstilo e ícono de biblioteca naranja para iPhone.

## Instalar desde tu tienda de Umbrel

La tienda está en https://github.com/orbitpixel-4827/umbrel-community-app-store.
Agrega esa dirección en las tiendas comunitarias de Umbrel si todavía no aparece.
Busca **Registro Multimedia** e instálala. Su identificador es
`experimental-registro-multimedia` y usa el puerto `3420`.
Si tu instalación anterior ocupa ese puerto, detenla antes de instalar la nueva.

La tienda usa una imagen publicada para Intel/AMD y ARM:
`ghcr.io/orbitpixel-4827/registro-multimedia:2.0.0`.
El flujo de GitHub Actions verifica la compatibilidad de SQLite antes de construirla.
Espera a que termine correctamente antes de instalar.
Si GHCR pide credenciales, en GitHub abre tu perfil → Packages → registro-multimedia
→ Package settings → Change visibility → Public.

La configuración de tienda está en `umbrel/`. Al publicar, `umbrel/docker-compose.yml`
y `umbrel/umbrel-app.yml` se colocan en la raíz de la carpeta de la app en la tienda.
El archivo `umbrel/registro-multimedia-image.yml` va en `.github/workflows/`.
El `docker-compose.yml` de la raíz de este proyecto sigue siendo para instalación manual.
En la copia publicada dentro de la tienda, la configuración manual se llama
`docker-compose.manual.yml`; allí usa `docker compose -f docker-compose.manual.yml up -d --build`.

## Usarla desde iPhone y Tailscale

1. Conecta el iPhone a tu red Tailscale.
2. Abre en Safari `http://IP_TAILSCALE_DE_UMBREL:3420`.
3. Inicia sesión en Umbrel si lo solicita.
4. Desde la pantalla de Registro, usa Compartir → Agregar a pantalla de inicio.

El ícono PNG de Apple se sirve desde `/icons/apple-touch-icon.png`; el manifest y
los íconos usan el mismo servidor y puerto desde el que abriste la app. No hay
referencias fijas a `umbrel.local` en el frontend. El proxy de la tienda permite
leer solamente los íconos y el manifest sin sesión para que iOS pueda obtenerlos.
Los registros siguen detrás de la sesión de Umbrel en la versión de tienda.
Si ya tenías un acceso directo con el ícono anterior, elimínalo y agrégalo de nuevo
desde la URL definitiva de Tailscale: iOS puede conservar el ícono antiguo.

Sobre HTTP por IP no se activa un service worker; el acceso directo usa las
etiquetas de Apple y el ícono PNG. Para funciones de PWA que requieren un contexto
seguro, configura HTTPS con un nombre de tu red Tailscale. El ícono no requiere
service worker y los registros no se almacenan en el iPhone.

## Migrar tus registros anteriores a la versión de tienda

La migración copia la base completa y las portadas. Conserva la instalación antigua
y su respaldo hasta verificar tus registros en la nueva. No desinstales la app
antigua antes de obtener la copia de sus datos.

1. En la carpeta de tu instalación anterior, detén el contenedor y crea el respaldo:

```bash
docker compose down
tar -czf registro-antes-de-migrar.tar.gz server/data server/uploads
```

2. Instala Registro Multimedia desde tu tienda y detenla desde Umbrel. La app nueva
   debe permanecer detenida durante la copia. No agregues registros nuevos todavía.

3. Para conocer las carpetas reales creadas por Umbrel, usa:

```bash
docker inspect experimental-registro-multimedia_web_1 --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

Busca los destinos `/app/server/data` y `/app/server/uploads`. Sus orígenes son las
carpetas `data` y `uploads` de la app nueva. Normalmente están dentro de
`~/umbrel/app-data/experimental-registro-multimedia/`, pero usa las rutas mostradas
por tu dispositivo. Si Umbrel eliminó el contenedor al detenerlo, consulta los
volúmenes del `docker-compose.yml` de la app: usan `${APP_DATA_DIR}/data` y
`${APP_DATA_DIR}/uploads`.

4. Copia, con ambas apps detenidas, el contenido de estas carpetas:

| Instalación anterior | Instalación nueva de la tienda |
| --- | --- |
| `server/data/` | `data/` |
| `server/uploads/` | `uploads/` |

Copia la base con el nombre `registro.sqlite`. Conserva los nombres de las portadas
y copia cualquier archivo auxiliar de SQLite junto con la base. Guarda también
un respaldo de las carpetas de destino si ya tienen datos. Esta operación reemplaza
la biblioteca de destino; no combina dos bibliotecas.

5. Copia tus API keys al `docker-compose.yml` instalado en Umbrel, dentro del servicio
   `web`. No las subas a GitHub. Al editar variables de entorno, hay que recrear el
   contenedor; un reinicio simple no aplica los cambios. Desde la carpeta instalada,
   con `APP_DATA_DIR` apuntando a esa misma carpeta, ejecuta:

```bash
APP_DATA_DIR="$PWD" docker compose up -d --force-recreate web
```

Después inicia la app desde Umbrel. Comprueba los contadores de Biblioteca,
Pendientes y Deseos, abre varios registros antiguos y verifica sus portadas.
La actualización de categorías se ejecuta automáticamente dentro de una transacción
SQLite y conserva IDs, notas, fechas y portadas. Las fechas antiguas `DD/MM/YYYY`
se siguen leyendo y se convierten a ISO al editar el registro.

Si sigues usando la instalación manual, conserva `server/data/` y `server/uploads/`,
reemplaza únicamente el código y ejecuta `docker compose up -d --build`.
No copies carpetas de datos vacías sobre las existentes.

## Verificación del rediseño

Las pruebas de interfaz usan datos ficticios y guardan sus archivos en `.verification/`
dentro del proyecto. Comprueban paginación con 137 registros, filtros, fechas antiguas,
portadas manuales, búsqueda con Enter y guardado consecutivo. Las pruebas SQLite de
`tests/database.test.js` verifican la migración de una base con las tres categorías
originales, los 137 registros, edición y eliminación explícita. Se ejecutan en GitHub
antes de publicar la imagen, sin usar tu base real.

Las librerías Chart.js y Lucide se sirven desde `public/vendor/`, conservando sus
avisos de licencia incluidos. No necesitan un CDN para dibujar la interfaz.

Version self-hosted de Registro multimedia para guardar peliculas, libros, videojuegos, comics y mangas en tu propio servidor. No usa Supabase: la app sirve un frontend local, una API con Node.js + Express y una base SQLite persistente.

## Instalacion manual en UmbrelOS

1. Copia esta carpeta a tu Umbrel, por ejemplo en:

```bash
~/umbrel/app-data/registro-multimedia
```

2. Entra a la carpeta:

```bash
cd ~/umbrel/app-data/registro-multimedia
```

3. Levanta la app:

```bash
docker compose up -d
```

4. Abre la app desde tu red local:

```text
http://umbrel.local:3420
```

El puerto externo es `3420` y el puerto interno del contenedor es `3000`.

## Cambiar el puerto

Edita `docker-compose.yml` y cambia esta linea:

```yaml
ports:
  - "3420:3000"
```

Por ejemplo, para usar `3456`:

```yaml
ports:
  - "3456:3000"
```

Despues reinicia:

```bash
docker compose down
docker compose up -d
```

## Donde se guardan los datos

La base de datos SQLite se guarda en:

```text
server/data/registro.sqlite
```

Las portadas subidas manualmente se guardan en:

```text
server/uploads/
```

Ambas rutas estan montadas como volumenes persistentes en `docker-compose.yml`, por lo que sobreviven a reinicios y recreaciones del contenedor.

## Backup

Deten la app y copia la base de datos junto con las portadas:

```bash
docker compose down
tar -czf registro-multimedia-backup.tar.gz server/data server/uploads
docker compose up -d
```

## Restaurar backup

Coloca el archivo de backup en la carpeta de la app y ejecuta:

```bash
docker compose down
tar -xzf registro-multimedia-backup.tar.gz
docker compose up -d
```

## Actualizar la app

1. Haz backup de `server/data` y `server/uploads`.
2. Reemplaza los archivos de la app por la version nueva.
3. Reconstruye el contenedor:

```bash
docker compose down
docker compose build --no-cache
docker compose up -d
```

## Acceso desde Umbrel

La app queda disponible en:

```text
http://umbrel.local:3420
```

Para agregarla como acceso directo en Umbrel, usa la opcion de acceso directo o app link personalizada de tu entorno Umbrel y apunta a esa URL. Si accedes desde otro dispositivo, tambien puedes usar la IP del Umbrel:

```text
http://IP_DE_TU_UMBREL:3420
```

## API keys opcionales

La app funciona sin API keys y permite agregar registros manualmente. Para busqueda automatica puedes configurar:

- `TMDB_API_KEY` para peliculas.
- `RAWG_API_KEY` para videojuegos.
- `GOOGLE_BOOKS_API_KEY` para Google Books, opcional porque Google Books puede responder sin key en usos bajos.
- `COMICVINE_API_KEY` para comics occidentales. Se obtiene en https://comicvine.gamespot.com/api/ iniciando sesion.

AniList se usa para manga y no requiere API key para busquedas publicas.

Edita `docker-compose.yml`:

```yaml
environment:
  TMDB_API_KEY: "tu_key_tmdb"
  RAWG_API_KEY: "tu_key_rawg"
  GOOGLE_BOOKS_API_KEY: "tu_key_google"
  COMICVINE_API_KEY: "tu_key_comicvine"
```

Luego reinicia:

```bash
docker compose down
docker compose up -d
```

Open Library, Gutendex y AniList no necesitan API key.

## PWA y cache

Se conserva `manifest.json` y un `service-worker.js` basico. El service worker no cachea archivos de forma agresiva para evitar problemas al actualizar manualmente.

Si mas adelante quieres modo offline, puedes ampliar `public/service-worker.js` con una estrategia de cache, pero recuerda cambiar la version del cache en cada actualizacion.

## Funciones incluidas

- Inicio, Actualmente, Recientes, Biblioteca, Pendientes, Lista de deseos y Estadisticas.
- Navegacion inferior tipo app movil.
- Diseno responsive para iPhone.
- Tema claro minimalista con acento naranja `#f97316`.
- Busqueda automatica con TMDB, RAWG, Comic Vine, AniList, Open Library, Google Books y Gutendex.
- Categorias: Pelicula, Libro, Videojuego, Comic y Manga.
- Agregar registros manualmente.
- Guardado directo sin confirmacion adicional.
- Detalle, edicion y eliminacion de registros.
- Cambio de estado: `wishlist`, `pending`, `active`, `finished`.
- Calificacion personal de 1 a 5.
- Notas personales y fechas.
- Biblioteca solo muestra terminados.
- Pendientes solo muestra pendientes.
- Lista de deseos solo muestra wishlist.
- Actualmente solo muestra activos.
- Filtros por categoria y ano.
- Estadisticas con Chart.js por ano de finalizacion.
- Portadas por URL o subida manual.
- Subida de portadas `jpg`, `jpeg`, `png` y `webp` hasta 5 MB.
- Fallback visual cuando una portada falla.

## API local

Endpoints principales:

```text
GET    /api/items
GET    /api/items/:id
POST   /api/items
PUT    /api/items/:id
DELETE /api/items/:id
POST   /api/uploads/cover
```

El frontend se sirve desde `public/`.

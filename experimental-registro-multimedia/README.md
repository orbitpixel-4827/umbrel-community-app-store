# Registro Multimedia para UmbrelOS

Versión 2.0.1. Biblioteca personal de películas, libros, videojuegos, cómics y manga,
con interfaz MiEstilo naranja y acceso desde iPhone. Los registros se guardan en
SQLite y las portadas subidas en el servidor. No usa Supabase.

## Instalar y actualizar desde la tienda

Agrega https://github.com/orbitpixel-4827/umbrel-community-app-store como tienda
comunitaria en Umbrel y busca **Registro Multimedia**.
Identificador: `experimental-registro-multimedia`. Puerto: `3420`.

Para actualizar una instalación existente, usa **Actualizar** en Umbrel. No la
desinstales ni vuelvas a migrar los registros. Se mantienen el identificador y
los volúmenes de datos de la versión 2.0.0.

La imagen publicada es `ghcr.io/orbitpixel-4827/registro-multimedia:2.0.1`, para
linux/amd64 y linux/arm64. Antes de actualizar, conserva un respaldo de los datos,
portadas y API keys. Las claves escritas a mano en el compose instalado pueden
necesitar configurarse de nuevo cuando Umbrel sustituya ese archivo.

## Novedades 2.0.1

- Bloquea los campos mientras guarda y conserva el borrador si falla la escritura.
- Distingue un guardado confirmado de un fallo posterior de recarga, evitando
  reenviar un alta ya aceptada.
- Muestra errores dentro del modal abierto y recupera el selector de estado si falla.
- El cambio de estado envía únicamente estado y fecha necesaria, conservando
  notas y otros campos que otra sesión pudo actualizar.
- Usa el día local al marcar terminado y rechaza fechas imposibles o tipos
  incorrectos sin borrar la fecha anterior.
- Conserva fechas heredadas omitidas al editar otros datos.
- Descarta respuestas de búsquedas anteriores y no reabre detalles cerrados al
  terminar un cambio de estado lento.
- Conserva foco en filtros/paginación, párrafos de notas y sustitutos de portadas
  también en los resultados de búsqueda.

No se añade control general de versiones para ediciones simultáneas del mismo
formulario. No cambia la prioridad de las portadas manuales.

## Acceso desde iPhone y Tailscale

Abre `http://umbrel.local:3420`, la IP local del Umbrel o
`http://IP_TAILSCALE:3420`. Para Tailscale, conecta también el iPhone a esa red.
En Safari, inicia sesión en Umbrel si se solicita y selecciona
**Compartir → Agregar a pantalla de inicio**.

Los íconos PNG y el manifest usan rutas del mismo servidor, sin un dominio fijo.
El ícono de Apple está en `/icons/apple-touch-icon.png`. El proxy permite obtener
íconos y manifest antes de iniciar sesión; los registros siguen detrás de Umbrel.
Si iOS conserva un ícono viejo, elimina el acceso directo y vuelve a crearlo.

El acceso directo por HTTP usa las etiquetas de Apple. El service worker solo se
registra en un contexto seguro; no proporciona modo offline ni caché agresiva.
HTTPS es necesario para las funciones PWA que lo exigen.

## Datos y portadas

El compose de tienda conserva estos montajes:

```yaml
volumes:
  - ${APP_DATA_DIR}/data:/app/server/data
  - ${APP_DATA_DIR}/uploads:/app/server/uploads
```

La base se llama `data/registro.sqlite`; las portadas están en `uploads/`.
En una instalación habitual la carpeta de la app está en
`/home/umbrel/umbrel/app-data/experimental-registro-multimedia`.
Los reinicios y actualizaciones conservan estos volúmenes.

Para ver las rutas exactas, consulta los montajes **con la app encendida**:

```bash
sudo docker inspect experimental-registro-multimedia_web_1 --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
```

Si el nombre varía, localízalo con `sudo docker ps --format 'table {{.Names}}\t{{.Image}}'`.
Umbrel puede retirar los contenedores al detener una app: consulta las rutas antes.

## Respaldo y restauración

Después de identificar la carpeta, detén la app desde Umbrel y respalda
`data/`, `uploads/` y tu configuración privada. Desde esa carpeta:

```bash
sudo tar -czf "registro-backup-$(date +%Y%m%d-%H%M%S).tar.gz" data uploads docker-compose.yml
```

El respaldo de compose puede contener tus API keys: guárdalo de forma privada y
no lo subas al repositorio.

Para restaurar, mantén la app detenida, conserva un respaldo de los archivos de
destino y recupera la base y portadas en `data/` y `uploads/`, respectivamente.
Conserva el nombre `registro.sqlite` y cualquier archivo auxiliar de SQLite junto
con la base. Revisa las API keys por separado; no sustituyas un compose actualizado
por uno antiguo. Inicia la app y comprueba contadores, notas y portadas.

## Migración desde una instalación manual anterior

Esta operación solo corresponde a quien todavía usa la versión manual; una
actualización de la app de tienda no requiere migrar de nuevo.

1. Detén la versión anterior y respalda `server/data/` y `server/uploads/`.
2. Instala la versión de tienda. Con la app nueva encendida, consulta sus montajes.
3. Detén también la app nueva antes de copiar.
4. Copia el contenido de `server/data/` a `data/` y de `server/uploads/` a
   `uploads/` dentro de la carpeta de datos de la nueva app.
5. Configura tus claves e inicia la app nueva. Verifica los registros antes de
   retirar la instalación anterior.

La copia reemplaza la biblioteca de destino; no combina dos bibliotecas.
Conserva los originales y respaldos. No uses archivos de las capas internas
`docker/overlay2` como origen de la migración.

## API keys opcionales

Usa la terminal del servidor Umbrel o SSH; la consola interna del contenedor
puede no tener `sudo` ni acceso al compose del servidor.

Edita el `docker-compose.yml` instalado en la carpeta de la app, dentro del
servicio `web` → `environment`:

```yaml
TMDB_API_KEY: "tu_clave"
RAWG_API_KEY: "tu_clave"
GOOGLE_BOOKS_API_KEY: "tu_clave"
COMICVINE_API_KEY: "tu_clave"
```

Guarda el archivo y **detén e inicia la app desde Umbrel**, para que los
contenedores se recreen con las nuevas variables. No ejecutes el compose de
tienda por separado: contiene el servicio `app_proxy` que Umbrel completa.

TMDB se usa para películas, RAWG para videojuegos y Comic Vine para cómics.
Google Books es opcional para libros. Open Library, Gutendex y AniList (manga)
no requieren clave. Sin claves, agregar manualmente sigue funcionando.
No publiques claves en GitHub ni las incluyas en capturas.

## Funciones

Inicio muestra activos y recientes terminados. Biblioteca muestra todos los
terminados, filtrados por título, categoría y año de finalización, ordenados
por `finished_date` descendente y paginados de 50 en 50. Las fechas sin valor
van al final. Se leen fechas ISO y fechas heredadas `DD/MM/YYYY`.
Pendientes y Deseos se ordenan alfabéticamente con búsqueda normalizada.
Las estadísticas usan solo terminados y permiten filtrar por año de finalización.

El botón + abre el buscador; solo consulta al enviar con Enter o Buscar.
Se pueden crear, editar y eliminar registros, calificar de 1 a 5, escribir notas
y subir portadas JPG, PNG o WebP de hasta 5 MB.
Una portada manual existente se conserva al editar; un archivo nuevo tiene
prioridad sobre el campo URL.

## Desarrollo y pruebas

El `docker-compose.yml` de esta carpeta es el paquete de tienda de Umbrel.
Para una instalación manual desde el código utiliza:

```bash
docker compose -f docker-compose.manual.yml up -d --build
```

Esa configuración monta `server/data/` y `server/uploads/` y usa el puerto 3420.
No ejecutes ambas instalaciones en ese puerto al mismo tiempo.

GitHub Actions comprueba las fuentes y ejecuta:

```bash
node --test tests/database.test.js tests/api.test.cjs
```

Las pruebas usan SQLite y Express reales con bases/portadas desechables, incluyendo
migración de 137 registros. `tools/verify-ui.cjs` usa Playwright y un navegador
disponible con respuestas sintéticas para verificar la interfaz, filtros,
paginación y fallos de red. Los proveedores externos no se consultan en esas pruebas.
Los archivos de prueba quedan en `.verification/`; no uses tu base real para probar.

Chart.js y Lucide se sirven desde `public/vendor/`, con sus licencias.
El frontend se sirve desde `public/`.

## API local

```text
GET    /api/items
GET    /api/items/:id
POST   /api/items
PUT    /api/items/:id
DELETE /api/items/:id
POST   /api/uploads/cover
GET    /api/health
GET    /api/config
GET    /api/search/comics
GET    /api/search/manga
```

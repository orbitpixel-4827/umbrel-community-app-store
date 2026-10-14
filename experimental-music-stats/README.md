# Music Stats

Aplicación web autohospedada para registrar y analizar scrobbles de Last.fm con almacenamiento local en SQLite. Está pensada para ejecutarse en Docker/Umbrel y funcionar como una alternativa privada a Last.fm Pro y Spotify Wrapped.

## Funciones incluidas

- Sincronización automática con Last.fm cada 30 minutos.
- Sincronización manual de historial completo desde `Config`.
- Importación deduplicada de reproducciones.
- Base de datos SQLite local con artistas, álbumes, canciones y reproducciones.
- Caché local de portadas de álbum cuando Last.fm devuelve imágenes.
- Dashboard del mes actual.
- Página de estadísticas para 3 meses, 6 meses, 1 año o todo el historial.
- Wrapped privado por periodo.
- Búsqueda global de canciones, artistas y álbumes con panel de detalle.
- Configuración de usuario y API Key de Last.fm desde la interfaz.

## Puesta en marcha

### Instalación desde la tienda de Umbrel

Agrega esta tienda comunitaria a Umbrel:

https://github.com/orbitpixel-4827/umbrel-community-app-store

Instala **Music Stats** y abre **Ajustes** para guardar tu usuario y API Key.
Después prueba la conexión y ejecuta **Sincronizar historial completo**.
La app usa el puerto 3001 y conserva SQLite y las portadas en el volumen
`${APP_DATA_DIR}/data`, incluso al reiniciar. La API Secret es opcional.

La carpeta `umbrel/` contiene el manifiesto, Compose para Umbrel y el workflow
de publicación de la imagen para Intel y ARM. En la tienda, el proyecto reside
en `experimental-music-stats/`; el workflow reside en `.github/workflows/`.
El paquete `ghcr.io/orbitpixel-4827/music-stats` debe tener visibilidad pública
para que Umbrel pueda descargarlo sin credenciales de GitHub.

### Instalación con Docker Compose

1. Copia el archivo de variables:

```bash
cp .env.example .env
```

2. Edita `.env` con tus datos de Last.fm. También puedes dejar esos campos vacíos y configurarlos después desde `Config` en la app.

```env
# Usuario público de Last.fm del que se leerán los scrobbles.
LASTFM_USERNAME=tu_usuario_lastfm

# API Key de Last.fm. No uses el Shared Secret.
LASTFM_API_KEY=tu_api_key_lastfm

# Opcional por ahora. Se reserva para futuras funciones autenticadas.
LASTFM_API_SECRET=

PORT=3001
DATABASE_PATH=/app/data/music-stats.sqlite
IMAGE_CACHE_DIR=/app/data/image-cache
FRONTEND_DIST_PATH=/app/frontend/dist
SYNC_INTERVAL_MINUTES=30
DEFAULT_TRACK_DURATION_SECONDS=180
```

3. Construye y levanta el contenedor:

```bash
docker compose up -d --build
```

4. Abre la app:

[http://localhost:3001](http://localhost:3001)

En Umbrel, crea una carpeta para la app, copia este proyecto y ejecuta el mismo `docker compose up -d --build`. El volumen `./data` conserva la base de datos y la caché de imágenes.

Desde otro equipo de tu red, abre:

```text
http://IP_DEL_SERVIDOR:3001
```

## API Key de Last.fm

Music Stats necesita estas variables de Last.fm:

- `LASTFM_USERNAME`: tu nombre de usuario de Last.fm, por ejemplo `miusuario`.
- `LASTFM_API_KEY`: la API Key de una aplicación creada en Last.fm.
- `LASTFM_API_SECRET`: opcional por ahora. Puedes dejarlo vacío.

No necesita contraseña, token de sesión ni credenciales de Spotify.

Para obtener la API Key:

1. Entra a [Last.fm API account creation](https://www.last.fm/api/account/create).
2. Crea una aplicación nueva.
3. Copia el campo `API Key`.
4. Pégalo en `.env` o en la sección `Config` de Music Stats.

No hace falta guardar el `Shared secret` para esta primera versión porque solo se leen scrobbles públicos del usuario configurado.

Si Last.fm devuelve `403`, la app guardará y mostrará el mensaje exacto que devuelva Last.fm. En `Config` puedes usar `Probar conexión Last.fm` para ver el cuerpo real de respuesta y revisar los logs del contenedor.

## Rutas servidas por Docker

El Dockerfile compila React con `npm run build` y deja el resultado en:

```text
/app/frontend/dist
```

Express sirve el frontend desde `FRONTEND_DIST_PATH=/app/frontend/dist`. La ruta `/` devuelve `index.html`, las rutas internas de React también devuelven `index.html`, y las rutas `/api/*` siguen respondiendo JSON.

## Desarrollo local

```bash
npm install
npm run dev
```

El backend corre en `http://localhost:3001` y el frontend de Vite en `http://localhost:5173`. Para desarrollo puedes definir:

```env
VITE_API_BASE=http://localhost:3001
```

## Estructura

```text
backend/
  src/
    db.js        Migraciones SQLite y helpers de configuración.
    lastfm.js    Cliente Last.fm, deduplicación, caché de imágenes.
    search.js    Búsqueda global y detalles.
    stats.js     Consultas agregadas para dashboard, stats y Wrapped.
    server.js    API REST, cron y servidor web.
frontend/
  src/
    App.jsx      Vistas principales.
    api.js       Cliente HTTP.
    components.jsx
    styles.css
```

## Datos locales

La base se guarda en `./data/music-stats.sqlite`. Las portadas cacheadas se guardan en `./data/image-cache` y se sirven desde `/cache`.

La sincronización automática solo revisa scrobbles recientes para no volver a descargar todo el historial cada 30 minutos. Para importar todos los scrobbles antiguos, usa `Config` -> `Sincronizar historial completo`.

Navidrome queda preparado como futura fuente por el campo `source` en `plays` y por la separación entre entidades musicales y reproducciones importadas.

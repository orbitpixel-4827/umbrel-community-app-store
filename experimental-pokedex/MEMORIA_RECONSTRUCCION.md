# Pokédex Umbrel — memoria de reconstrucción

Documento técnico sin credenciales. Mantenerlo actualizado al terminar cada cambio.

## Alcance y ubicación

Aplicación web/PWA personal para iPhone, alojada en Umbrel. El proyecto Android está separado y no debe modificarse al trabajar aquí. Carpeta de trabajo: `Pokedex Umbrel/`; código publicable: `repository/experimental-pokedex/`. Todos los archivos de desarrollo y temporales deben permanecer en el SSD externo.

Repositorio y tienda comunitaria: https://github.com/orbitpixel-4827/umbrel-community-app-store . Identificador Umbrel: `experimental-pokedex`. No reconstruir otras apps de la tienda ni sobrescribir sus cambios.

## Arquitectura

- `server.py`: servidor HTTP Python multihilo, sesiones privadas, CSRF, SQLite y trabajos de reconocimiento consultables sin reenviar imágenes.
- `core.py`: PokeAPI, fichas por videojuego, formas y transformaciones, estadísticas, defensas, movimientos, recursos e información complementaria.
- `chatgpt.py`: conexión oficial con el plan de ChatGPT, renovación y verificación de tokens, catálogo de modelos y reconocimiento de imágenes. Credenciales exclusivamente en el volumen de Umbrel.
- `static/app.mjs`: interfaz, navegación, cámara, fichas, colección, estadísticas, preferencias y audio. `domain.mjs`: reglas de presentación, formas, filtros, fórmulas y efecto robótico. `transport.mjs`: límites de espera, tratamiento de fallos y consulta de trabajos.
- `static/assets/`: iconos, catálogo de videojuegos y tabla de tipos; conservar el icono de Pokédex para el acceso directo de iPhone.
- `Dockerfile`, `docker-compose.yml`, `umbrel-app.yml`: imagen y registro en Umbrel. `.github/workflows/pokedex-image.yml`: pruebas y publicación multi arquitectura en GHCR.

## Persistencia y seguridad

Volumen `/data` en el contenedor, enlazado a `${APP_DATA_DIR}/data` en Umbrel. Base `pokedex.sqlite3` con WAL: encuentros, preferencias (incluidos favoritos), sesiones, cachés, blobs de audio/recursos y estado privado de proveedores. Mantener el volumen al actualizar. No copiar bases reales, contraseñas, claves, cookies, certificados privados ni archivos de conexión al repositorio o a esta memoria.

Las exportaciones JSON de encuentros son compatibles con Android. No incluyen credenciales. Un encuentro tiene UUID, especie nacional, fecha, formato, origen y ficha con forma. Escaneos y altas son idempotentes: una reconexión no debe volver a consumir reconocimiento ni duplicar encuentros.

## Experiencia que conservar

Carcasa roja en inicio, interior claro, tarjetas redondeadas, etiquetas en cápsula, colores por tipo, iconos de contorno y hojas emergentes coherentes. Fichas desplazables: Ficha, Stats, Movimientos, Otros. Estadísticas por juego, métodos de aprendizaje, defensas y evoluciones. Formas conocidas con imagen; desconocidas en sombra y sin acceso a su información. Tipos y debilidades filtran la colección registrada. Audio automático únicamente después de un escaneo, nunca al abrir fichas manualmente. Efecto metálico local y reproducción algo acelerada.

## Red e iPhone: regresiones que evitar

HTTPS de confianza es necesario para vídeo en vivo; una foto es la alternativa en contexto no seguro. El navegador solo llama al mismo origen; Umbrel accede a proveedores. No fijar IP, hostname ni origen de Tailscale en el código. Respetar Host/Origin, sesión y CSRF. No interpretar errores de cuota o autenticación del proveedor como cierre de sesión de Pokédex.

Safari conservaba una interfaz vieja mediante un service worker. Desde 1.3.2 no se instala un nuevo worker: `sw.js` solo retira cachés antiguas y se desregistra. Nunca devolver HTML de caché para `/api/*` o `/health`. La sesión y colección deben obtenerse del servidor; las cachés opcionales de audio no pueden bloquear arranque, ficha o reproducción. Liberar conexiones HTTP inactivas. Tras suspensión, recuperar datos sin destruir formularios, hojas o cámara.

En iOS iniciar AudioContext dentro de un gesto del usuario, seleccionar sesión de audio `playback` y reanudar tras interrupciones de cámara o segundo plano. No depender de speechSynthesis del sistema.

## Publicación y reconstrucción

1. Recuperar el código del repositorio de la tienda, incluyendo datos estáticos y workflow.
2. Ejecutar pruebas Python y Node del directorio `tests/` y comprobar sintaxis JavaScript. Las pruebas usan fixtures, nunca datos privados.
3. Subir código y versión de imagen mediante GitHub. El workflow prueba y publica `ghcr.io/orbitpixel-4827/pokedex:<version>` para amd64 y arm64.
4. Esperar construcción exitosa; obtener el digest real de la imagen. Solo después actualizar `docker-compose.yml` con etiqueta y digest y `umbrel-app.yml` con versión y notas.
5. Conservar identificador, volumen, icono y puerto 9088. Verificar que `/health`, ajustes y manifiesto coincidan en versión. No anunciar disponible en la tienda antes de verificar publicación.

## Versión 1.4.0 — 2026-10-21

Implementados corazón activo rojo y filtro de favoritos; reconocimiento solo ChatGPT; narración GPT-Live progresiva sin caché bloqueante del navegador. `live_voice.py` controla sesiones y audio PCM, `static/audio-stream.mjs` decodifica la respuesta por fragmentos. El servidor guarda WAV únicamente tras completar la sesión. El filtro metálico conserva su estado entre fragmentos. El flujo se reproduce a velocidad 1 con un pequeño margen inicial: acelerar fragmentos que llegan en tiempo real vacía la cola y causa cortes. El ritmo ágil se solicita al modelo. Se detecta final mediante cola silenciosa porque Live no emite audio-done; duración máxima 55 segundos. No se usa micrófono. Las sesiones no se reintentan automáticamente. Las preferencias anteriores cambian de proveedor y voz sin borrar encuentros ni favoritos. GPT-Live requiere API de OpenAI con facturación independiente del plan ChatGPT, según documentación oficial. No reutilizar tokens del plan en endpoints de voz no autorizados.

Fuentes oficiales: https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference y https://developers.openai.com/api/docs/guides/live y https://developers.openai.com/api/docs/guides/live-conversations .

Pruebas de esta versión: 69 servidor/datos/HTTP, 11 conexión ChatGPT, 11 GPT-Live simulado, 4 migración y 83 JavaScript (178). Verificación visual en navegador interno con registros desechables: corazón rojo al guardar/quitar/volver a guardar, filtro de favoritos y ajustes con solo ChatGPT y GPT-Live. Sin prueba física de iPhone ni voz real con clave de API. No prometer latencia o fidelidad literal sin medir en dispositivo.

Fuente integrada mediante PR11 y PR12; commit final de código `e5c6d8ec324a86cb6af9936f2a351ff9ca13d057`. GitHub Actions: https://github.com/orbitpixel-4827/umbrel-community-app-store/actions/runs/39657939212 (pruebas y construcción exitosas). Imagen Intel/ARM verificada directamente en GHCR: `ghcr.io/orbitpixel-4827/pokedex:1.4.0@sha256:0b1753be0bc56fa9357bbb6b6a25d4c7ed68fe9f711a6734930223a7629a134f`. El manifiesto y Compose de esta entrega usan versión 1.4.0 y ese digest; comprobar que estén integrados en main antes de anunciar la actualización.

## Diagnóstico de voz 1.4.1 — 2026-10-21

La aceptación de una clave al consultar el catálogo no garantiza que se autorice la apertura de una sesión de voz. No atribuirlo a clave incorrecta ni falta de saldo sin evidencia. Antes, la app agrupaba HTTP 401/403 y afirmaba acceso a voz solo por consultar el catálogo; ese diagnóstico era insuficiente.

`live_voice.provider_problem` distingue autenticación, permisos, cuotas, región y disponibilidad; incluye código HTTP y motivo estructurado con claves y Bearer ocultos. Nunca devuelve HTML ni guarda el error bruto en logs. La conexión del servidor omite Origin de navegador, identifica la aplicación y prohíbe redirecciones. `check_access` consulta el catálogo sin coste de sesión y aclara que no comprueba apertura de voz ni saldo. Los errores de reproducción aparecen en una hoja persistente para poder leerlos. Esto mejora el diagnóstico; no demuestra por sí solo que la voz esté resuelta en el Umbrel real. La causa exacta de la denegación sigue pendiente de comprobar con el nuevo detalle.

La documentación oficial indica que el nivel Free de API no admite GPT-Live; tener permisos All en una clave no habilita modelos para la cuenta. No inferir el nivel de una cuenta ni su saldo a partir de un rechazo de sesión. Fuente: https://developers.openai.com/api/docs/models/gpt-live-1 .

Código de diagnóstico integrado en PR14: `74fa5cd74dc1ab552bfca1825467371395cb1408`. Pruebas remotas (189) y construcción exitosas: https://github.com/orbitpixel-4827/umbrel-community-app-store/actions/runs/39661608508 . Imagen 1.4.1 Intel/ARM verificada: `ghcr.io/orbitpixel-4827/pokedex:1.4.1@sha256:353d390b7ccd86935298a4a74b0f2c17fc43d398889f79a97f0a4d026f4cb4e7`. La resolución del rechazo de voz real sigue pendiente de comprobar con el nuevo diagnóstico.

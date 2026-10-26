# Basta — memoria del proyecto

Actualizar este archivo al concluir cada cambio importante. Leerlo primero al retomar.

## Petición y autorizaciones
- Recrear digitalmente la rueda roja de ¡Basta!/Tapple de la foto de la conversación del 26-10-2026.
- 2–10 participantes, nombres, avatares circulares con imágenes propias y encuadre de cara desde configuración.
- Inicio aleatorio, turnos visibles, foto del jugador y cuenta atrás de 10 segundos dentro del botón central.
- Letras no repetibles por ronda, puntos automáticos (1 por letra pulsada), tarjeta aleatoria al lado de rueda, categorías investigadas + exactamente 50 originales nuevas.
- Estilo inicialmente invocado y posteriormente REVOCADO por el usuario: `MiEstilo (invocación revocada)`. Fondo #fafafa, tarjetas blancas, carbón, turquesa accesible, radios 26–32, tipografía sistema, controles amplios, diálogos coherentes.
- GitHub solicitado explícitamente; cuenta comprobada mediante plugin: orbitpixel-4827. Tienda existente: orbitpixel-4827/umbrel-community-app-store, prefijo experimental. Nombre visible: Basta.
- Trabajar solamente en disco externo: `<disco externo autorizado>/Basta`. No crear cachés, archivos, dependencias ni compilaciones en disco interno. No enviar datos personales a páginas externas. Ningún nombre ni avatar real en GitHub.

## Decisiones funcionales
- Juego de reunión en una pantalla compartida; no se solicitó multijugador remoto.
- Modo clásico: una respuesta por turno, pulsa inicial y centro para pasar. Modo ráfaga: varias letras en los mismos 10 segundos; centro pasa turno.
- Un punto por cada letra pulsada; se puede deshacer una pulsación accidental. La aplicación no escucha ni valida palabras habladas: el grupo valida respuestas.
- Rondas con eliminación al vencer tiempo; siguiente turno espera pulsación central para no consumir tiempo durante transición. Último superviviente gana una tarjeta. Final por 3 tarjetas (opcional 5); clasificación de palabras separada.
- Si se agotan letras: prórroga con nueva categoría sin repetición, mismas personas activas y más respuestas requeridas por turno en modo clásico.
- Rueda estándar: A B C D E F G H I J L M N O P R S T U V (20, como referencia). Opción alfabeto español completo 27.
- Persistir participantes, fotos y partida en servidor Umbrel; navegador solo memoria. Recargar recupera partida en pausa. Sin trackers/CDN/fuentes externas.

## Investigación y límites
- Manual del fabricante USAopoly, alojado por biblioteca: https://content.cmpl.org/bg/Tapple.pdf (36 tarjetas, 144 categorías, 10 segundos, eliminación, 3 tarjetas, prórroga).
- Ejemplos del manual: ingredientes de pizza, cosas de la selva, sabores de helado, coches y camionetas; elección del jugador (no es categoría concreta).
- Referencia foto: «Un héroe o villano».
- Otra copia de instrucciones: https://buffalolibrary.org/sites/default/files/gaming-unplugged/inst/71%20Tapple%20Instructions.pdf
- Comercial español: https://www.msimport.cl/basta-piensa-rapido-juego-de-mesa-1 (anuncia 144 categorías).
- No se verificó listado completo de las 144 categorías de esta edición española. No atribuirle categorías inventadas. El mazo distingue base comprobada (5) y 50 añadidas propias. No se copian listas comunitarias sin procedencia comprobada.

## Arquitectura
- Python stdlib HTTP + JSON atómico en DATA_DIR (Umbrel /data; desarrollo ./data en SSD).
- Frontend HTML/CSS/ES modules sin dependencias; lógica pura en static/engine.mjs con pruebas Node.
- Docker imagen Python slim, usuario 1000, puerto 8765; paquete Umbrel experimental-basta.
- Estado y fotos privados fuera del código. Evitar localStorage, IndexedDB, service workers.

## Estado actual
- Iniciada implementación. Pendiente: pruebas, publicación GitHub y despliegue Umbrel.
- Umbrel MCP permite lectura y máquina ubuntu-server; no control de apps. No intentar saltar esos permisos. Si instalación requiere interfaz, usar sesión del usuario o pedir habilitación concreta.

## Avance 26-10-2026
- Implementados servidor sin dependencias, estados atómicos, 55 categorías, rueda responsiva, avatares con recorte manual, modos clásico/ráfaga, eliminación, prórroga, marcadores, pausa y recuperación.
- Nueve pruebas de lógica Node y cuatro de servidor Python pasaron. Revisión en navegador: sorteo, sumar letra, pasar turno, pausa, foto y recorte con icono de prueba; escritorio y móvil 390 px. Sin errores de consola observados.
- El documento publicado en GitHub será una variante saneada sin rutas personales. Datos de prueba (Luna, Leo e icono) exclusivamente en data/ del SSD, no publicar.
- Se identificó repositorio existente y se preparó paquete experimental-basta más workflow multi arquitectura. Pendiente publicación e instalación.

## Cambio de dirección visual
- El usuario pidió expresamente: «Omite MiEstilo y haz que parezca un juego». MiEstilo deja de aplicar a Basta. Nueva apariencia de juego de mesa: fondo azul nocturno, rueda roja y azul, fichas claras, tarjetas amarillas, tipografía gruesa y marcador vivo. Conservar accesibilidad y funciones.

## Publicación
- Código publicado en main mediante plugin GitHub: commit 01e66de0babc38458d39deda342576a8da0e6110.
- Carpeta remota experimental-basta; workflow .github/workflows/basta-image.yml; imagen ghcr.io/orbitpixel-4827/basta:1.0.0.
- Nueva apariencia solicitada ya aplicada y revisada en navegador. No aplicar MiEstilo en cambios futuros salvo nueva petición.
- Falta comprobar construcción remota y despliegue en Umbrel; no afirmar instalado todavía.
- El usuario eligió «Prefiero instalarlo yo». NO instalar la aplicación ni volver a pedir acceso. Entregar pasos de instalación en su tienda existente.
- Primera compilación exitosa: GitHub Actions 40415652649 (verify + build). Descarga anónima de GHCR comprobada: HTTP 200, amd64 y arm64; digest inicial d69296673b532fb358ca60ff95219379cc15b40526ad618dae805547388c59fe. Falta revisión final que conserva avatar al abrir/cerrar su selector y afina diseño a 320 px.

- Verificado manualmente en navegador: 10 participantes, límite de altas, modo ráfaga con dos letras sumando dos puntos. Tamaños 320, 390 y 1280 px; ajustes para conservar avatar central y encabezado en 320 px. Se conserva la foto previa al abrir y guardar selector.

## Entrega preparada
- El usuario instalará desde Experimental App Store → Basta → Instalar.
- El servicio no se ha instalado ni ejecutado en Umbrel. La validación funcional corresponde al servidor de desarrollo en SSD y a las pruebas de CI.
- Todas las fotos/nombres de prueba están únicamente en data/ del SSD; el repositorio solo contiene imágenes de interfaz con nombres ficticios. No hay datos reales ni credenciales.
- La estética final sustituye MiEstilo por juego de mesa. Capturas en docs/ del SSD y gallery/ en GitHub.

## Estado definitivo de entrega — 26-10-2026
- Código final probado: 849ea4734a4983df735205edb6de57464c6c9d1e. Workflow final exitoso: https://github.com/orbitpixel-4827/umbrel-community-app-store/actions/runs/40416237144 (13 pruebas + imagen amd64/arm64).
- Imagen final: ghcr.io/orbitpixel-4827/basta:1.0.0@sha256:32235058c58444e4e4b120394b3794cd1a7e36e2ad687bda6f03c04d2c8765d6; compose fijado a ese digest. Descarga pública del paquete comprobada en construcción previa; mismo paquete y etiqueta.
- Nombre Basta en tienda Experimental App Store. NO instalada en Umbrel: usuario prefirió instalarla él. Guía INSTALAR.md. No reintentar instalación sin nueva petición.
- Pruebas de navegador con 2 y 10 participantes; clásico/ráfaga, puntos, bloqueo de letras, cambio de turno, pausa, recuperación, carga y recorte de foto. Revisión 320/390/1280 px. En 320 px scrollWidth=clientWidth=320, sin desbordamiento horizontal.
- Memoria portable saneada en GitHub; memoria local completa en este archivo del SSD. Sin secretos, datos reales ni fotos personales publicados.

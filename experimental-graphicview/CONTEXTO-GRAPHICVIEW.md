# GraphicView: contexto de mantenimiento

Leer este archivo antes de cambiar GraphicView. Actualizar el registro al finalizar cada cambio, con archivos, pruebas, versión y publicación. Distinguir cambios preparados de cambios ya publicados. No guardar claves, tokens ni datos personales aquí.

## Producto y alcance

GraphicView permite analizar Bitcoin (Bitfinex), acciones, ETF e índices. La mayor parte del uso es en computadora; móvil vertical debe aprovechar la pantalla y permitir todas las opciones. El usuario solicita cambios en el clon Docker para Umbrel. La versión original de Sites quedó terminada y NO debe modificarse.

Repositorio: https://github.com/orbitpixel-4827/umbrel-community-app-store
Carpeta publicable: `experimental-graphicview/`. Workflow: `.github/workflows/graphicview-image.yml`.
Proyecto local del SSD: `/Volumes/SSD/1 Proyectos/Apps con IA/Monitor de mercados Umbrel`.
Checkout local de la tienda: `/Volumes/SSD/1 Proyectos/Apps con IA/Experimental App Store/repository`.
Pruebas visuales independientes: `GraphicView - Prueba MiEstilo` y `GraphicView - Prueba MiEstilo Oscuro` en la raíz de Apps con IA. Son maquetas con datos ficticios: nunca sustituir con ellas la app real.

## Arquitectura

- Next.js 16, React 19, TypeScript, lucide-react; salida `standalone` en Docker Node 22 Alpine. pnpm con lockfile y `pnpm-workspace.yaml` que autoriza los builds de dependencias; conservarlo en Docker para evitar ERR_PNPM_IGNORED_BUILDS (sharp).
- `app/page.tsx`: aplicación y estado React, SVG del gráfico, cálculo de SMA, coordenadas lógicas, interacción con puntero, dibujos, escala, favoritos y controles.
- `app/globals.css`: estilos funcionales originales; `app/miestilo.css`: capa visual oscura y adaptación de controles/paneles. Mantener la lógica del gráfico separada del tema.
- `app/api/market/route.ts`: velas y cotizaciones, Bitfinex para BTC; `app/api/search/route.ts`: búsqueda de activos. Revisar fuentes reales del código antes de cambiar proveedores.
- `app/api/workspace/route.ts`: estado persistente en el servidor. Ver implementación y ruta real antes de migrar datos.
- `app/layout.tsx`, `app/manifest.ts`, `public/icon.png`: metadatos, PWA e icono del acceso web, incluidas direcciones de Tailscale. No fijar un hostname local en rutas de recursos.
- Imagen `ghcr.io/orbitpixel-4827/graphicview:VERSION`, arquitecturas linux/amd64 y linux/arm64. Puerto web interno 3000, Umbrel 3080. Volumen `${APP_DATA_DIR}/data:/data`, variable `MERCADO_DATA_DIR=/data`. No borrar ni sustituir este volumen.

## Funciones que se deben conservar

- Marcos 4H, 1D y 1S (semanal) para TODOS los activos; cambio de datos real, protección frente a respuestas de solicitudes anteriores.
- Historial navegable, desplazamiento, zoom fino y arrastre sobre eje de precios para escala vertical; espacio futuro a la derecha. Los dibujos NO intervienen en el autoajuste del precio ni en zoom.
- Velas rellenas, colores de subida/bajada y fondo personalizables; sin rejilla. Respetar colores ya guardados, no resetearlos por el tema.
- Cruz del puntero con fecha y precio, OHLC de la vela bajo el puntero, retorno a datos actuales al salir.
- Favoritos: iconos, añadir, quitar, búsqueda extensa, scroll y cotización independiente del activo actual (cada 15 s según UI). Accesibles también desde móvil.
- SMA 20 y SMA 200 calculadas sobre las velas reales; estilos propios (color, opacidad, grosor). No reintroducir SMA50, EMA9, Bollinger ni volumen retirados.
- Tendencia, rectángulo, retroceso Fibonacci, extensión Fibonacci de TRES puntos, línea horizontal hacia la derecha, texto y regla temporal de dos puntos con velas, precio y porcentaje.
- Retroceso ascendente: nivel 0 en extremo superior y 1 inferior; niveles 0, .236, .382, .5, .618, .786, .886, 1. Extensión: inicio, fin de impulso y fin del retroceso; proyección desde el tercer punto.
- Dibujos por activo y marco temporal; selección individual, movimiento, redimensión por nodo, eliminación, color/opacidad/grosor; texto editable con tamaño. Poder dibujar en fechas futuras.
- Ocultar dibujos NO oculta medias móviles. Bloquear dibujos e indicadores impide edición/movimiento accidental y persiste entre reinicios; permite navegar el gráfico.
- Evitar selección de texto y callout al arrastrar el SVG. Mantener soporte táctil y de puntero.
- Persistencia de favoritos, catálogo, colores, medias, estilos, bloqueo y dibujos; conservar esquema y compatibilidad de estado del servidor y localStorage.

## Diseño aceptado

MiEstilo oscuro aprobado el 22 de octubre de 2026: fondo #090c10, superficies #11161d, secundarias #1d242d, texto #e8edf2, secundario #a0a9b5, acento #70d5d0. Tarjetas 26–32 px, cápsulas, iconos lucide coherentes, sombras suaves. Gráfico grande; no imponer marco de teléfono a escritorio. Menús centrados en escritorio y hojas inferiores desplazables en móvil; cierre, Escape y gestión de foco. Una sola entrada y un solo panel de Apariencia, accesibles en móvil. No duplicar el menú como en la maqueta.

## Publicación y verificación

1. Leer GitHub actual antes de trabajar: el repositorio contiene otras apps que no deben alterarse. Usar el plugin GitHub preferentemente.
2. Cambios de presentación sobre código real; no copiar lógica simulada de las maquetas.
3. Build de producción, comprobación visual escritorio/móvil y flujos relevantes. Validar colores de velas/fondo, bloqueo, favoritos, cada herramienta, paneles y ausencia de overflow.
4. Incrementar juntos `docker-compose.yml` (imagen), `umbrel-app.yml` (versión/notas) y tag del workflow. Error histórico: la imagen construida era 1.1.0 pero compose seguía en 1.0.2; la actualización parecía no cambiar nada.
5. PR, integrar, esperar compilación Docker exitosa para ambas arquitecturas. Registrar SHA/run/versión. No afirmar instalación en Umbrel sin comprobarla en el servidor.
6. No escribir en disco interno del usuario. Archivos y compilaciones en el SSD autorizado; redirigir temporales/cachés cuando corresponda.

## Registro

- 2026-09-09: clon Docker separado de Sites; persistencia por volumen; nombre GraphicView e icono propio; corrección autorización build de sharp.
- 2026-10-08, 1.1.1, commit 6bc5bd2: corrige tag antiguo de compose, gráfico móvil adaptable, bloqueo persistente y antiselección. Run 37861686333 correcto.
- 2026-10-14, 1.1.2, commit 668c1a2, PR #10: manifiesto PWA y metadatos Apple/navegador para icono por Tailscale. Run 38602423001 correcto. Accesos ya instalados pueden requerir volver a añadirse en el teléfono.
- 2026-10-21/22: maquetas clara y oscura separadas; usuario aprueba la oscura.
- 2026-10-22, 1.2.0 (en preparación): capa MiEstilo oscuro sobre aplicación real; botón de Apariencia antes oculto por CSS móvil ahora visible; favoritos móviles accesibles; paneles exclusivos, cierre y foco; controles táctiles. No cambia el esquema de datos ni cálculo de gráficos. Completar aquí resultados de pruebas, PR y build antes de dar la publicación por terminada.

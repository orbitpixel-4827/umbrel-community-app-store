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

# ¡BASTA! Digital: segundo cerebro del proyecto

> Archivo de contexto para Claude. Leer esto antes de tocar el juego en lugar de releer conversaciones.
> Actualizar la sección **Bitácora** y **Pendientes** cada vez que se cambie algo.

## 1. Objetivo
Recrear el juego de mesa **¡Basta!** (versión en español de *Tapple*, la ruleta de letras con botón temporizador) como juego digital para **iPad**, jugable en navegador. Desde v3: **2 a 10 jugadores** en el mismo dispositivo.

## 2. Pedido original del usuario (resumen fiel)
- 2 participantes, cada uno escribe su **nombre** al inicio y elige un **avatar** (dos caritas: chico de sudadera blanca y chica de lentes con suéter rosa).
- El juego **decide automáticamente quién empieza** (sorteo).
- **Suma de puntos automática**: 1 punto por palabra = 1 punto por cada letra presionada.
- El **botón central** muestra la **carita del jugador en turno** y ahí mismo la **cuenta regresiva de 10 s**.
- **A un lado de la ruleta**, la **tarjeta de categoría**, elegida al azar.
- Investigar las categorías del juego original y **agregar 50 inventadas**.
- Versión navegador para probar e iterar.
- **v2:** una palabra por persona; al tocar la letra el turno pasa solo al siguiente; la ronda acaba cuando a alguien se le termina el tiempo.
- **v3:** (1) en cada cambio de tarjeta cambian las letras, tanto cuáles salen como su orden: siempre 20, al azar del alfabeto español completo; (2) de 2 a 10 jugadores; (3) al inicio se pregunta cuántos jugadores serán; (4) cada jugador elige un avatar o sube una imagen desde sus fotos o archivos.

## 3. El juego físico (referencia)
- Ruleta roja con anillo azul, 20 teclas blancas alrededor y botón blanco central (temporizador).
- **20 letras** fijas en el físico: A B C D E F G H I J L M N O P R S T U V. **En la versión digital (v4): 19 letras comunes al azar de A B C D E F G H I J L M N O P R S T U V + exactamente 1 difícil (K, Q, W, X, Y o Z), en otro orden en cada tarjeta. Sin Ñ.**
- En la foto las letras miran hacia afuera. En la versión digital se acomodan en círculo en el orden al azar de la tarjeta. Hay una opción para girarlas hacia afuera.
- Tarjetas rojas cuadradas, texto blanco tipo "Un HÉROE o VILLANO" y logo amarillo "¡BASTA!" en la esquina.
- Reglas originales: se toca el centro (10 s), se dice una palabra de la categoría, se presiona su letra (queda bloqueada) y se toca el centro para pasar el turno. Si a alguien se le acaba el tiempo, queda eliminado. El último en pie gana la tarjeta. Tapple original: 36 tarjetas, varias categorías por tarjeta (la edición española anuncia 144 categorías en 36 tarjetas).
- **La lista oficial completa de categorías NO está publicada en internet** (buscado en oct-2026). Se armó un set base al estilo del original (incluye "Un HÉROE o VILLANO" de la foto) más 50 inventadas.

## 4. Decisiones de diseño tomadas
| Tema | Decisión |
|---|---|
| **REGLA DEFINITIVA (confirmada por el usuario)** | **Una palabra por persona.** Al tocar una letra (+1 punto), el turno pasa **automáticamente** al siguiente jugador en orden y el reloj vuelve a 10 s sin detenerse. No hay modos de juego. |
| Tiempo agotado (2 jugadores) | Termina la tarjeta; el otro gana **+3** (`CARD_BONUS`). |
| Tiempo agotado (3+ jugadores) | Decisión mía, igual que en el original: ese jugador **queda fuera de la tarjeta**. El siguiente que sigue en juego toca el centro para continuar con el reloj en 10. El **último que queda** gana la tarjeta y +3. *Confirmar con el usuario.* |
| Bonus +3 | No lo pidió el usuario; se le preguntó en v2 y no respondió. Sigue activo. |
| 20 letras usadas | La tarjeta termina sin bonus. |
| Letras por tarjeta (v4, pedido del usuario) | `dealLetters()`: 19 al azar de `EASY` (20 comunes) + 1 al azar de `HARD` (K Q W X Y Z), todo barajado. **Ñ eliminada.** Se reparten en cada tarjeta nueva y también con "Otra tarjeta". Animación de "reparto" de las teclas. |
| Quién empieza | Sorteo animado entre todos (unos 3–4 s, va frenando). Cada tarjeta nueva la empieza el **siguiente** jugador (rota). |
| Meta | 20 / 35 (predeterminado) / 50 / sin límite. Se revisa al terminar cada tarjeta; si hay empate en la punta se juega otra tarjeta. |
| Número de jugadores (v3) | Paso 1 del inicio: botones 2–10. Paso 2: una fila por jugador (avatar + nombre), meta, opciones y "Sortear". Se recuerdan número, nombres y avatares. |
| Avatares (v3) | Clave por jugador: `'chico'`, `'chica'`, `'u:<id>'` (foto subida) o `''` (inicial del nombre en un círculo de color). Se permiten repetidos. Cada jugador tiene un **color fijo por posición** (`COLORS`, 10 colores) que pinta su anillo, su chip, la orilla de su fila y la marca bajo sus letras. |
| Fotos subidas (v3) | `<input type=file accept="image/*">`: en el iPad ofrece Fototeca, Cámara o Archivos. Se recorta un cuadrado al centro, se reduce a 320 px JPEG y se guarda en localStorage (`basta:uploads`). Se pueden borrar con la ×. Si no hay espacio, se usa solo en esa partida y se muestra un aviso. Las fotos viven en el navegador o dispositivo donde se subieron, así que no se comparten entre el archivo local y la página publicada. |
| Deshacer | Quita la última letra tocada en la tarjeta, resta el punto y **regresa el turno a quien la tocó** con 10 s. |
| Otra tarjeta | Solo antes de tocar cualquier letra y antes de que alguien quede fuera. También cambia las letras. |
| Mazo | Se baraja sin repetir hasta agotar las 122 categorías, luego se rebaraja. |
| Sonido | Web Audio sintetizado (sin archivos): tic en los últimos 3 s, zumbido al acabarse el tiempo, fanfarria. Se puede apagar. |
| iPad | `touch-action: manipulation`, `pointerdown` para respuesta inmediata, sin zoom, meta para "Agregar a pantalla de inicio", Wake Lock para que no se apague la pantalla, pausa automática si la app pasa a segundo plano. |
| Teclado (pruebas en compu) | Letras = tocar letra; Espacio/Enter = botón central; Esc = menú. |
| Marcador (v3) | Fila de chips arriba (avatar + puntos + nombre). El de turno se resalta con su color y los que quedaron fuera se ven grises y tachados. |
| Estética | Mesa oscura, ruleta roja/azul con teclas blancas en 3D, tarjeta roja con logo amarillo. Tipografías Google Fonts: Lilita One (logo/números) + Nunito (texto). Sin internet usa fuentes del sistema. |

## 5. Archivos (carpeta del usuario: `/Volumes/SSD/1 Proyectos/Apps con IA/Basta claude`)
```
Basta.html                 ← EL JUEGO. Abrir en navegador. Autocontenido (avatares en base64).
BASTA_CONTEXTO.md          ← este archivo
src/basta.src.html         ← código fuente editable (avatares como __AV_CHICO__ / __AV_CHICA__)
assets/avatar-chico.png    ← avatar recortado 360×360 con fondo transparente
assets/avatar-chica.png
build.py                   ← python3 build.py → regenera Basta.html y dist/basta-artifact.html
dist/basta-artifact.html   ← versión sin <html>/<head> para publicar como Artifact de claude.ai
```
**Flujo para cambios:** editar `src/basta.src.html` → `python3 build.py` → probar `Basta.html`. Nunca editar `Basta.html` a mano (pesa ~500 KB por las imágenes en base64).

Los avatares se recortaron de las imágenes originales con un script (fondo claro conectado a los bordes → transparente; scipy `ndimage.label`). Recorte del chico: caja (370,40,910,580) de 1254×1254. Recorte de la chica: (0,0,832,832) de 832×934.

## 6. Mapa del código (src/basta.src.html)
- **CSS**: tokens en `:root` (colores `--rojo`, `--azul`, `--tecla`, `--amarillo`…). Responsive: horizontal = tarjeta a la izquierda y ruleta a la derecha; vertical o <760 px = tarjeta arriba y ruleta abajo.
- **Constantes**: `EASY` (20), `HARD` (6), `LETTERS_PER_CARD=20`, `TURN_SECONDS=10`, `CARD_BONUS=3`, `MIN_P=2`, `MAX_P=10`, `BUILTIN` (chico/chica en base64), `COLORS` (10), `CAT_BASE` (72), `CAT_NUEVAS` (50), `CATEGORIES`.
- **Avatares**: `avatarSrc(key)`, `avatarHTML(key,name,color)` → `<span class=ava>`; `processImage(file)` (recorte con canvas); `uploads` [{id,src}].
- **Setup**: `buildSetup`, `refreshCount`, `renderPlayersSetup`, `openAvatarPicker`/`renderAvatarGrid`, `onFilePicked`, `deleteUpload`, `setStep(1|2)`.
- **Estado** `S` (función `newGameState`): `players[{name,avatar,color,score,out}]`, `target`, `deck`, `round`, `starter`, `current`, `card`, `letters[20]`, `used{letra:jugador}`, `history[{letter,player}]`, `lastOut`, `turn`, `phase` (`ready|running|paused|roundEnd|over`), `timeLeft`, `deadline`, `roundPts`.
- **Config persistida** `cfg` en localStorage (`basta:*`): count, names[10], avatars[10], target, radial, sound, y aparte uploads.
- **Flujo**: `startGame` → `buildStrip` → `drawStarter` (sorteo) → `newRound` (`drawCard` + `dealLetters`) → `onCenter` (arranca) → `onLetter` (punto, luego `nextAlive` y `startClock`) → tiempo 0 → `onTimeout` (marca `out`; si queda 1 → `endRound('timeout')`, si no → fase `ready` del siguiente) → `endRound(timeout|all)` → `gameOver` (tabla ordenada).
- **Reloj**: `startClock` usa `requestAnimationFrame` + `performance.now()` contra `deadline` (preciso y pausable).
- **Render**: `renderAll` = `renderPlayers` + `renderWheel` (+`positionTiles`) + `renderCenter`/`renderTimer` + `renderStatus`.
- Las teclas se colocan con trigonometría (`positionTiles`): radio 42.6 % (usadas 37.5 %, se "hunden" hacia el centro).

## 7. Categorías
**Base (estilo original, 72):** Un HÉROE o VILLANO, Un ANIMAL, Una FRUTA o VERDURA, Un PAÍS, Una CIUDAD, Una PROFESIÓN u OFICIO, Algo de la COCINA, Una PELÍCULA, Una SERIE de TV, Un DEPORTE, Una MARCA, Un INSTRUMENTO musical, Un CANTANTE o GRUPO, Una PRENDA de ROPA, Un JUGUETE, Algo que hay en la PLAYA, Un personaje de CARICATURA, Algo FRÍO, Algo CALIENTE, Un COLOR, Una COMIDA, Un POSTRE o DULCE, Una BEBIDA, Un NOMBRE de MUJER, Un NOMBRE de HOMBRE, Un MONSTRUO o criatura MÍTICA, Algo del SALÓN de clases, Una PARTE del CUERPO, Un AUTO o CAMIÓN, Algo que VUELA, Algo del ZOOLÓGICO, Un VIDEOJUEGO, Algo del JARDÍN, Una PERSONA FAMOSA, Algo del BAÑO, Algo con RUEDAS, Un INSECTO, Un ANIMAL del MAR, Una FLOR o PLANTA, Algo de un HOSPITAL, Un LUGAR para VACACIONES, Una HERRAMIENTA, Algo REDONDO, Algo que se ROMPE, Una TIENDA o NEGOCIO, Un JUEGO de MESA, Algo del ESPACIO, Un personaje de CUENTO, Algo de NAVIDAD, Algo del REFRIGERADOR, Un MUEBLE, Algo que hace RUIDO, Un DEPORTISTA, Un ELECTRODOMÉSTICO, Algo del SUPERMERCADO, Un IDIOMA, Un RÍO, LAGO o MAR, Algo PEGAJOSO, Un VERBO, Un ADJETIVO, Una MATERIA de la escuela, Algo de la GRANJA, Una palabra en INGLÉS, Una CANCIÓN, Un PERSONAJE de DISNEY, Algo de una FIESTA de cumpleaños, Una RAZA de PERRO, Algo que se PUEDE COMER crudo, Algo VERDE, Algo de la OFICINA, Un medio de TRANSPORTE, TEMA LIBRE.

**Nuevas (50, inventadas):** Un ANTOJITO mexicano, Algo que llevas a un PICNIC, Algo que hay en una MOCHILA, Una EMOCIÓN, Una APP del celular, Algo que da MIEDO, Algo que se INFLA, Algo AMARILLO, Un PAN de panadería, Algo que cae de una PIÑATA, Algo con BOTONES, Un SONIDO o ruido de animal, Algo que se usa en la LLUVIA, Algo que encuentras en un PARQUE, Un SABOR de HELADO, Algo que tiene ALAS, Algo PELUDO, Algo que BRILLA, Un ingrediente de PIZZA, Algo que se CONGELA, Un DINOSAURIO o animal extinto, Algo de un CAMPAMENTO, Un PLANETA/estrella/astro, Algo de un CUMPLEAÑOS mexicano, Una palabra que RIMA con -ÓN, Algo que tiene AGUJEROS, Una cosa que se ABRE y se CIERRA, Algo de un AEROPUERTO, Un TRABAJO de los SUEÑOS, Algo que puedes LANZAR, Una PALABRA LARGA (8+ letras), Algo que NO cabe en una CAJA, Algo que huele RICO, Algo que huele FEO, Un LUGAR de MÉXICO, Algo del CIRCO, Algo que se usa en INVIERNO, Una FRUTA TROPICAL, Algo con RAYAS o MANCHAS, Un SUPERPODER, Algo de una BODA, Algo que da RISA, Un nombre de MASCOTA, Algo del FONDO del MAR, Algo que se hace en DOMINGO, Algo que tiene un PIRATA, Algo de un CASTILLO, Algo que PICA, Palabra que termine en -ITO/-ITA, Algo que hay en una FERIA.

En el código, las palabras en MAYÚSCULAS de cada categoría se resaltan automáticamente en la tarjeta (`fmtCat`). El tamaño de letra se ajusta a la palabra más larga para que quepa (por ejemplo ELECTRODOMÉSTICO).

## 8. Pruebas hechas
- Playwright: inicio → sorteo → modo Ráfaga (3 letras, cambio de turno) → modo Clásico (letra, pasar, tiempo agotado → +3 al rival → siguiente tarjeta). Sin errores de consola.
- v2: letra → turno pasa al rival con reloj en 10; letra repetida ignorada; deshacer regresa el turno; tiempo agotado → +3 al rival. Sin errores.
- v3: 5 jugadores con foto subida (setInputFiles), avatar Chica repetido e inicial; el sorteo cae en el anunciado; las letras incluyen Ñ, K, W… y cambian entre tarjetas; el turno rota entre 5; el que se queda sin tiempo queda fuera y sigue el siguiente; el último gana +3; la siguiente tarjeta la empieza el siguiente jugador. 10 jugadores: el marcador cabe a 1180 px. Sin errores.
- Capturas a 1180×820 (iPad horizontal), 820×1180 (iPad vertical) y 390 px (teléfono).
- Bug corregido: el sorteo resaltaba al jugador contrario al anunciado (paridad de pasos).
- Bug corregido: sin el reset del artifact, `.overlay{display:grid}` ignoraba `hidden`; ahora `[hidden]{display:none!important}` está en el CSS.

## 9. Pendientes / ideas para siguientes versiones
- [ ] Confirmar si se queda el bonus de +3 por ganar la tarjeta.
- [ ] Confirmar la regla de eliminación con 3+ jugadores (y si el siguiente debe tocar el centro o el reloj debe seguir solo).
- [ ] Que el usuario pueda agregar o editar sus propias categorías desde la app.
- [ ] Modo PWA instalable con funcionamiento sin conexión (incrustar fuentes).
- [ ] Más avatares predefinidos.
- [ ] Ajustar el tiempo por turno (opción 5/10/15 s).
- [ ] Historial de tarjetas ganadas por jugador.

## 11. Publicación en Umbrel (v2.0.0 de la app)
- Tienda: `orbitpixel-4827/umbrel-community-app-store` (id de tienda `experimental`). Cada app vive en una carpeta `experimental-<app>/` y tiene un workflow que publica su imagen en `ghcr.io/orbitpixel-4827/<app>:<versión>` para amd64 y arm64.
- Ya existió otra app **Basta** (`experimental-basta` 1.0.0, puerto 9089, servidor Python, hecha en otra sesión). El usuario la retiró en el commit `873b4ba`. **La nuestra reutiliza el id `experimental-basta` y el puerto 9089 como versión 2.0.0**, así que aparece como actualización si la anterior seguía instalada.
- Empaquetado: `Dockerfile` (`nginxinc/nginx-unprivileged:1.27-alpine`, puerto 8080, usuario 101) + `nginx.conf` + `static/` (index.html = Basta.html compilado, apple-touch-icon.png, icon-192.png, icon-512.png). Compose: `app_proxy` → `experimental-basta_web_1:8080`, `read_only`, tmpfs `/tmp`, `cap_drop ALL`, 64 MB. No tiene volumen de datos: todo se guarda en el localStorage del navegador.
- Workflow `.github/workflows/basta-image.yml`: extrae el `<script>` y lo revisa con `node --check`, y luego construye y publica `basta:2.0.0`.
- Ícono de la tienda: ruleta dibujada con canvas (`icon.png` 256 px). Galería: `gallery/1-juego.jpg` y `gallery/2-jugadores.jpg`.
- En la tienda, `source/` guarda una copia de `src/`, `assets/` y `build.py`, y `CONTEXTO.md` es una copia de este archivo.
- **Estado (26-oct-2026):** commit `9244ac6` listo, pero **el push fue rechazado (403)**: Claude no tiene acceso de escritura al repo. Hace falta que el usuario reconecte GitHub o instale la GitHub App de Claude en su cuenta. También hay una copia en `umbrel/` de la carpeta local, con `basta-2.0.0.patch` para aplicarlo a mano con `git am`.
- Pendiente después del primer build: fijar el digest `@sha256:` de la imagen en `docker-compose.yml`, como en las otras apps de la tienda.
- Al actualizar el juego: recompilar, copiar a `static/index.html` y subir la versión en 3 lugares (umbrel-app.yml, tag del compose y tag del workflow).

## 10. Bitácora
- **2026-10-26 · v1**: primera versión completa (inicio, sorteo, 2 modos, 122 categorías, sonido, responsive, publicada también como Artifact en claude.ai para abrir desde el iPad).
- **2026-10-26 · v2**: el usuario aclaró la regla: una palabra por persona, el turno cambia solo al tocar la letra y la tarjeta acaba cuando a alguien se le termina el tiempo. Se eliminaron los modos Ráfaga/Clásico.
- **2026-10-26 · v3**: letras al azar en cada tarjeta (20 de 27, alfabeto español); de 2 a 10 jugadores; paso inicial "¿Cuántos jugadores?"; selector de avatar con Chico, Chica, inicial o foto subida; marcador en fila; eliminación con 3 o más jugadores; sorteo entre N jugadores; la tarjeta ajusta el tamaño de las palabras largas.
- **2026-10-26 · v4**: se quitó la Ñ y solo sale UNA letra difícil (K, Q, W, X, Y o Z) por ruleta; las otras 19 son comunes.
- **2026-10-26 · Umbrel**: app `experimental-basta` 2.0.0 preparada para la tienda comunitaria (nginx + workflow ghcr). El push fue rechazado por permisos de GitHub y queda pendiente.

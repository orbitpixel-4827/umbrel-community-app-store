# Basta

Basta digital para una pantalla compartida, con apariencia de juego de mesa. De 2 a 10 personas, fotografías recortadas en círculo, turno inicial aleatorio, rueda de letras, cuenta atrás de 10 segundos y puntos automáticos.

## Jugar

Configura los participantes y pulsa «¡A jugar!». Lee la categoría y toca el centro para empezar. Di la respuesta, pulsa su inicial y toca el centro para pasar. En Ráfaga puedes responder varias palabras en diez segundos. Las letras utilizadas se bloquean hasta la próxima ronda. Cada pulsación válida suma un punto. El grupo comprueba las respuestas; no hay reconocimiento de voz.

Si vence el tiempo quedas fuera de la ronda. El siguiente turno espera a que el nuevo jugador toque el centro. El último superviviente gana la tarjeta. La meta es 3 o 5 tarjetas. El marcador de palabras es independiente. En prórroga se renuevan letras y categoría, conservando los participantes activos.

Espacio activa el centro; las letras del teclado responden. Se puede pausar, deshacer una letra del turno actual, rendirse o preparar otra partida. Recargar recupera la partida en pausa. Ocultar la pestaña también pausa el juego.

## Categorías

55 en total: cinco comprobadas en la foto/manuales y cincuenta creadas para esta versión. No se dispone de un catálogo oficial completo de las 144 categorías comerciales españolas y no se atribuyen las inventadas al fabricante. El explorador dentro del juego muestra su procedencia. Fuentes y decisiones en CONTEXTO.md.

## Privacidad

Sin analítica, fuentes remotas ni CDN. Las fotos se recortan en el navegador y se guardan con los participantes en `/data/state.json` en Umbrel. No se usa almacenamiento persistente del navegador. El repositorio nunca debe contener datos reales ni la carpeta data. Se espera acceso mediante el proxy autenticado de Umbrel; no expongas directamente el servidor a Internet. Una sola mesa activa por instalación.

## Desarrollo en disco externo

No requiere instalar dependencias. Ejecutar desde la carpeta del proyecto en SSD:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B server.py
```

Abre http://127.0.0.1:8765. Los datos se guardan en `data/` de esta carpeta externa. Puedes cambiar `DATA_DIR`, `PORT` y `BIND` explícitamente.

## Validar

```sh
node --test tests/*.test.mjs
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
node --check static/app.mjs
```

## Umbrel

Paquete `experimental-basta` para la tienda comunitaria existente. El manifiesto publica la aplicación «Basta» en el puerto 9089; servidor interno 8765. Imagen multi arquitectura en ghcr.io/orbitpixel-4827/basta:1.0.0. Datos persistentes en `${APP_DATA_DIR}/data`. Reiniciar o actualizar conserva nombres, avatares y estado. No eliminar ese directorio ni volúmenes al actualizar.

`CONTEXTO.md` es la memoria para retomar el trabajo, incluyendo limitaciones y estado real de publicación.

## Instalar desde tu tienda

Umbrel → App Store → Experimental App Store → Basta → Instalar. Si aún no aparece, actualiza la tienda o vuelve a abrirla. La instalación la realizará el usuario por su elección. Consulta INSTALAR.md para los detalles.

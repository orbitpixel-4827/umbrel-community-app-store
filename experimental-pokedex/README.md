# Pokédex para Umbrel · 1.2.1

![Pokédex roja](icon.png)

Instala **Pokédex** desde **Experimental App Store**. Requiere umbrelOS 2.0.
El acceso del escritorio usa HTTPS en el puerto **9088**, a través del proxy de Umbrel.
La contraseña inicial de esta instalación se muestra en Umbrel; puedes cambiarla dentro de Pokédex.

## Cámara del iPhone

Configura el certificado de Umbrel en el iPhone desde **Ajustes → Avanzados → Red → Acceso HTTPS → Cómo usar HTTPS → Ajustes avanzados de certificados → iOS**. Después abre la app con HTTPS y permite el acceso a la cámara. Al abrir el escáner se analiza una imagen a los 3,5 segundos, sin pulsar el disparador. Si todavía no han pasado los 20 segundos entre análisis, se indica la espera y se inicia automáticamente al terminar. Salir de la cámara cancela cualquier análisis programado.

Si el navegador no permite la cámara en vivo, se ofrece tomar una foto o elegir una imagen. El certificado local de Umbrel no cubre las IP de Tailscale: para cámara en vivo fuera de casa hace falta una dirección HTTPS válida accesible por esa red privada.

En Safari puedes añadir Pokédex a la pantalla de inicio; conserva el mismo ícono rojo. La app activa una sesión de reproducción para voz y sonidos también desde ese acceso directo, y vuelve a activar el audio si iOS lo interrumpe al abrir la cámara. Probar voz muestra la preparación y reproducción o un error, además de guardar los ajustes. El comportamiento físico del iPhone debe verificarse en el dispositivo.

## Datos y claves

Los encuentros, ajustes, claves de reconocimiento/voz y caché viven en **la carpeta de datos de esta app en Umbrel**, bajo `data/`. Se conservan al reiniciar y actualizar; también admiten la gestión de almacenamiento de umbrelOS 2.0.

Introduce las claves de Gemini/OpenRouter en Ajustes. No se incluyen claves, contraseñas del propietario ni bases personales en este repositorio o imagen. Las fotos del escaneo se envían al proveedor seleccionado para identificarlas; no se conserva la foto original en el historial. Las cuotas gratuitas del proveedor no son ilimitadas. La app aplica además 20 solicitudes de reconocimiento y 40 narraciones nuevas por día UTC, y un intervalo mínimo de 20 segundos entre reconocimientos. Una consulta de ficha o la reproducción de audio ya guardado no utiliza una nueva solicitud de IA. Los errores de cuota se muestran en pantalla; no activan servicios de pago.

## Trasladar los datos de Docker Compose

La instalación anterior continúa en el puerto 9087. Esta app tiene su propia carpeta de datos y cookie de sesión; instalarla **no traslada ni elimina automáticamente** los datos anteriores.

**Solo encuentros:** exporta una copia JSON desde Ajustes de la app anterior e impórtala desde Ajustes de la nueva. Las claves y la contraseña no forman parte de esa copia.

**Base completa, con claves, ajustes y contraseña:** antes de registrar o configurar nada en la nueva Pokédex, ejecuta los siguientes comandos en la terminal de Umbrel, desde la carpeta `Pokedex-Web` de tu instalación anterior. La copia contiene claves privadas: no la subas a GitHub ni la compartas.

Primero crea una copia consistente y privada, sin detener la app anterior:

```bash
(umask 077; sudo docker compose exec -T app python -c 'import sqlite3,sys; s=sqlite3.connect("file:/data/pokedex.sqlite3?mode=ro",uri=True); d=sqlite3.connect(":memory:"); s.backup(d); sys.stdout.buffer.write(d.serialize()); d.close(); s.close()' > pokedex-migracion.sqlite3)
```

Después, con la nueva Pokédex instalada y vacía, restaura la copia:

```bash
sudo docker exec -i experimental-pokedex_web_1 python manage.py restore-db < pokedex-migracion.sqlite3
```

Se verifica la copia, se guarda `before-migration.sqlite3` en los datos de la app nueva y se rechaza sobrescribir una instalación con registros o ajustes. Vuelve a iniciar sesión con **tu contraseña anterior**, que sustituye a la inicial mostrada por Umbrel. Las sesiones se invalidan durante la migración. La instalación anterior conserva su base sin cambios. Evita registrar encuentros durante el traslado para que ambas colecciones no diverjan.

También puedes generar copias completas de esta versión con `python manage.py export-db` dentro de su contenedor. Para uso cotidiano, Exportar desde Ajustes es más sencillo.

## Publicación y validación

La imagen `ghcr.io/orbitpixel-4827/pokedex:1.2.1` se construye en GitHub Actions para `linux/amd64` y `linux/arm64`; el Compose instalado usa el digest de esa imagen. No requiere compilación en Umbrel ni Docker en la computadora del desarrollador.

Pasaron 53 pruebas de servidor/datos, 28 de lógica JavaScript y 4 de migración completa. Se verificaron las cookies separadas, el origen HTTPS con las cabeceras del proxy y la conservación de encuentros, claves y contraseña en una copia de prueba. Las llamadas de los proveedores se simulan.

La instalación real mediante Umbrel, su certificado y la cámara del iPhone deben verificarse en los dispositivos del propietario; estas pruebas no se presentan como verificación en un Umbrel real.

Datos, imágenes y atribuciones: [NOTICES.md](NOTICES.md). No afiliada con Pokémon, Nintendo, Game Freak o Creatures.

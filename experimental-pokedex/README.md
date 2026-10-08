# Pokédex para Umbrel · 1.3.0

![Pokédex roja](icon.png)

Instala **Pokédex** desde **Experimental App Store**. Requiere umbrelOS 2.0.
El acceso del escritorio usa HTTPS en el puerto **9088**, a través del proxy de Umbrel.
La contraseña inicial de esta instalación se muestra en Umbrel; puedes cambiarla dentro de Pokédex.

## Cámara del iPhone

Configura el certificado de Umbrel en el iPhone desde **Ajustes → Avanzados → Red → Acceso HTTPS → Cómo usar HTTPS → Ajustes avanzados de certificados → iOS**. Después abre la app con HTTPS y permite el acceso a la cámara. Al abrir el escáner se analiza una imagen a los 3,5 segundos, sin pulsar el disparador. Si todavía no han pasado los 20 segundos entre análisis, se indica la espera y se inicia automáticamente al terminar. Salir de la cámara cancela cualquier análisis programado.

Si el navegador no permite la cámara en vivo, se ofrece tomar una foto o elegir una imagen. El certificado local de Umbrel no cubre las IP de Tailscale: para cámara en vivo fuera de casa hace falta una dirección HTTPS válida accesible por esa red privada.

En Safari puedes añadir Pokédex a la pantalla de inicio; conserva el mismo ícono rojo. La app activa una sesión de reproducción para voz y sonidos también desde ese acceso directo, y vuelve a activar el audio si iOS lo interrumpe al abrir la cámara. Probar voz muestra la preparación y reproducción o un error, además de guardar los ajustes. El comportamiento físico del iPhone debe verificarse en el dispositivo.

## ChatGPT Plus para escanear

En Ajustes → Reconocimiento elige **ChatGPT Plus · mi suscripción**. No se pide una clave de API de pago. La primera conexión requiere una computadora: OpenAI devuelve la autorización a `127.0.0.1`, no al servidor remoto ni al iPhone.

En la computadora, desde este proyecto ubicado en el disco externo, ejecuta Node 22 o posterior con una salida privada dentro del mismo proyecto. En la instalación de desarrollo autorizada:

```bash
node connect-chatgpt.mjs --output "/Volumes/SSD/1 Proyectos/Apps con IA/Pokedex Umbrel/repository/experimental-pokedex/private/chatgpt-connection.json"
```

El asistente imprime una dirección para abrir en **el navegador interno de Codex**. No abre un navegador externo. Autoriza tu cuenta y el uso de tu plan. Después, en Pokédex abierta mediante HTTPS de confianza, pulsa **Importar conexión de la computadora** y selecciona el archivo indicado. Umbrel verifica la firma de los tokens, mantiene su propio identificador y renueva la conexión; los tokens nunca se incluyen en respuestas de ajustes, copias JSON de la colección ni imágenes públicas. Una copia SQLite completa sí contiene credenciales y debe mantenerse privada.

El archivo de conexión contiene credenciales: no lo publiques ni lo envíes por chat. Después de importarlo, Umbrel debe encargarse de la renovación. Para desconectar, usa Ajustes; para revocar también el permiso en OpenAI, hazlo en los ajustes de ChatGPT. Pokédex distingue ambas acciones. Elige entre los modelos ofrecidos por tu cuenta uno que admita imágenes.

El reconocimiento usa la suscripción de ChatGPT y sus límites de uso compartido. No se garantiza uso ilimitado ni disponibilidad para todas las cuentas. No hay cambio automático a una API de pago. La narración continúa usando Gemini; el acceso al plan de ChatGPT no sustituye esa voz.

Flujo implementado según la [documentación oficial de SIWC](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [servidores remotos](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) y [entrada de imágenes](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Conexión y escaneo

El reconocimiento y la obtención de la ficha se ejecutan como trabajos privados del servidor. Las consultas cortas de progreso evitan mantener una petición abierta a través del proxy de Umbrel durante todo el análisis. Consultar el resultado no reenvía la foto. Si se pierde una respuesta, la app permite recuperar el trabajo pendiente y no inicia otro escaneo encima. Los trabajos temporales caducan a los 10 minutos o al reiniciar el proceso; los encuentros guardados permanecen en SQLite.

El inicio tiene un tiempo de espera definido y reintenta una consulta de conexión una vez. Nunca reintenta automáticamente el envío de una foto. Los errores de sesión del proxy, HTTPS/Tailscale, cuota del proveedor y renovación de ChatGPT se distinguen. Las fichas guardadas pueden verse sin conexión, pero su caché no autoriza operaciones nuevas con una sesión antigua.

En Ajustes → Comprobar conexión puedes verificar la dirección, respuesta del servidor y disponibilidad de cámara sin gastar reconocimiento. Que la pantalla guardada abra no demuestra que el navegador pueda comunicarse con el servidor en ese momento.

## Datos y claves

Los encuentros, ajustes, claves de reconocimiento/voz y caché viven en **la carpeta de datos de esta app en Umbrel**, bajo `data/`. Se conservan al reiniciar y actualizar; también admiten la gestión de almacenamiento de umbrelOS 2.0.

Introduce las claves de Gemini/OpenRouter en Ajustes. No se incluyen claves, contraseñas del propietario ni bases personales en este repositorio o imagen. Las fotos del escaneo se envían al proveedor seleccionado para identificarlas; no se conserva la foto original en el historial. Las cuotas gratuitas del proveedor no son ilimitadas. Pokédex no añade un tope diario de reconocimiento. Mantiene un intervalo mínimo de 20 segundos entre análisis por proveedor y 40 narraciones nuevas por día UTC. Las pausas tras un error de cuota son independientes para Gemini, OpenRouter y ChatGPT; la app respeta el tiempo de espera indicado por el servicio cuando está disponible. Los contadores antiguos de 20 análisis ya no bloquean al actualizar. En Ajustes → Reconocimiento → Comprobar acceso puedes ver las solicitudes gratuitas usadas, el límite diario y las restantes que OpenRouter informa para tu cuenta. Si el servicio no facilita el contador, se indica sin inventar una cifra. Gemini permite comprobar el acceso al modelo; su cuota se consulta en AI Studio. Una consulta de ficha o la reproducción de audio ya guardado no utiliza una nueva solicitud de IA. Los errores de cuota se muestran en pantalla; no activan servicios de pago.

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

La imagen `ghcr.io/orbitpixel-4827/pokedex:1.3.0` se construye en GitHub Actions para `linux/amd64` y `linux/arm64`; el Compose instalado usa el digest de esa imagen. No requiere compilación en Umbrel ni Docker en la computadora del desarrollador.

Pasaron 65 pruebas de servidor y datos, 11 de autorización/renovación de ChatGPT y trabajos privados, 37 de lógica JavaScript y 4 de migración completa (117 en total). Los tests automáticos simulan los proveedores. Además, el propietario autorizó el acceso oficial a su plan: se verificó la autorización real y, en el navegador interno con un servidor de prueba, ChatGPT reconoció dos imágenes consecutivas de Cyndaquil y Charmeleon, que quedaron guardados como dos encuentros distintos. Esta prueba confirma el flujo con esas imágenes; no constituye una evaluación general de precisión. Se verificaron también las cookies separadas, el origen HTTPS con las cabeceras del proxy y la conservación de encuentros, claves y contraseña en una copia de prueba.

La instalación real mediante Umbrel, su certificado y la cámara del iPhone deben verificarse en los dispositivos del propietario; estas pruebas no se presentan como verificación en un Umbrel real.

Datos, imágenes y atribuciones: [NOTICES.md](NOTICES.md). No afiliada con Pokémon, Nintendo, Game Freak o Creatures.

# Pokédex para Umbrel · 1.4.0

![Pokédex roja](icon.png)

Instala **Pokédex** desde **Experimental App Store**. Requiere umbrelOS 2.0.
El acceso del escritorio usa HTTPS en el puerto **9088**, a través del proxy de Umbrel.
La contraseña inicial de esta instalación se muestra en Umbrel; puedes cambiarla dentro de Pokédex.

## Cámara del iPhone

Configura el certificado de Umbrel en el iPhone desde **Ajustes → Avanzados → Red → Acceso HTTPS → Cómo usar HTTPS → Ajustes avanzados de certificados → iOS**. Después abre la app con HTTPS y permite el acceso a la cámara. Al abrir el escáner se analiza una imagen a los 3,5 segundos, sin pulsar el disparador. Si todavía no han pasado los 20 segundos entre análisis, se indica la espera y se inicia automáticamente al terminar. Salir de la cámara cancela cualquier análisis programado.

Si el navegador no permite la cámara en vivo, se ofrece tomar una foto o elegir una imagen. La dirección utilizada debe estar incluida en el certificado de Umbrel y el iPhone debe confiar en su autoridad. En la instalación comprobada, el certificado incluye la IP local y la de Tailscale. Instalar un perfil no activa automáticamente la confianza SSL/TLS: en el iPhone entra en Ajustes → General → Información → Ajustes de confianza de certificados y activa únicamente el certificado de tu Umbrel. Consulta la [guía de Apple](https://support.apple.com/en-us/102390). Aceptar una advertencia de Safari no sustituye esta configuración.

En Safari puedes añadir Pokédex a la pantalla de inicio; conserva el mismo ícono rojo. La app activa una sesión de reproducción para voz y sonidos también desde ese acceso directo, y vuelve a activar el audio si iOS lo interrumpe al abrir la cámara. Probar voz muestra la preparación y reproducción o un error, además de guardar los ajustes. El comportamiento físico del iPhone debe verificarse en el dispositivo.

## ChatGPT Plus para escanear

En Ajustes → Reconocimiento elige **ChatGPT Plus · mi suscripción**. No se pide una clave de API de pago. La primera conexión requiere una computadora: OpenAI devuelve la autorización a `127.0.0.1`, no al servidor remoto ni al iPhone.

En la computadora, desde este proyecto ubicado en el disco externo, ejecuta Node 22 o posterior con una salida privada dentro del mismo proyecto. En la instalación de desarrollo autorizada:

```bash
node connect-chatgpt.mjs --output "/Volumes/SSD/1 Proyectos/Apps con IA/Pokedex Umbrel/repository/experimental-pokedex/private/chatgpt-connection.json"
```

El asistente imprime una dirección para abrir en **el navegador interno de Codex**. No abre un navegador externo. Autoriza tu cuenta y el uso de tu plan. Después, en Pokédex abierta mediante HTTPS de confianza, pulsa **Importar conexión de la computadora** y selecciona el archivo indicado. Umbrel verifica la firma de los tokens, mantiene su propio identificador y renueva la conexión; los tokens nunca se incluyen en respuestas de ajustes, copias JSON de la colección ni imágenes públicas. Una copia SQLite completa sí contiene credenciales y debe mantenerse privada.

El archivo de conexión contiene credenciales: no lo publiques ni lo envíes por chat. Después de importarlo, Umbrel debe encargarse de la renovación. Para desconectar, usa Ajustes; para revocar también el permiso en OpenAI, hazlo en los ajustes de ChatGPT. Pokédex distingue ambas acciones. Elige entre los modelos ofrecidos por tu cuenta uno que admita imágenes.

El reconocimiento usa la suscripción de ChatGPT y sus límites de uso compartido. No se garantiza uso ilimitado ni disponibilidad para todas las cuentas. No hay cambio automático a una API de pago. La narración utiliza GPT-Live y una clave de API de OpenAI independiente. El plan de ChatGPT no incluye esa API de voz; su consumo se factura por separado.

Flujo implementado según la [documentación oficial de SIWC](https://developers.openai.com/siwc/token-sharing-open-source/sign-in), [servidores remotos](https://developers.openai.com/siwc/token-sharing-open-source/self-hosted-vms) y [entrada de imágenes](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

## Conexión y escaneo

El reconocimiento y la obtención de la ficha se ejecutan como trabajos privados del servidor. Las consultas cortas de progreso evitan mantener una petición abierta a través del proxy de Umbrel durante todo el análisis. Consultar el resultado no reenvía la foto. Si se pierde una respuesta, la app permite recuperar el trabajo pendiente y no inicia otro escaneo encima. Los trabajos temporales caducan a los 10 minutos o al reiniciar el proceso; los encuentros guardados permanecen en SQLite.

La interfaz y la sesión se cargan directamente desde Umbrel. Ya no se instala una interfaz sin conexión ni se guardan respuestas de sesión en IndexedDB. Al actualizar, un trabajador de migración retira las cachés antiguas de Pokédex, se desregistra y recarga una sola vez las ventanas de inicio antiguas. Los módulos llevan la versión en su dirección para evitar mezclar archivos de diferentes versiones. La colección y las claves permanecen en el servidor.

Las peticiones tienen un plazo que cubre también la lectura de la respuesta. Solo se reintentan consultas GET; una imagen enviada no se reenvía automáticamente. Un corte temporal al iniciar muestra el error real y reintenta mientras la app está visible. Al regresar del segundo plano o recuperar la red, se revalida la sesión sin sustituir formularios ni cámara. El aviso «Reconectando · Reintentar» aparece únicamente tras un fallo real de comunicación. Una sesión caducada abre el acceso; una respuesta HTML del proxy no se confunde con una respuesta de la app.

El almacenamiento opcional de audio del navegador tiene un plazo y no bloquea el arranque. Las conexiones HTTP inactivas se cierran a los 30 segundos para liberar los recursos que dejan abiertos los navegadores suspendidos. Si falla la comprobación antes de enviar una imagen, el escaneo se programa al recuperar la sesión. Si ya se envió, se conserva el mismo trabajo pendiente. Los errores de cuota no programan otro reconocimiento.

En Ajustes → Comprobar conexión se comprueba el servidor y la disponibilidad de cámara sin consumir reconocimiento. HTTPS sigue requiriendo un certificado válido y de confianza en el dispositivo.

## Datos y claves

Los encuentros, ajustes, claves de reconocimiento/voz y caché viven en **la carpeta de datos de esta app en Umbrel**, bajo `data/`. Se conservan al reiniciar y actualizar; también admiten la gestión de almacenamiento de umbrelOS 2.0.

El reconocimiento usa únicamente la conexión con tu plan de ChatGPT. Las imágenes se envían a OpenAI para identificarlas y no se conservan como fotos en el historial. Se mantienen los límites de tu suscripción y el intervalo de 20 segundos entre análisis; no hay un tope diario añadido por Pokédex ni reenvío automático de imágenes.

### Narración con GPT-Live

En Ajustes → Narración introduce una **clave de API de OpenAI** por HTTPS de confianza. La voz usa `gpt-live-1` y tiene **facturación de API independiente de ChatGPT Plus**. No envíes la clave por chat. Se guarda en el volumen privado de Umbrel y nunca se devuelve al navegador, al repositorio o a la copia de encuentros. Las claves antiguas de otros proveedores ya no se utilizan.

La narración es de una sola dirección: no solicita acceso al micrófono ni abre un chat interactivo. Reproduce audio PCM a medida que llega; no espera a que termine de generarse toda la ficha ni a escribir una caché de navegador. Mantiene el efecto metálico continuo entre paquetes y solicita un ritmo ágil al modelo. Reproduce el flujo a su velocidad original para evitar silencios por consumir audio antes de que llegue. Solo se inicia automáticamente tras un escaneo. Las fichas abiertas manualmente requieren tocar Voz.

El resumen hablado es breve; la ficha visual conserva toda su información. Los audios completados se guardan en Umbrel y se reutilizan sin abrir otra sesión de GPT-Live. La caché anterior de Gemini no se mezcla con las nuevas voces. No hay un límite diario local de narraciones, pero sí las cuotas del proyecto de API. Comprobar acceso consulta el modelo sin abrir una sesión de voz; Probar voz sí genera audio y consumo. Salir de la ficha cancela la reproducción y cierra la sesión; nunca se reintenta una sesión facturable automáticamente.

GPT-Live no emite un evento de final de turno de audio. La app termina la sesión tras una cola silenciosa, con límites de tiempo y tamaño. No puede garantizar lectura literal ni una latencia fija: dependen del modelo y de la red. Se verifica el cierre de sesión antes de guardar el audio completo.

### Favoritos

El corazón se rellena de rojo después de guardar correctamente. En Colección, el botón de corazón muestra solo los favoritos registrados; vuelve a tocarlo para ver todos. Se combina con el filtro por tipo y la búsqueda. Los favoritos siguen guardados en las preferencias privadas de Umbrel.

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

La imagen `ghcr.io/orbitpixel-4827/pokedex:1.4.0` se construye en GitHub Actions para `linux/amd64` y `linux/arm64`; el Compose instalado usa el digest de esa imagen. No requiere compilación en Umbrel ni Docker en la computadora del desarrollador.

La versión 1.4.0 pasa 178 pruebas (69 servidor/datos/HTTP, 11 ChatGPT, 11 GPT-Live simulado, 4 migración y 83 JavaScript). Las pruebas automáticas cubren persistencia, autenticación y renovación de ChatGPT, idempotencia de escaneos, recuperación de conexión, favoritos y reproducción progresiva. Usan proveedores simulados y no consumen cuota. La integración de GPT-Live requiere verificar la voz con una clave válida del propietario; no se presenta la simulación como una prueba real de voz.

La instalación real mediante Umbrel, su certificado y la cámara del iPhone deben verificarse en los dispositivos del propietario; estas pruebas no se presentan como verificación en un Umbrel real.

Datos, imágenes y atribuciones: [NOTICES.md](NOTICES.md). No afiliada con Pokémon, Nintendo, Game Freak o Creatures.

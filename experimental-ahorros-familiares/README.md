# Ahorros Familiares para Umbrel

Aplicación privada para registrar depósitos, retiros y traspasos por persona y
tipo de ahorro. Incluye filtros, totales, eliminación de movimientos y estados
de cuenta PDF por periodo.

## Persistencia

Umbrel guarda la base SQLite en `${APP_DATA_DIR}/data/family_savings.db`. La
carpeta se monta fuera del contenedor, por lo que no se elimina al reiniciar o
actualizar la aplicación.

Desde la versión 1.0.1, un servicio de preparación ajusta automáticamente el
propietario y los permisos de la carpeta y de los archivos SQLite antes del
arranque. No modifica los registros. La app sigue ejecutándose como usuario
sin privilegios y Umbrel espera a que esté saludable antes de abrir el acceso.

## Actualización 1.1.0

Incluye saldos inicial y final en estados por periodo, historial paginado por
movimiento completo, protección contra respuestas atrasadas al filtrar,
confirmación de operaciones aunque falle el refresco, reintentos de lectura,
mejoras de diálogos/accesibilidad y ajuste de cifras grandes en móvil.
El icono de Umbrel y de la web app en iPhone se conserva.

Actualiza desde la tienda de Umbrel sin desinstalar. No necesitas importar de
nuevo la base ni ejecutar comandos para actualizar. Se mantienen el mismo
identificador, puerto y montaje persistente. La imagen para Intel y ARM se
verifica en GitHub, incluyendo arranque con carpeta inicialmente propiedad de
root y conservación de registros al recrear el contenedor.

La importación administrativa rechaza copias con tablas incompatibles,
identificadores o relaciones inválidos y traspasos incompletos antes de
reemplazar la base. Admite el esquema original sin transfer_id.

## Llevar la base de la instalación anterior

Conéctate por SSH a Umbrel y, mientras la instalación anterior sigue encendida,
crea una copia coherente:

```bash
(umask 077; sudo docker exec ahorros-familiares python /app/manage.py export-db > ahorros-migracion.sqlite3)
```

Si la instalación anterior todavía no incluye `manage.py`, usa el respaldo
integrado de SQLite:

```bash
(umask 077; sudo docker exec ahorros-familiares python -c 'import sqlite3,sys; s=sqlite3.connect("file:/data/family_savings.db?mode=ro",uri=True); d=sqlite3.connect(":memory:"); s.backup(d); sys.stdout.buffer.write(d.serialize()); d.close(); s.close()' > ahorros-migracion.sqlite3)
```

Instala **Ahorros Familiares** desde Experimental App Store y restaura la copia:

```bash
sudo docker exec -i experimental-ahorros-familiares_web_1 python /app/manage.py restore-db < ahorros-migracion.sqlite3
sudo docker restart experimental-ahorros-familiares_web_1
```

Abre la app y comprueba personas, tipos, movimientos y saldo antes de retirar la
instalación anterior. Conserva `ahorros-migracion.sqlite3` como respaldo hasta
terminar la comprobación.

## Web app en iPhone

Abre la app desde Safari, toca **Compartir** y elige **Agregar a pantalla de
inicio**. El manifiesto usa el mismo `icon.png` que muestra Umbrel.

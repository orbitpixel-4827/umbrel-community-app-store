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

## Llevar la base de la instalación anterior

Conéctate por SSH a Umbrel y, mientras la instalación anterior sigue encendida,
crea una copia coherente:

```bash
(umask 077; docker exec ahorros-familiares python /app/manage.py export-db > ahorros-migracion.sqlite3)
```

Si la instalación anterior todavía no incluye `manage.py`, usa el respaldo
integrado de SQLite:

```bash
(umask 077; docker exec ahorros-familiares python -c 'import sqlite3,sys; s=sqlite3.connect("file:/data/family_savings.db?mode=ro",uri=True); d=sqlite3.connect(":memory:"); s.backup(d); sys.stdout.buffer.write(d.serialize()); d.close(); s.close()' > ahorros-migracion.sqlite3)
```

Instala **Ahorros Familiares** desde Experimental App Store y restaura la copia:

```bash
docker exec -i experimental-ahorros-familiares_web_1 python /app/manage.py restore-db < ahorros-migracion.sqlite3
docker restart experimental-ahorros-familiares_web_1
```

Abre la app y comprueba personas, tipos, movimientos y saldo antes de retirar la
instalación anterior. Conserva `ahorros-migracion.sqlite3` como respaldo hasta
terminar la comprobación.

## Web app en iPhone

Abre la app desde Safari, toca **Compartir** y elige **Agregar a pantalla de
inicio**. El manifiesto usa el mismo `icon.png` que muestra Umbrel.

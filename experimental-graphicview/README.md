# GraphicView para Umbrel

GraphicView es una aplicación independiente preparada para ejecutarse con Docker. La aplicación consulta Bitcoin en Bitfinex y acciones, ETF e índices en Yahoo Finance.

## Persistencia

Favoritos, activo y marco temporal seleccionados, apariencia, medias móviles y dibujos se guardan en el volumen Docker `graphicview_data`. El navegador conserva además una copia local de respaldo.

Reiniciar, actualizar o volver a crear el contenedor conserva la información. No ejecutes `docker compose down -v`, porque `-v` elimina el volumen persistente.

## Instalación en Umbrel

1. Copia esta carpeta al servidor, por ejemplo a `~/umbrel/app-data/graphicview`.
2. Entra por SSH y abre la carpeta:

   ```bash
   cd ~/umbrel/app-data/graphicview
   ```

3. Construye e inicia la aplicación:

   ```bash
   docker compose up -d --build
   ```

4. Abre `http://IP-DE-TU-UMBREL:3080` desde un equipo de tu red.

La imagen se construye en el propio Umbrel, por lo que funciona tanto en servidores `amd64` como `arm64` siempre que la instalación de Docker admita la imagen oficial de Node.js 22.

## Operación

Ver estado:

```bash
docker compose ps
```

Ver registros:

```bash
docker compose logs -f graphicview
```

Reiniciar:

```bash
docker compose restart
```

Detener sin perder datos:

```bash
docker compose down
```

## Respaldo

Crear un respaldo del estado persistente:

```bash
docker run --rm -v graphicview_data:/data -v "$PWD":/backup alpine tar czf /backup/graphicview-backup.tgz -C /data .
```

Restaurar ese respaldo con la aplicación detenida:

```bash
docker compose down
docker run --rm -v graphicview_data:/data -v "$PWD":/backup alpine sh -c "rm -rf /data/* && tar xzf /backup/graphicview-backup.tgz -C /data"
docker compose up -d
```

## Configuración

- Puerto publicado: `3080`
- Puerto interno: `3000`
- Archivo persistente dentro del volumen: `/data/workspace.json`
- Reinicio automático: `unless-stopped`

Para cambiar el puerto externo, modifica `3080:3000` en `docker-compose.yml`.

## Si aparece ERR_PNPM_IGNORED_BUILDS

Esta versión ya autoriza de forma explícita el script de instalación de `sharp`, requerido por Next.js. Después de sustituir los archivos por esta versión, reconstruye la imagen sin reutilizar la caché:

```bash
docker compose build --no-cache
docker compose up -d
```

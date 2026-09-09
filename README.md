# DanyVanVargas App Store

Tienda comunitaria personal para instalar aplicaciones reales en umbrelOS.

La tienda ya está configurada y permanecerá vacía hasta que se añadan aplicaciones.

## Agregar la tienda en Umbrel

1. Abre la App Store en tu Umbrel.
2. Abre el menú de opciones y entra en **Community App Stores** o **Add Community App Store**.
3. Pega esta URL:

```text
https://github.com/DanyVanVargas/umbrel-community-app-store
```

4. Confirma la incorporación de la tienda.

Mientras el repositorio no contenga carpetas de aplicaciones, la tienda aparecerá sin apps disponibles.

## Añadir aplicaciones en el futuro

Cada aplicación se añadirá en una carpeta independiente cuyo nombre y `id` comiencen con el prefijo de la tienda: `danyvanvargas-`.

```text
danyvanvargas-mi-app/
├── umbrel-app.yml
├── docker-compose.yml
├── exports.sh          # opcional
└── assets/             # icono y capturas
```

Las aplicaciones se adaptarán una por una para que Umbrel ejecute sus servicios mediante Docker, conserve sus datos y las muestre como aplicaciones instalables. No deben guardarse secretos, contraseñas ni claves privadas en este repositorio.

## Identidad de la tienda

- ID: `danyvanvargas`
- Nombre visible: `DanyVanVargas App Store`
- Manifiesto: `umbrel-app-store.yml`

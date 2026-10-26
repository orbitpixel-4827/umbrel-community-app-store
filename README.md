# Experimental App Store

Tienda comunitaria personal para instalar aplicaciones reales en umbrelOS.

La tienda ya está configurada y permanecerá vacía hasta que se añadan aplicaciones.

## Aplicaciones disponibles

- **Registro Multimedia**: biblioteca privada de películas, libros, videojuegos, cómics y manga, con interfaz para iPhone y datos en SQLite.

- **Ahorros Familiares**: depósitos, retiros, traspasos, filtros y estados de cuenta PDF.
- **GraphicView**: análisis técnico visual para mercados.
- **Pokédex**: reconocimiento y consulta personal de Pokémon.
- **Basta**: juego de mesa ¡Basta! digital para 2 a 10 jugadores, con ruleta de letras, temporizador de 10 segundos y avatares con fotos.

## Agregar la tienda en Umbrel

1. Abre la App Store en tu Umbrel.
2. Abre el menú de opciones y entra en **Community App Stores** o **Add Community App Store**.
3. Pega esta URL:

```text
https://github.com/orbitpixel-4827/umbrel-community-app-store
```

4. Confirma la incorporación de la tienda.

Mientras el repositorio no contenga carpetas de aplicaciones, la tienda aparecerá sin apps disponibles.

## Añadir aplicaciones en el futuro

Cada aplicación se añadirá en una carpeta independiente cuyo nombre y `id` comiencen con el prefijo de la tienda: `experimental-`.

```text
experimental-mi-app/
├── umbrel-app.yml
├── docker-compose.yml
├── exports.sh          # opcional
└── assets/             # icono y capturas
```

Las aplicaciones se adaptarán una por una para que Umbrel ejecute sus servicios mediante Docker, conserve sus datos y las muestre como aplicaciones instalables. No deben guardarse secretos, contraseñas ni claves privadas en este repositorio.

## Identidad de la tienda

- ID: `experimental`
- Nombre visible: `Experimental App Store`
- Manifiesto: `umbrel-app-store.yml`

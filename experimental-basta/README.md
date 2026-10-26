# Basta para umbrelOS

Versión digital del juego de mesa **¡Basta!** (Tapple) para 2 a 10 jugadores, pensada para iPad.

- Una palabra por turno: tocas la letra, sumas 1 punto y el turno pasa solo al siguiente con 10 s.
- Quien se queda sin tiempo sale de la tarjeta; el último en pie gana +3.
- 20 letras por tarjeta, distintas y en otro orden cada vez (sin Ñ, solo una difícil: K, Q, W, X, Y o Z).
- 122 categorías (72 al estilo del original + 50 nuevas).
- Avatares: Chico, Chica, inicial o foto propia (se guardan en el navegador de cada dispositivo).

## Estructura

```text
experimental-basta/
├── umbrel-app.yml        manifiesto de la tienda
├── docker-compose.yml    servicio web (nginx sin privilegios, solo lectura)
├── Dockerfile            imagen ghcr.io/orbitpixel-4827/basta
├── nginx.conf
├── static/               lo que se sirve: index.html (juego completo) e íconos
├── source/               código fuente editable y build.py
├── gallery/  icon.png
└── CONTEXTO.md           memoria del proyecto para futuras versiones
```

## Actualizar el juego

1. Editar `source/src/basta.src.html`.
2. `cd source && python3 build.py` y copiar `Basta.html` a `static/index.html`.
3. Subir la versión en `umbrel-app.yml`, en el tag de `docker-compose.yml` y en `.github/workflows/basta-image.yml`.
4. Hacer push a `main`: el workflow construye la imagen para Intel y ARM.

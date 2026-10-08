FROM python:3.13.16-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 POKEDEX_DATA_DIR=/data POKEDEX_BIND=0.0.0.0 POKEDEX_PORT=8765 TMPDIR=/tmp
WORKDIR /app
RUN mkdir -p /data && chown 1000:1000 /data
RUN pip install --no-cache-dir cryptography==50.0.2
COPY --chown=1000:1000 core.py server.py manage.py chatgpt.py ./
COPY --chown=1000:1000 static ./static
USER 1000:1000
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD ["python", "-c", "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:8765/health',timeout=3))['ok']"]
CMD ["python", "server.py"]

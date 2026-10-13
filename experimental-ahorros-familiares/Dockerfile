FROM python:3.13-alpine

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    PORT=8080

WORKDIR /app

RUN addgroup -S -g 1000 app && adduser -S -u 1000 -G app app && mkdir -p /data && chown -R app:app /data

COPY --chown=app:app app.py /app/app.py
COPY --chown=app:app manage.py /app/manage.py
COPY --chown=app:app static /app/static

USER app
EXPOSE 8080
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/health', timeout=2)" || exit 1

CMD ["python", "/app/app.py"]

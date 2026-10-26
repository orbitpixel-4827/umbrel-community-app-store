FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 BIND=0.0.0.0 PORT=8765 DATA_DIR=/data
COPY server.py ./
COPY static ./static
RUN mkdir /data && chown 1000:1000 /data
USER 1000:1000
EXPOSE 8765
HEALTHCHECK --interval=30s --timeout=3s CMD python -B -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8765/api/health', timeout=2)"
CMD ["python", "-B", "server.py"]

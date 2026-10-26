"""Basta: servidor privado sin dependencias externas."""
import json
import os
import tempfile
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent / 'static'
DATA = Path(os.environ.get('DATA_DIR', str(Path(__file__).resolve().parent / 'data')))
LOCK = threading.Lock()
MAX_BODY = 3 * 1024 * 1024


def validate(value):
    if not isinstance(value, dict):
        raise ValueError('Estado inválido')
    players = value.get('players')
    if not isinstance(players, list) or not 2 <= len(players) <= 10:
        raise ValueError('Se requieren entre 2 y 10 participantes')
    for p in players:
        if not isinstance(p, dict) or not isinstance(p.get('name'), str) or len(p['name']) > 28:
            raise ValueError('Nombre inválido')
        avatar = p.get('avatar', '')
        if not isinstance(avatar, str) or len(avatar) > 150000:
            raise ValueError('Avatar inválido')
        if avatar and not avatar.startswith('data:image/jpeg;base64,'):
            raise ValueError('Formato de avatar inválido')
        if not isinstance(p.get('preset', 0), int) or not 0 <= p.get('preset', 0) <= 5:
            raise ValueError('Color inválido')
    if not isinstance(value.get('options'), dict):
        raise ValueError('Opciones inválidas')
    game = value.get('game')
    if game is not None:
        if not isinstance(game, dict) or not isinstance(game.get('players'), list) or not 2 <= len(game['players']) <= 10:
            raise ValueError('Partida inválida')
        if game.get('status') not in ('ready', 'playing', 'paused', 'roundEnd', 'finished'):
            raise ValueError('Fase inválida')
        if not isinstance(game.get('current'), int) or not 0 <= game['current'] < len(game['players']):
            raise ValueError('Turno inválido')
    return value


def persist(value):
    DATA.mkdir(parents=True, exist_ok=True)
    with LOCK:
        fd, name = tempfile.mkstemp(prefix='.state-', suffix='.json', dir=DATA)
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as f:
                json.dump(value, f, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())
            os.replace(name, DATA / 'state.json')
        finally:
            if os.path.exists(name):
                os.unlink(name)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.svg': 'image/svg+xml'}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'")
        super().end_headers()

    def respond(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/api/health':
            return self.respond(200, {'ok': True, 'app': 'Basta', 'version': '1.0.0'})
        if path == '/api/state':
            try:
                with LOCK:
                    state = json.loads((DATA / 'state.json').read_text()) if (DATA / 'state.json').exists() else {}
                return self.respond(200, state)
            except (ValueError, OSError):
                return self.respond(500, {'error': 'No se pudo leer la partida guardada. Conserva state.json para recuperarla.'})
        if path not in ('/', '/index.html', '/style.css', '/app.mjs', '/engine.mjs', '/categories.mjs', '/icon.svg'):
            return self.respond(404, {'error': 'No encontrado'})
        return super().do_GET()

    def do_PUT(self):
        if urlsplit(self.path).path != '/api/state':
            return self.respond(404, {'error': 'No encontrado'})
        origin = self.headers.get('Origin')
        if origin and urlsplit(origin).netloc != self.headers.get('Host'):
            return self.respond(403, {'error': 'Origen no permitido'})
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            return self.respond(403, {'error': 'Origen no permitido'})
        if self.headers.get('Content-Type', '').split(';')[0] != 'application/json':
            return self.respond(415, {'error': 'Se requiere JSON'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= MAX_BODY:
                return self.respond(413, {'error': 'Archivo demasiado grande'})
            value = validate(json.loads(self.rfile.read(length)))
            persist(value)
            self.respond(200, {'saved': True})
        except (ValueError, TypeError, KeyError):
            self.respond(400, {'error': 'Estado inválido'})
        except OSError:
            self.respond(500, {'error': 'No se pudo guardar en Umbrel'})

    def log_message(self, fmt, *args):
        # Nunca registrar cuerpos, nombres ni fotos.
        super().log_message(fmt, *args)


if __name__ == '__main__':
    server = ThreadingHTTPServer((os.environ.get('BIND', '127.0.0.1'), int(os.environ.get('PORT', '8765'))), Handler)
    print(f'Basta disponible en puerto {server.server_port}', flush=True)
    server.serve_forever()

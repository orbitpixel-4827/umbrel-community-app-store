# Genera Basta.html (archivo local completo) y dist/basta-artifact.html (sin <html>/<head>, para publicar)
import base64, pathlib
root = pathlib.Path(__file__).parent
src = (root/'src/basta.src.html').read_text(encoding='utf-8')
def b64(p): return 'data:image/png;base64,' + base64.b64encode((root/p).read_bytes()).decode()
src = src.replace('__AV_CHICO__', b64('assets/avatar-chico.png')).replace('__AV_CHICA__', b64('assets/avatar-chica.png'))
(root/'dist').mkdir(exist_ok=True)
(root/'dist/basta-artifact.html').write_text(src, encoding='utf-8')
full = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        + src.replace('<script>', '</head>\n<body>\n<script>', 0) )
# separar head/body: todo antes de '<!-- ================= PANTALLA' va en head
i = src.index('<!-- ================= PANTALLA')
full = ('<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
        + src[:i] + '</head>\n<body>\n' + src[i:] + '\n</body>\n</html>\n')
(root/'Basta.html').write_text(full, encoding='utf-8')
print('ok', len(full)//1024, 'KB')

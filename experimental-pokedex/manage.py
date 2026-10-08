"""Local administration inside the container; never serves backups over HTTP."""
import os
from pathlib import Path
import sqlite3
import sys

LIMIT=256*1024*1024
REQUIRED={'config','encounters','sessions','cache','blobs','tickets','quotas'}

def export_db(directory,output):
    source=sqlite3.connect((Path(directory)/'pokedex.sqlite3').as_uri()+'?mode=ro',uri=True)
    snapshot=sqlite3.connect(':memory:')
    try:
        source.backup(snapshot)
        output.write(snapshot.serialize())
    finally:
        snapshot.close();source.close()

def restore_db(directory,input_stream):
    raw=input_stream.read(LIMIT+1)
    if len(raw)>LIMIT or not raw.startswith(b'SQLite format 3\x00'):
        raise ValueError('La copia no es una base SQLite válida de hasta 256 MB.')
    source=sqlite3.connect(':memory:')
    destination=None
    try:
        # SQLite requires rollback-mode header bytes for an in-memory snapshot.
        # The online backup already contains a consistent copy of the WAL data.
        raw=raw[:18]+b'\x01\x01'+raw[20:]
        source.deserialize(raw)
        if source.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('La copia está dañada.')
        tables={r[0] for r in source.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not REQUIRED.issubset(tables):raise ValueError('La copia no corresponde a Pokédex.')
        if not source.execute("SELECT 1 FROM config WHERE key='password_hash'").fetchone():raise ValueError('La copia no tiene una contraseña válida.')
        source.execute('DELETE FROM sessions');source.execute('DELETE FROM tickets');source.commit()
        directory=Path(directory).resolve();path=directory/'pokedex.sqlite3'
        destination=sqlite3.connect(path.as_uri()+'?mode=rw',uri=True,timeout=30)
        if destination.execute('SELECT count(*) FROM encounters').fetchone()[0]:raise ValueError('La Pokédex nueva ya tiene registros. No se sobrescribieron.')
        if any(destination.execute('SELECT 1 FROM config WHERE key=?',(key,)).fetchone() for key in ('preferences','voice_key','gemini_key','openrouter_key')):
            raise ValueError('La Pokédex nueva ya tiene ajustes. No se sobrescribieron.')
        previous=directory/'before-migration.sqlite3'
        if previous.exists():raise ValueError('Ya existe una copia anterior a la migración. No se sobrescribió.')
        backup=sqlite3.connect(previous)
        try:destination.backup(backup)
        finally:backup.close()
        previous.chmod(0o600)
        source.backup(destination)
        path.chmod(0o600)
    finally:
        if destination:destination.close()
        source.close()

if __name__=='__main__':
    directory=os.environ.get('POKEDEX_DATA_DIR','')
    if not directory or not Path(directory).is_absolute():raise SystemExit('Define POKEDEX_DATA_DIR con una ruta absoluta.')
    try:
        if sys.argv[1:] == ['export-db']:export_db(directory,sys.stdout.buffer)
        elif sys.argv[1:] == ['restore-db']:
            restore_db(directory,sys.stdin.buffer)
            print('Base trasladada: usa tu contraseña anterior y vuelve a iniciar sesión.')
        else:raise SystemExit('Uso: python manage.py export-db | restore-db')
    except (ValueError,sqlite3.Error):raise SystemExit('No se completó la migración: revisa que la copia sea válida y la instalación nueva esté vacía.') from None

#!/usr/bin/env python3
"""Exporta o restaura la base SQLite sin exponerla por HTTP."""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
from pathlib import Path


DATA_DIR = Path(os.environ.get("DATA_DIR", "/data"))
DB_PATH = DATA_DIR / "family_savings.db"
REQUIRED_TABLES = {"people", "savings_types", "transactions"}


def export_database(output_stream):
    if not DB_PATH.exists():
        raise ValueError("Todavía no existe una base de datos para exportar.")
    source = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    with tempfile.NamedTemporaryFile(dir=DATA_DIR, suffix=".sqlite3") as temporary:
        snapshot = sqlite3.connect(temporary.name)
        try:
            source.backup(snapshot)
        finally:
            snapshot.close()
            source.close()
        temporary.seek(0)
        output_stream.write(temporary.read())


def validate_snapshot(snapshot):
    integrity = snapshot.execute("PRAGMA integrity_check").fetchone()
    if not integrity or integrity[0] != "ok":
        raise ValueError("La copia no es una base SQLite íntegra.")
    tables = {
        row[0]
        for row in snapshot.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    }
    if not REQUIRED_TABLES.issubset(tables):
        raise ValueError("La copia no pertenece a Ahorros Familiares.")


def restore_database(input_stream):
    raw = input_stream.read()
    if not raw:
        raise ValueError("La copia está vacía.")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=DATA_DIR, suffix=".sqlite3") as temporary:
        temporary.write(raw)
        temporary.flush()
        snapshot = sqlite3.connect(temporary.name)
        try:
            validate_snapshot(snapshot)
            destination = sqlite3.connect(DB_PATH)
            try:
                snapshot.backup(destination)
                destination.execute("PRAGMA wal_checkpoint(TRUNCATE)")
            finally:
                destination.close()
        except sqlite3.DatabaseError as exc:
            raise ValueError("La copia no es una base SQLite válida.") from exc
        finally:
            snapshot.close()


def main():
    command = sys.argv[1:]
    if command == ["export-db"]:
        export_database(sys.stdout.buffer)
    elif command == ["restore-db"]:
        restore_database(sys.stdin.buffer)
        print("Base de datos restaurada.", file=sys.stderr)
    else:
        raise SystemExit("Uso: python manage.py export-db | restore-db")


if __name__ == "__main__":
    try:
        main()
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

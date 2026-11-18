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
    required_columns = {
        "people": {"id", "name", "created_at"},
        "savings_types": {"id", "name", "created_at"},
        "transactions": {"id", "person_id", "savings_type_id", "kind", "amount_cents", "note", "occurred_at", "created_at"},
    }
    for table, required in required_columns.items():
        table_info = snapshot.execute(f"PRAGMA table_info({table})").fetchall()
        columns = {row[1] for row in table_info}
        if not required.issubset(columns):
            raise ValueError("La copia tiene una estructura incompatible con Ahorros Familiares.")
        primary_keys = [row for row in table_info if row[5]]
        if len(primary_keys) != 1 or primary_keys[0][1] != "id" or primary_keys[0][2].upper() != "INTEGER":
            raise ValueError("La copia tiene identificadores incompatibles con Ahorros Familiares.")
        invalid_ids = snapshot.execute(
            f"SELECT 1 FROM {table} GROUP BY id HAVING id IS NULL OR typeof(id) != 'integer' OR COUNT(*) != 1 LIMIT 1"
        ).fetchone()
        if invalid_ids:
            raise ValueError("La copia contiene identificadores inválidos.")
    if snapshot.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("La copia contiene relaciones inválidas.")
    invalid = snapshot.execute("""
        SELECT 1 FROM transactions t
        LEFT JOIN people p ON p.id = t.person_id
        LEFT JOIN savings_types s ON s.id = t.savings_type_id
        WHERE p.id IS NULL OR s.id IS NULL OR t.kind IS NULL
           OR t.kind NOT IN ('deposit', 'withdrawal')
           OR typeof(t.amount_cents) != 'integer' OR t.amount_cents <= 0
        LIMIT 1
    """).fetchone()
    if invalid:
        raise ValueError("La copia contiene movimientos inválidos.")
    columns = {row[1] for row in snapshot.execute("PRAGMA table_info(transactions)")}
    if "transfer_id" in columns:
        invalid_transfer = snapshot.execute("""
            SELECT 1 FROM transactions WHERE transfer_id IS NOT NULL
            GROUP BY transfer_id
            HAVING COUNT(*) != 2 OR COUNT(DISTINCT person_id) != 1
                OR COUNT(DISTINCT savings_type_id) != 2
                OR COUNT(DISTINCT amount_cents) != 1
                OR COUNT(DISTINCT occurred_at) != 1
                OR SUM(CASE WHEN kind = 'deposit' THEN 1 ELSE 0 END) != 1
                OR SUM(CASE WHEN kind = 'withdrawal' THEN 1 ELSE 0 END) != 1
            LIMIT 1
        """).fetchone()
        if invalid_transfer:
            raise ValueError("La copia contiene traspasos incompletos o inconsistentes.")


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

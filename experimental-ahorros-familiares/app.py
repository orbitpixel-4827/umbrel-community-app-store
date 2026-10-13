#!/usr/bin/env python3
"""Servidor web y API de Ahorros Familiares, sin dependencias externas."""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE_DIR / "data"))
DB_PATH = DATA_DIR / "family_savings.db"
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8080"))
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def db_connection():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("PRAGMA journal_mode = WAL")
    return connection


@contextmanager
def database():
    connection = db_connection()
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def initialize_database():
    with database() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS people (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS savings_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL COLLATE NOCASE UNIQUE,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                person_id INTEGER NOT NULL,
                savings_type_id INTEGER NOT NULL,
                kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
                amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
                note TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                transfer_id TEXT,
                FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE RESTRICT,
                FOREIGN KEY (savings_type_id) REFERENCES savings_types(id) ON DELETE RESTRICT
            );

            CREATE INDEX IF NOT EXISTS idx_transactions_person ON transactions(person_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(savings_type_id);
            CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(occurred_at DESC);
            """
        )
        columns = {row["name"] for row in db.execute("PRAGMA table_info(transactions)").fetchall()}
        if "transfer_id" not in columns:
            db.execute("ALTER TABLE transactions ADD COLUMN transfer_id TEXT")
        db.execute("CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions(transfer_id)")


def filters_from_query(query):
    clauses = []
    params = []
    for key, column in (("person_id", "t.person_id"), ("type_id", "t.savings_type_id")):
        value = query.get(key, [""])[0]
        if value:
            try:
                parsed = int(value)
            except ValueError as exc:
                raise ValueError(f"Filtro inválido: {key}") from exc
            clauses.append(f"{column} = ?")
            params.append(parsed)
    date_from = query.get("date_from", [""])[0]
    date_to = query.get("date_to", [""])[0]
    for value, operator, label in ((date_from, ">=", "inicial"), (date_to, "<=", "final")):
        if value:
            if not DATE_RE.match(value):
                raise ValueError(f"La fecha {label} no es válida.")
            try:
                datetime.strptime(value, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError(f"La fecha {label} no es válida.") from exc
            clauses.append(f"t.occurred_at {operator} ?")
            params.append(value)
    if date_from and date_to and date_from > date_to:
        raise ValueError("La fecha inicial no puede ser posterior a la fecha final.")
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", params


def pdf_text(value):
    """Escapa texto compatible con la codificación WinAnsi de PDF."""
    return str(value).replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def pdf_money(cents, signed=False):
    value = int(cents or 0) / 100
    prefix = "+" if signed and value > 0 else ""
    return f"{prefix}${value:,.2f}"


def truncate_text(value, length):
    value = str(value or "")
    return value if len(value) <= length else value[: max(1, length - 1)] + "…"


def build_pdf(page_streams):
    """Construye un PDF multipágina pequeño sin dependencias externas."""
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"",  # Se completa al conocer las páginas.
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    ]
    page_ids = []
    for stream in page_streams:
        page_id = len(objects) + 1
        content_id = page_id + 1
        page_ids.append(page_id)
        objects.append(
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_id} 0 R >>".encode()
        )
        encoded = stream.encode("cp1252", errors="replace")
        objects.append(b"<< /Length " + str(len(encoded)).encode() + b" >>\nstream\n" + encoded + b"\nendstream")
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, obj in enumerate(objects, 1):
        offsets.append(len(output))
        output.extend(f"{number} 0 obj\n".encode())
        output.extend(obj)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode())
    output.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode()
    )
    return bytes(output)


def statement_pdf(title, scope, summary, movements, generated_at):
    rows_per_page = 25
    chunks = [movements[index : index + rows_per_page] for index in range(0, len(movements), rows_per_page)] or [[]]
    streams = []
    for page_number, rows in enumerate(chunks, 1):
        commands = ["1 g 0 0 612 792 re f 0 g"]

        def text(x, y, value, size=9, bold=False):
            font = "F2" if bold else "F1"
            commands.append(f"BT /{font} {size} Tf 1 0 0 1 {x} {y} Tm ({pdf_text(value)}) Tj ET")

        def line(x1, y1, x2, y2, width=0.5):
            commands.append(f"{width} w {x1} {y1} m {x2} {y2} l S")

        text(44, 748, title, 19, True)
        text(44, 728, scope, 9)
        text(460, 748, f"Página {page_number} de {len(chunks)}", 8)
        text(427, 728, f"Generado: {generated_at}", 8)
        line(44, 715, 568, 715, 1)

        text(44, 690, "SALDO", 8, True)
        text(44, 670, pdf_money(summary["balance_cents"]), 16, True)
        text(220, 690, "DEPÓSITOS / ENTRADAS", 8, True)
        text(220, 670, pdf_money(summary["deposits_cents"]), 13, True)
        text(405, 690, "RETIROS / SALIDAS", 8, True)
        text(405, 670, pdf_money(summary["withdrawals_cents"]), 13, True)

        top = 636
        commands.append("0.94 g 44 618 524 24 re f 0 g")
        for x, label in ((48, "FECHA"), (103, "PERSONA"), (202, "TIPO / TRASPASO"), (349, "DETALLE"), (501, "IMPORTE")):
            text(x, top - 11, label, 7, True)

        y = 598
        for movement in rows:
            text(48, y, movement["date"], 8)
            text(103, y, truncate_text(movement["person"], 16), 8)
            text(202, y, truncate_text(movement["type"], 23), 8)
            text(349, y, truncate_text(movement["detail"], 24), 8)
            text(500, y, movement["amount"], 8, True)
            line(44, y - 9, 568, y - 9, 0.25)
            y -= 21

        if not rows:
            text(44, 585, "No hay movimientos para los filtros seleccionados.", 10)

        text(44, 36, "Ahorros Familiares · Estado de cuenta", 8)
        streams.append("\n".join(commands))
    return build_pdf(streams)


class AppHandler(BaseHTTPRequestHandler):
    server_version = "FamilySavings/1.0"

    def log_message(self, format_string, *args):
        print(f"[{self.log_date_time_string()}] {format_string % args}")

    def send_json(self, payload, status=HTTPStatus.OK):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, message, status=HTTPStatus.BAD_REQUEST):
        self.send_json({"error": message}, status)

    def send_file(self, data, content_type, filename):
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > 1_000_000:
                raise ValueError("La solicitud está vacía o es demasiado grande.")
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError) as exc:
            raise ValueError("Los datos enviados no son válidos.") from exc

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                return self.send_json({"status": "ok"})
            if parsed.path == "/api/people":
                return self.get_catalog("people")
            if parsed.path == "/api/types":
                return self.get_catalog("savings_types")
            if parsed.path == "/api/transactions":
                return self.get_transactions(parse_qs(parsed.query))
            if parsed.path == "/api/summary":
                return self.get_summary(parse_qs(parsed.query))
            if parsed.path == "/api/statement.pdf":
                return self.get_statement(parse_qs(parsed.query))
            return self.serve_static(parsed.path)
        except ValueError as exc:
            return self.send_error_json(str(exc))
        except sqlite3.Error:
            return self.send_error_json("No fue posible consultar la información.", HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            payload = self.read_json()
            if parsed.path == "/api/people":
                return self.create_catalog_item("people", payload)
            if parsed.path == "/api/types":
                return self.create_catalog_item("savings_types", payload)
            if parsed.path == "/api/transactions":
                return self.create_transaction(payload)
            return self.send_error_json("Ruta no encontrada.", HTTPStatus.NOT_FOUND)
        except ValueError as exc:
            return self.send_error_json(str(exc))
        except sqlite3.IntegrityError as exc:
            if "UNIQUE" in str(exc):
                return self.send_error_json("Ese nombre ya existe.", HTTPStatus.CONFLICT)
            return self.send_error_json("No fue posible guardar el registro.")
        except sqlite3.Error:
            return self.send_error_json("No fue posible guardar la información.", HTTPStatus.INTERNAL_SERVER_ERROR)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        match = re.fullmatch(r"/api/transactions/(\d+)", parsed.path)
        if not match:
            return self.send_error_json("Ruta no encontrada.", HTTPStatus.NOT_FOUND)
        try:
            transaction_id = int(match.group(1))
            with database() as db:
                row = db.execute("SELECT transfer_id FROM transactions WHERE id = ?", (transaction_id,)).fetchone()
                if not row:
                    return self.send_error_json("El movimiento ya no existe.", HTTPStatus.NOT_FOUND)
                if row["transfer_id"]:
                    db.execute("DELETE FROM transactions WHERE transfer_id = ?", (row["transfer_id"],))
                else:
                    db.execute("DELETE FROM transactions WHERE id = ?", (transaction_id,))
            self.send_json({"message": "Movimiento eliminado."})
        except sqlite3.Error:
            self.send_error_json("No fue posible eliminar el movimiento.", HTTPStatus.INTERNAL_SERVER_ERROR)

    def get_catalog(self, table):
        with database() as db:
            rows = db.execute(f"SELECT id, name, created_at FROM {table} ORDER BY name COLLATE NOCASE").fetchall()
        self.send_json({"items": [dict(row) for row in rows]})

    def create_catalog_item(self, table, payload):
        name = str(payload.get("name", "")).strip()
        if not name:
            raise ValueError("Escribe un nombre.")
        if len(name) > 80:
            raise ValueError("El nombre no puede superar 80 caracteres.")
        with database() as db:
            cursor = db.execute(f"INSERT INTO {table} (name) VALUES (?)", (name,))
            row = db.execute(f"SELECT id, name, created_at FROM {table} WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json(dict(row), HTTPStatus.CREATED)

    def create_transaction(self, payload):
        kind = payload.get("kind")
        try:
            person_id = int(payload.get("person_id"))
            type_id = int(payload.get("type_id"))
            amount_cents = int(payload.get("amount_cents"))
            to_type_id = int(payload.get("to_type_id")) if kind == "transfer" else None
        except (TypeError, ValueError) as exc:
            raise ValueError("Completa la persona, el tipo de ahorro y el monto.") from exc

        occurred_at = str(payload.get("occurred_at", ""))
        note = str(payload.get("note", "")).strip()
        if kind not in ("deposit", "withdrawal", "transfer"):
            raise ValueError("Selecciona depósito, retiro o traspaso.")
        if kind == "transfer" and type_id == to_type_id:
            raise ValueError("El tipo de origen y el de destino deben ser diferentes.")
        if amount_cents <= 0:
            raise ValueError("El monto debe ser mayor que cero.")
        if amount_cents > 999_999_999_99:
            raise ValueError("El monto es demasiado grande.")
        if not DATE_RE.match(occurred_at):
            raise ValueError("Selecciona una fecha válida.")
        try:
            datetime.strptime(occurred_at, "%Y-%m-%d")
        except ValueError as exc:
            raise ValueError("Selecciona una fecha válida.") from exc
        if len(note) > 240:
            raise ValueError("La nota no puede superar 240 caracteres.")

        with database() as db:
            if not db.execute("SELECT 1 FROM people WHERE id = ?", (person_id,)).fetchone():
                raise ValueError("La persona seleccionada no existe.")
            if not db.execute("SELECT 1 FROM savings_types WHERE id = ?", (type_id,)).fetchone():
                raise ValueError("El tipo de ahorro seleccionado no existe.")
            if kind == "transfer":
                if not db.execute("SELECT 1 FROM savings_types WHERE id = ?", (to_type_id,)).fetchone():
                    raise ValueError("El tipo de ahorro de destino no existe.")
                transfer_id = uuid.uuid4().hex
                cursor = db.execute(
                    """
                    INSERT INTO transactions
                        (person_id, savings_type_id, kind, amount_cents, note, occurred_at, transfer_id)
                    VALUES (?, ?, 'withdrawal', ?, ?, ?, ?)
                    """,
                    (person_id, type_id, amount_cents, note, occurred_at, transfer_id),
                )
                db.execute(
                    """
                    INSERT INTO transactions
                        (person_id, savings_type_id, kind, amount_cents, note, occurred_at, transfer_id)
                    VALUES (?, ?, 'deposit', ?, ?, ?, ?)
                    """,
                    (person_id, to_type_id, amount_cents, note, occurred_at, transfer_id),
                )
            else:
                cursor = db.execute(
                    """
                    INSERT INTO transactions
                        (person_id, savings_type_id, kind, amount_cents, note, occurred_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (person_id, type_id, kind, amount_cents, note, occurred_at),
                )
        self.send_json({"id": cursor.lastrowid, "message": "Movimiento guardado."}, HTTPStatus.CREATED)

    def get_transactions(self, query):
        where, params = filters_from_query(query)
        sql = f"""
            SELECT t.id, t.kind, t.amount_cents, t.note, t.occurred_at, t.created_at, t.transfer_id,
                   p.id AS person_id, p.name AS person_name,
                   s.id AS type_id, s.name AS type_name,
                   (SELECT sf.id FROM transactions tf JOIN savings_types sf ON sf.id = tf.savings_type_id
                    WHERE tf.transfer_id = t.transfer_id AND tf.kind = 'withdrawal' LIMIT 1) AS transfer_from_id,
                   (SELECT sf.name FROM transactions tf JOIN savings_types sf ON sf.id = tf.savings_type_id
                    WHERE tf.transfer_id = t.transfer_id AND tf.kind = 'withdrawal' LIMIT 1) AS transfer_from_name,
                   (SELECT st.id FROM transactions tt JOIN savings_types st ON st.id = tt.savings_type_id
                    WHERE tt.transfer_id = t.transfer_id AND tt.kind = 'deposit' LIMIT 1) AS transfer_to_id,
                   (SELECT st.name FROM transactions tt JOIN savings_types st ON st.id = tt.savings_type_id
                    WHERE tt.transfer_id = t.transfer_id AND tt.kind = 'deposit' LIMIT 1) AS transfer_to_name
            FROM transactions t
            JOIN people p ON p.id = t.person_id
            JOIN savings_types s ON s.id = t.savings_type_id
            {where}
            ORDER BY t.occurred_at DESC, t.id DESC
            LIMIT 1000
        """
        with database() as db:
            rows = db.execute(sql, params).fetchall()
        self.send_json({"items": [dict(row) for row in rows]})

    def get_summary(self, query):
        where, params = filters_from_query(query)
        include_transfer_flows = bool(query.get("type_id", [""])[0])
        transfer_condition = "" if include_transfer_flows else " AND t.transfer_id IS NULL"
        with database() as db:
            total = db.execute(
                f"""
                SELECT
                    COALESCE(SUM(CASE WHEN t.kind = 'deposit' THEN t.amount_cents ELSE -t.amount_cents END), 0) AS balance_cents,
                    COALESCE(SUM(CASE WHEN t.kind = 'deposit'{transfer_condition} THEN t.amount_cents ELSE 0 END), 0) AS deposits_cents,
                    COALESCE(SUM(CASE WHEN t.kind = 'withdrawal'{transfer_condition} THEN t.amount_cents ELSE 0 END), 0) AS withdrawals_cents,
                    COALESCE(SUM(CASE WHEN t.transfer_id IS NULL THEN 1 ELSE 0 END), 0) + COUNT(DISTINCT t.transfer_id) AS movement_count
                FROM transactions t {where}
                """,
                params,
            ).fetchone()
            breakdown = db.execute(
                f"""
                SELECT p.id AS person_id, p.name AS person_name,
                       s.id AS type_id, s.name AS type_name,
                       SUM(CASE WHEN t.kind = 'deposit' THEN t.amount_cents ELSE -t.amount_cents END) AS balance_cents,
                       SUM(CASE WHEN t.kind = 'deposit' THEN t.amount_cents ELSE 0 END) AS deposits_cents,
                       SUM(CASE WHEN t.kind = 'withdrawal' THEN t.amount_cents ELSE 0 END) AS withdrawals_cents
                FROM transactions t
                JOIN people p ON p.id = t.person_id
                JOIN savings_types s ON s.id = t.savings_type_id
                {where}
                GROUP BY p.id, s.id
                ORDER BY p.name COLLATE NOCASE, s.name COLLATE NOCASE
                """,
                params,
            ).fetchall()
        self.send_json({"total": dict(total), "breakdown": [dict(row) for row in breakdown]})

    def get_statement(self, query):
        where, params = filters_from_query(query)
        include_transfer_flows = bool(query.get("type_id", [""])[0])
        transfer_condition = "" if include_transfer_flows else " AND t.transfer_id IS NULL"
        with database() as db:
            total = db.execute(
                f"""
                SELECT
                    COALESCE(SUM(CASE WHEN t.kind = 'deposit' THEN t.amount_cents ELSE -t.amount_cents END), 0) AS balance_cents,
                    COALESCE(SUM(CASE WHEN t.kind = 'deposit'{transfer_condition} THEN t.amount_cents ELSE 0 END), 0) AS deposits_cents,
                    COALESCE(SUM(CASE WHEN t.kind = 'withdrawal'{transfer_condition} THEN t.amount_cents ELSE 0 END), 0) AS withdrawals_cents
                FROM transactions t {where}
                """,
                params,
            ).fetchone()
            rows = db.execute(
                f"""
                SELECT t.id, t.kind, t.amount_cents, t.note, t.occurred_at, t.transfer_id,
                       p.name AS person_name, s.name AS type_name,
                       (SELECT sf.name FROM transactions tf JOIN savings_types sf ON sf.id = tf.savings_type_id
                        WHERE tf.transfer_id = t.transfer_id AND tf.kind = 'withdrawal' LIMIT 1) AS transfer_from_name,
                       (SELECT st.name FROM transactions tt JOIN savings_types st ON st.id = tt.savings_type_id
                        WHERE tt.transfer_id = t.transfer_id AND tt.kind = 'deposit' LIMIT 1) AS transfer_to_name
                FROM transactions t
                JOIN people p ON p.id = t.person_id
                JOIN savings_types s ON s.id = t.savings_type_id
                {where}
                ORDER BY t.occurred_at DESC, t.id DESC
                """,
                params,
            ).fetchall()

            person_name = "Todas las personas"
            type_name = "Todos los tipos de ahorro"
            person_id = query.get("person_id", [""])[0]
            type_id = query.get("type_id", [""])[0]
            if person_id:
                record = db.execute("SELECT name FROM people WHERE id = ?", (int(person_id),)).fetchone()
                person_name = record["name"] if record else person_name
            if type_id:
                record = db.execute("SELECT name FROM savings_types WHERE id = ?", (int(type_id),)).fetchone()
                type_name = record["name"] if record else type_name

        movements = []
        seen_transfers = set()
        for row in rows:
            if row["transfer_id"]:
                if row["transfer_id"] in seen_transfers:
                    continue
                seen_transfers.add(row["transfer_id"])
                signed_amount = row["amount_cents"] if row["kind"] == "deposit" else -row["amount_cents"]
                amount = pdf_money(signed_amount, signed=include_transfer_flows) if include_transfer_flows else pdf_money(row["amount_cents"])
                type_label = f"{row['transfer_from_name']} → {row['transfer_to_name']}"
                detail = "Traspaso" + (f" · {row['note']}" if row["note"] else "")
            else:
                signed_amount = row["amount_cents"] if row["kind"] == "deposit" else -row["amount_cents"]
                amount = pdf_money(signed_amount, signed=True)
                type_label = row["type_name"]
                detail = ("Depósito" if row["kind"] == "deposit" else "Retiro") + (f" · {row['note']}" if row["note"] else "")
            movements.append(
                {
                    "date": row["occurred_at"],
                    "person": row["person_name"],
                    "type": type_label,
                    "detail": detail,
                    "amount": amount,
                }
            )

        date_from = query.get("date_from", [""])[0]
        date_to = query.get("date_to", [""])[0]
        if date_from and date_to:
            period = f"Del {date_from} al {date_to}"
        elif date_from:
            period = f"Desde {date_from}"
        elif date_to:
            period = f"Hasta {date_to}"
        else:
            period = "Todos los periodos"
        scope = f"{person_name} · {type_name} · {period}"
        generated = datetime.now().strftime("%Y-%m-%d %H:%M")
        pdf = statement_pdf("Estado de cuenta", scope, dict(total), movements, generated)
        filename = f"estado-cuenta-{datetime.now().strftime('%Y%m%d-%H%M')}.pdf"
        self.send_file(pdf, "application/pdf", filename)

    def serve_static(self, request_path):
        relative = "index.html" if request_path == "/" else request_path.lstrip("/")
        candidate = (STATIC_DIR / relative).resolve()
        if STATIC_DIR.resolve() not in candidate.parents and candidate != STATIC_DIR.resolve():
            return self.send_error_json("Ruta no encontrada.", HTTPStatus.NOT_FOUND)
        if not candidate.is_file():
            return self.send_error_json("Ruta no encontrada.", HTTPStatus.NOT_FOUND)
        data = candidate.read_bytes()
        mime_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{mime_type}; charset=utf-8" if mime_type.startswith("text/") else mime_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.end_headers()
        self.wfile.write(data)


def main():
    initialize_database()
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"Ahorros Familiares disponible en http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()

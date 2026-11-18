import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

import app
import manage


class BetaRegressionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name)
        app.DATA_DIR = manage.DATA_DIR = self.directory
        app.DB_PATH = manage.DB_PATH = self.directory / "family_savings.db"
        app.initialize_database()
        self.handler = app.AppHandler.__new__(app.AppHandler)
        self.handler.send_json = lambda payload, *args: setattr(self, "response", payload)
        self.handler.send_file = lambda data, *args: setattr(self, "pdf", data)
        with app.database() as db:
            db.execute("INSERT INTO people(name) VALUES ('Persona de prueba')")
            db.executemany("INSERT INTO savings_types(name) VALUES (?)", [("Fondo A",), ("Fondo B",)])

    def tearDown(self):
        self.temp.cleanup()

    def movement(self, kind="deposit", amount=100000, date="2026-10-01", type_id=1):
        self.handler.create_transaction(dict(person_id=1, type_id=type_id,
            to_type_id=2, kind=kind, amount_cents=amount, occurred_at=date))

    def test_period_opening_and_closing_balances(self):
        self.movement()
        self.movement("withdrawal", 10000, "2026-11-01")
        self.handler.get_statement({"date_from": ["2026-11-01"], "date_to": ["2026-11-30"]})
        self.assertIn(b"Saldo inicial: $1,000.00", self.pdf)
        self.assertIn(b"($900.00)", self.pdf)
        self.handler.get_statement({})
        self.assertIn(b"Saldo inicial: $0.00", self.pdf)
        self.assertIn(b"($900.00)", self.pdf)

    def test_filtered_transfer_statement_and_atomic_delete(self):
        self.movement()
        self.movement("transfer", 25000, "2026-11-01")
        for type_id, opening, closing in [(1, b"$1,000.00", b"$750.00"), (2, b"$0.00", b"$250.00")]:
            self.handler.get_statement({"type_id": [str(type_id)], "person_id": ["1"], "date_from": ["2026-11-01"]})
            self.assertIn(b"Saldo inicial: " + opening, self.pdf)
            self.assertIn(b"(" + closing + b")", self.pdf)
        self.handler.get_transactions({})
        transfer = next(item for item in self.response["items"] if item["transfer_id"])
        self.handler.path = "/api/transactions/" + str(transfer["id"])
        self.handler.do_DELETE()
        self.handler.get_summary({})
        self.assertEqual(self.response["total"]["balance_cents"], 100000)
        self.assertEqual(self.response["total"]["movement_count"], 1)

    def test_history_has_no_limit_or_split_transfers(self):
        with app.database() as db:
            db.executemany("""INSERT INTO transactions
                (person_id,savings_type_id,kind,amount_cents,occurred_at)
                VALUES(1,1,'deposit',100,'2026-10-01')""", [()] * 1003)
        self.movement("transfer", 100, "2026-10-01")
        ids = []
        offset = 0
        while offset is not None:
            self.handler.get_transactions({"offset": [str(offset)]})
            self.assertEqual(self.response["total"], 1004)
            ids.extend(item["id"] for item in self.response["items"])
            offset = self.response["next_offset"]
        self.assertEqual(len(ids), 1004)
        self.assertEqual(len(set(ids)), 1004)
        self.assertIn(1, ids)
        self.handler.path = "/api/transactions/1"
        self.handler.do_DELETE()
        self.assertEqual(self.response["message"], "Movimiento eliminado.")
        self.handler.get_transactions({"type_id": ["1"]})
        self.assertEqual(self.response["total"], 1003)

    def test_incompatible_import_preserves_destination(self):
        self.movement()
        path = self.directory / "wrong.db"
        with sqlite3.connect(path) as db:
            for table in manage.REQUIRED_TABLES:
                db.execute(f"CREATE TABLE {table}(wrong TEXT)")
        with self.assertRaisesRegex(ValueError, "estructura incompatible"):
            manage.restore_database(io.BytesIO(path.read_bytes()))
        self.handler.get_summary({})
        self.assertEqual(self.response["total"]["balance_cents"], 100000)

    def test_legacy_snapshot_and_migration(self):
        self.movement()
        with app.database() as db:
            db.execute("DROP INDEX idx_transactions_transfer")
            # SQLite version on older hosts may not support DROP COLUMN.
            db.execute("ALTER TABLE transactions RENAME TO legacy_transactions")
            db.execute("""CREATE TABLE transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT, person_id INTEGER NOT NULL,
                savings_type_id INTEGER NOT NULL, kind TEXT NOT NULL,
                amount_cents INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY(person_id) REFERENCES people(id),
                FOREIGN KEY(savings_type_id) REFERENCES savings_types(id))""")
            db.execute("""INSERT INTO transactions SELECT id, person_id,
                savings_type_id, kind, amount_cents, note, occurred_at, created_at
                FROM legacy_transactions""")
            db.execute("DROP TABLE legacy_transactions")
        output = io.BytesIO()
        manage.export_database(output)
        manage.restore_database(io.BytesIO(output.getvalue()))
        app.initialize_database()
        self.movement(amount=100)
        self.handler.get_transactions({})
        self.assertEqual(len(self.response["items"]), 2)
        self.handler.get_summary({})
        self.assertEqual(self.response["total"]["balance_cents"], 100100)

    def test_snapshot_missing_primary_key_is_rejected(self):
        self.movement()
        with app.database() as db:
            db.execute("ALTER TABLE transactions RENAME TO old_transactions")
            db.execute("CREATE TABLE transactions AS SELECT * FROM old_transactions")
            db.execute("DROP TABLE old_transactions")
        output = io.BytesIO()
        manage.export_database(output)
        with self.assertRaisesRegex(ValueError, "identificadores incompatibles"):
            manage.restore_database(io.BytesIO(output.getvalue()))

    def test_invalid_transfer_snapshot_is_rejected(self):
        self.movement("transfer", 5000)
        with app.database() as db:
            db.execute("DELETE FROM transactions WHERE kind = 'withdrawal'")
        output = io.BytesIO()
        manage.export_database(output)
        with self.assertRaisesRegex(ValueError, "traspasos"):
            manage.restore_database(io.BytesIO(output.getvalue()))


if __name__ == "__main__":
    unittest.main()

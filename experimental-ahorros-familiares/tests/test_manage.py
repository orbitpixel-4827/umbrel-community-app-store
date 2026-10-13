import io
import sqlite3
import tempfile
import unittest
from pathlib import Path

import app
import manage


class DatabaseTransferTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.directory = Path(self.temporary.name)
        app.DATA_DIR = self.directory
        app.DB_PATH = self.directory / "family_savings.db"
        manage.DATA_DIR = self.directory
        manage.DB_PATH = app.DB_PATH
        app.initialize_database()

    def tearDown(self):
        self.temporary.cleanup()

    def test_export_and_restore(self):
        with app.database() as database:
            database.execute("INSERT INTO people (name) VALUES ('Daniel')")
            database.execute("INSERT INTO savings_types (name) VALUES ('Emergencias')")
        output = io.BytesIO()
        manage.export_database(output)
        with app.database() as database:
            database.execute("DELETE FROM people")
        manage.restore_database(io.BytesIO(output.getvalue()))
        with app.database() as database:
            person = database.execute("SELECT name FROM people").fetchone()
        self.assertEqual(person["name"], "Daniel")

    def test_rejects_unrelated_database(self):
        unrelated_path = self.directory / "unrelated.sqlite3"
        unrelated = sqlite3.connect(unrelated_path)
        unrelated.execute("CREATE TABLE notes (body TEXT)")
        unrelated.commit()
        unrelated.close()
        raw = unrelated_path.read_bytes()
        with self.assertRaisesRegex(ValueError, "no pertenece"):
            manage.restore_database(io.BytesIO(raw))


if __name__ == "__main__":
    unittest.main()

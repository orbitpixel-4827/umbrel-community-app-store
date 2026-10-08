import io
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import manage
import server
ROOT=Path(__file__).resolve().parents[1]/'.cache/tests'
ROOT.mkdir(parents=True,exist_ok=True)
class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=ROOT)
        self.old=server.Store(Path(self.temp.name)/'old','old-fixture-password-2026')
        self.new=server.Store(Path(self.temp.name)/'new','new-fixture-password-2026')
    def tearDown(self):
        self.old.db.close();self.new.db.close();self.temp.cleanup()
    def exported(self):
        stream=io.BytesIO();manage.export_db(self.old.directory,stream);return stream.getvalue()
    def test_full_database_preserves_encounters_password_keys_and_settings(self):
        self.old.set('voice_key','fixture-only-key');self.old.set('preferences',{'robot':True})
        self.old.db.execute("INSERT INTO encounters VALUES ('fixture-id',5,1,'{}')")
        self.old.login('old-fixture-password-2026')
        manage.restore_db(self.new.directory,io.BytesIO(self.exported()))
        self.new.verify_password('old-fixture-password-2026')
        self.assertEqual(self.new.get('voice_key'),'fixture-only-key')
        self.assertEqual(self.new.get('preferences'),{'robot':True})
        self.assertEqual(self.new.db.execute('SELECT count(*) FROM encounters').fetchone()[0],1)
        self.assertEqual(self.new.db.execute('SELECT count(*) FROM sessions').fetchone()[0],0)
        self.assertTrue((self.new.directory/'before-migration.sqlite3').is_file())
    def test_destination_with_encounters_is_never_overwritten(self):
        self.new.db.execute("INSERT INTO encounters VALUES ('keep',5,1,'{}')")
        with self.assertRaises(ValueError):manage.restore_db(self.new.directory,io.BytesIO(self.exported()))
        self.assertEqual(self.new.db.execute('SELECT id FROM encounters').fetchone()[0],'keep')
        self.new.verify_password('new-fixture-password-2026')
    def test_destination_with_keys_is_never_overwritten(self):
        self.new.set('voice_key','keep-fixture-only')
        with self.assertRaises(ValueError):manage.restore_db(self.new.directory,io.BytesIO(self.exported()))
        self.assertEqual(self.new.get('voice_key'),'keep-fixture-only')
    def test_bad_backup_does_not_change_destination(self):
        with self.assertRaises(ValueError):manage.restore_db(self.new.directory,io.BytesIO(b'bad'))
        self.new.verify_password('new-fixture-password-2026')

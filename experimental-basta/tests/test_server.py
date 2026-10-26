import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
import server


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(dir=Path(__file__).resolve().parents[1])
        server.DATA = Path(cls.tmp.name)
        cls.http = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown()
        cls.http.server_close()
        cls.tmp.cleanup()

    def put(self, data, **headers):
        request = urllib.request.Request(self.base+'/api/state', data=json.dumps(data).encode(), method='PUT', headers={'Content-Type':'application/json', **headers})
        return urllib.request.urlopen(request)

    def test_round_trip_and_persistence(self):
        state = {'players':[{'id':'1','name':'A','avatar':''},{'id':'2','name':'B','avatar':''}], 'options':{}, 'game':None}
        self.assertEqual(self.put(state).status, 200)
        with urllib.request.urlopen(self.base+'/api/state') as r:
            self.assertEqual(json.load(r), state)
            self.assertEqual(r.headers['Cache-Control'], 'no-store')
        self.assertTrue((server.DATA/'state.json').exists())

    def test_reject_cross_site(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.put({}, Origin='https://external.invalid')
        self.assertEqual(error.exception.code,403)

    def test_reject_bad_avatar(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            self.put({'players':[{'name':'A','avatar':'https://external.invalid/photo'},{'name':'B'}], 'options':{}})
        self.assertEqual(error.exception.code,400)

    def test_private_files_not_served(self):
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(self.base+'/../data/state.json')
        self.assertEqual(error.exception.code,404)
        with urllib.request.urlopen(self.base+'/engine.mjs') as r:
            self.assertIn('javascript',r.headers['Content-Type'])

if __name__ == '__main__':
    unittest.main()

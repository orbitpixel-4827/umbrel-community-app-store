"""Exercise the production initializer and image with disposable CI data only."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import time
import urllib.request

IMAGE = "ahorros-familiares-ci"
NAME = "ahorros-familiares-ci-test"

def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()

def request(base, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=5) as response:
        body = response.read()
        return body if path.startswith("/api/statement.pdf") else json.loads(body)

def start(directory):
    docker("run", "-d", "--name", NAME, "--user", "1000:1000", "--read-only",
           "--cap-drop=ALL", "--security-opt=no-new-privileges:true",
           "-v", f"{directory}:/data", "-p", "127.0.0.1::8080", IMAGE)
    port = docker("port", NAME, "8080/tcp").split(":")[-1]
    base = "http://127.0.0.1:" + port
    for _ in range(100):
        try:
            if request(base, "/api/health")["status"] == "ok":
                return base
        except (OSError, ValueError):
            time.sleep(0.2)
    raise AssertionError("Container never became healthy")

def initialize(directory, code):
    docker("run", "--rm", "--user", "0:0", "--read-only", "--network=none",
           "--cap-drop=ALL", "--cap-add=CHOWN", "--cap-add=FOWNER",
           "--cap-add=DAC_OVERRIDE", "--security-opt=no-new-privileges:true",
           "-v", f"{directory}:/data", IMAGE, "python", "-c", code)

compose = Path("docker-compose.yml").read_text()
# Extract the literal Python initializer that is actually shipped in Umbrel.
initializer = textwrap.dedent(compose.split("      - |\n", 1)[1].split("\n  app_proxy:", 1)[0]).strip()
with tempfile.TemporaryDirectory(prefix="ahorros-ci-") as directory:
    try:
        docker("run", "--rm", "--user", "0:0", "-v", f"{directory}:/data",
               IMAGE, "python", "-c", "import os; os.chown('/data',0,0); os.chmod('/data',0o755)")
        initialize(directory, initializer)
        base = start(directory)
        person = request(base, "/api/people", {"name": "Persona CI"})["id"]
        source = request(base, "/api/types", {"name": "Fondo CI A"})["id"]
        destination = request(base, "/api/types", {"name": "Fondo CI B"})["id"]
        common = {"person_id": person, "type_id": source, "occurred_at": "2026-10-01"}
        request(base, "/api/transactions", {**common, "kind": "deposit", "amount_cents": 100000})
        request(base, "/api/transactions", {**common, "kind": "transfer",
            "to_type_id": destination, "amount_cents": 25000, "occurred_at": "2026-11-01"})
        assert request(base, "/api/summary")["total"]["balance_cents"] == 100000
        assert request(base, "/api/transactions")["total"] == 2
        pdf = request(base, "/api/statement.pdf?type_id=" + str(source) + "&date_from=2026-11-01")
        assert pdf.startswith(b"%PDF") and b"($750.00)" in pdf
        docker("rm", "-f", NAME)
        # Exercise an update with an existing DB owned by root, without deleting it.
        docker("run", "--rm", "--user", "0:0", "-v", f"{directory}:/data",
               IMAGE, "python", "-c",
               "import os; os.chown('/data',0,0); os.chmod('/data',0o755); os.chown('/data/family_savings.db',0,0); os.chmod('/data/family_savings.db',0o400)")
        initialize(directory, initializer)
        base = start(directory)
        assert request(base, "/api/summary")["total"]["balance_cents"] == 100000
        request(base, "/api/transactions", {**common, "kind": "withdrawal", "amount_cents": 10000})
        assert request(base, "/api/summary")["total"]["balance_cents"] == 90000
        print("PASS: root-owned new data, non-root startup, transfers, PDF, restart/update persistence and writable existing DB")
    except Exception:
        subprocess.run(["docker", "logs", NAME], check=False)
        raise
    finally:
        subprocess.run(["docker", "rm", "-f", NAME], check=False)
        # The test changed ownership inside this disposable CI-only directory.
        docker("run", "--rm", "--user", "0:0", "-v", f"{directory}:/data",
               IMAGE, "python", "-c",
               f"import os; [(os.chown('/data/'+n,{os.getuid()},{os.getgid()})) for n in os.listdir('/data')]; os.chown('/data',{os.getuid()},{os.getgid()})")

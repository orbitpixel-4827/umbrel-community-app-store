const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

test("isolated HTTP CRUD, invalid dates, partial status updates and uploaded covers", async () => {
  const root = path.resolve(".verification/api");
  fs.mkdirSync(root, { recursive: true });
  const folder = fs.mkdtempSync(path.join(root, "run-"));
  const port = 35000 + Math.floor(Math.random() * 10000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server/server.js"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, PORT: String(port), DB_PATH: path.join(folder, "data/registro.sqlite"),
      UPLOAD_DIR: path.join(folder, "uploads"), TMDB_API_KEY: "", RAWG_API_KEY: "", GOOGLE_BOOKS_API_KEY: "", COMICVINE_API_KEY: "" }
  });
  const call = (url, method = "GET", body) => fetch(base + url, {
    method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined
  });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error("Test server exited before becoming ready");
      ready = await fetch(base + "/api/health").then(r => r.ok).catch(() => false);
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, "test server is ready");
    const upload = new FormData();
    upload.append("cover", new Blob([fs.readFileSync("public/icons/icon-192.png")], { type: "image/png" }), "prueba.png");
    const coverResponse = await fetch(base + "/api/uploads/cover", { method: "POST", body: upload });
    assert.equal(coverResponse.status, 201);
    const { cover_url } = await coverResponse.json();
    assert.ok(fs.existsSync(path.join(folder, "uploads", path.basename(cover_url))));
    const item = await (await call("/api/items", "POST", { title: "Libro sintético", category: "Libro", status: "finished", finished_date: "31/12/2026", cover_url })).json();
    assert.equal(item.finished_date, "2026-12-31");
    const invalid = await call(`/api/items/${item.id}`, "PUT", { finished_date: "2026-02-30" });
    assert.equal(invalid.status, 400);
    assert.equal((await (await call(`/api/items/${item.id}`)).json()).finished_date, "2026-12-31");
    await call(`/api/items/${item.id}`, "PUT", { notes: "Una nota nueva\nOtro párrafo" });
    const updated = await (await call(`/api/items/${item.id}`, "PUT", { status: "pending" })).json();
    assert.equal(updated.notes, "Una nota nueva\nOtro párrafo");
    assert.equal(updated.cover_url, cover_url);
    for (const category of ["Cómic", "Manga"]) {
      assert.equal((await call("/api/items", "POST", { title: `Prueba ${category}`, category, status: "wishlist" })).status, 201);
    }
    assert.equal((await (await call("/api/items")).json()).length, 3);
    assert.equal((await call(`/api/items/${item.id}`, "DELETE")).status, 204);
    assert.equal((await (await call("/api/items")).json()).length, 2);
    assert.equal((await call(`/api/items/${item.id}`)).status, 404);
  } finally {
    const stopped = new Promise(resolve => child.once("exit", resolve));
    if (child.exitCode === null) { child.kill("SIGTERM"); await stopped; }
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

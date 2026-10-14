const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sqlite3 = require("../server/node_modules/sqlite3");

test("old database keeps every record, cover and date through migration and editing", async () => {
  const testRoot = path.resolve(process.env.TEST_DATA_DIR || ".verification");
  fs.mkdirSync(testRoot, { recursive: true });
  const folder = fs.mkdtempSync(path.join(testRoot, "database-"));
  process.env.DB_PATH = path.join(folder, "registro.sqlite");
  const old = new sqlite3.Database(process.env.DB_PATH);
  const run = (sql, params = []) => new Promise((resolve, reject) => old.run(sql, params, error => error ? reject(error) : resolve()));
  await run(`CREATE TABLE items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, original_title TEXT,
    category TEXT CHECK(category IN ('Película', 'Libro', 'Videojuego')), status TEXT,
    cover_url TEXT, year INTEGER, description TEXT, creator TEXT, genres TEXT,
    source TEXT, external_id TEXT, personal_rating INTEGER, notes TEXT,
    watched_date TEXT, start_date TEXT, finished_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  for (let i = 1; i <= 137; i++) {
    await run("INSERT INTO items (id,title,category,status,cover_url,finished_date,notes) VALUES (?,?,?,?,?,?,?)",
      [i, `Registro ${i}`, "Libro", "finished", "/uploads/mi-portada.png", "01/04/2026", "Nota conservada"]);
  }
  await new Promise((resolve, reject) => old.close(error => error ? reject(error) : resolve()));
  const db = require("../server/database");
  try {
    await db.initDatabase();
    assert.equal((await db.listItems()).length, 137);
    const before = await db.getItem(1);
    assert.equal(before.finished_date, "01/04/2026");
    assert.equal(before.notes, "Nota conservada");
    assert.equal(before.cover_url, "/uploads/mi-portada.png");
    const edited = await db.updateItem(1, { title: "Título editado" });
    assert.equal(edited.finished_date, "2026-04-01");
    assert.equal(edited.cover_url, before.cover_url);
    assert.equal(edited.notes, before.notes);
    for (const category of ["Cómic", "Manga"]) {
      const created = await db.createItem({ title: category, category, status: "pending" });
      assert.equal(created.category, category);
    }
    assert.equal((await db.listItems()).length, 139);
    await db.initDatabase();
    assert.equal((await db.listItems()).length, 139);
    assert.equal(await db.deleteItem(2), true);
    assert.equal((await db.listItems()).length, 138);
    assert.equal((await db.getItem(3)).title, "Registro 3");
  } finally {
    await db.closeDatabase();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

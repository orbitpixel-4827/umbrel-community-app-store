const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, "data", "registro.sqlite");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

const allowedStatuses = new Set(["wishlist", "pending", "active", "finished"]);
const allowedCategories = new Set(["Película", "Libro", "Videojuego", "Cómic", "Manga"]);

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableText(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRating(value) {
  const number = normalizeNumber(value);
  if (number === null) return null;
  return Math.min(5, Math.max(1, Math.round(number)));
}

function normalizeDate(value) {
  const text = normalizeText(value);
  if (!text) return null;
  const legacy = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  const iso = legacy ? `${legacy[3]}-${legacy[2]}-${legacy[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

function normalizeItem(input = {}) {
  const category = normalizeText(input.category) || "Película";
  const status = normalizeText(input.status) || "pending";

  if (!allowedCategories.has(category)) {
    const err = new Error("Categoría no permitida.");
    err.statusCode = 400;
    throw err;
  }

  if (!allowedStatuses.has(status)) {
    const err = new Error("Estado no permitido.");
    err.statusCode = 400;
    throw err;
  }

  const title = normalizeText(input.title);
  if (!title) {
    const err = new Error("El título es obligatorio.");
    err.statusCode = 400;
    throw err;
  }

  return {
    title,
    original_title: normalizeNullableText(input.original_title),
    category,
    status,
    cover_url: normalizeNullableText(input.cover_url),
    year: normalizeNumber(input.year),
    description: normalizeNullableText(input.description),
    creator: normalizeNullableText(input.creator),
    genres: Array.isArray(input.genres) ? input.genres.join(", ") : normalizeNullableText(input.genres),
    source: normalizeNullableText(input.source),
    external_id: normalizeNullableText(input.external_id),
    personal_rating: normalizeRating(input.personal_rating),
    notes: normalizeNullableText(input.notes),
    watched_date: normalizeDate(input.watched_date),
    start_date: normalizeDate(input.start_date),
    finished_date: normalizeDate(input.finished_date)
  };
}

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) reject(error);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) reject(error);
      else resolve(rows);
    });
  });
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    year: row.year === null ? null : Number(row.year),
    personal_rating: row.personal_rating === null ? null : Number(row.personal_rating)
  };
}

async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      original_title TEXT,
      category TEXT NOT NULL CHECK(category IN ('Película', 'Libro', 'Videojuego', 'Cómic', 'Manga')),
      status TEXT NOT NULL CHECK(status IN ('wishlist', 'pending', 'active', 'finished')),
      cover_url TEXT,
      year INTEGER,
      description TEXT,
      creator TEXT,
      genres TEXT,
      source TEXT,
      external_id TEXT,
      personal_rating INTEGER CHECK(personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5),
      notes TEXT,
      watched_date TEXT,
      start_date TEXT,
      finished_date TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await migrateCategoryConstraint();

  await run("CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)");
  await run("CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)");
  await run("CREATE INDEX IF NOT EXISTS idx_items_finished_date ON items(finished_date)");
}

async function migrateCategoryConstraint() {
  const schema = await get("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'");
  if (!schema?.sql || (schema.sql.includes("'Cómic'") && schema.sql.includes("'Manga'"))) return;

  await run("BEGIN TRANSACTION");
  try {
    await run(`
      CREATE TABLE items_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        original_title TEXT,
        category TEXT NOT NULL CHECK(category IN ('Película', 'Libro', 'Videojuego', 'Cómic', 'Manga')),
        status TEXT NOT NULL CHECK(status IN ('wishlist', 'pending', 'active', 'finished')),
        cover_url TEXT,
        year INTEGER,
        description TEXT,
        creator TEXT,
        genres TEXT,
        source TEXT,
        external_id TEXT,
        personal_rating INTEGER CHECK(personal_rating IS NULL OR personal_rating BETWEEN 1 AND 5),
        notes TEXT,
        watched_date TEXT,
        start_date TEXT,
        finished_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await run(`
      INSERT INTO items_new (
        id, title, original_title, category, status, cover_url, year, description, creator,
        genres, source, external_id, personal_rating, notes, watched_date, start_date,
        finished_date, created_at, updated_at
      )
      SELECT
        id, title, original_title, category, status, cover_url, year, description, creator,
        genres, source, external_id, personal_rating, notes, watched_date, start_date,
        finished_date, created_at, updated_at
      FROM items
    `);

    await run("DROP TABLE items");
    await run("ALTER TABLE items_new RENAME TO items");
    await run("COMMIT");
  } catch (error) {
    await run("ROLLBACK");
    throw error;
  }
}

async function listItems() {
  const rows = await all("SELECT * FROM items");
  return rows.map(mapRow);
}

async function getItem(id) {
  return mapRow(await get("SELECT * FROM items WHERE id = ?", [id]));
}

async function createItem(input) {
  const item = normalizeItem(input);
  const result = await run(
    `INSERT INTO items (
      title, original_title, category, status, cover_url, year, description, creator,
      genres, source, external_id, personal_rating, notes, watched_date, start_date, finished_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      item.title,
      item.original_title,
      item.category,
      item.status,
      item.cover_url,
      item.year,
      item.description,
      item.creator,
      item.genres,
      item.source,
      item.external_id,
      item.personal_rating,
      item.notes,
      item.watched_date,
      item.start_date,
      item.finished_date
    ]
  );
  return getItem(result.lastID);
}

async function updateItem(id, input) {
  const existing = await getItem(id);
  if (!existing) return null;
  const item = normalizeItem({ ...existing, ...input });
  await run(
    `UPDATE items SET
      title = ?, original_title = ?, category = ?, status = ?, cover_url = ?, year = ?,
      description = ?, creator = ?, genres = ?, source = ?, external_id = ?,
      personal_rating = ?, notes = ?, watched_date = ?, start_date = ?, finished_date = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      item.title,
      item.original_title,
      item.category,
      item.status,
      item.cover_url,
      item.year,
      item.description,
      item.creator,
      item.genres,
      item.source,
      item.external_id,
      item.personal_rating,
      item.notes,
      item.watched_date,
      item.start_date,
      item.finished_date,
      id
    ]
  );
  return getItem(id);
}

async function deleteItem(id) {
  const result = await run("DELETE FROM items WHERE id = ?", [id]);
  return result.changes > 0;
}

module.exports = {
  initDatabase,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  closeDatabase: () => new Promise((resolve, reject) => db.close((error) => error ? reject(error) : resolve())),
  dbPath
};

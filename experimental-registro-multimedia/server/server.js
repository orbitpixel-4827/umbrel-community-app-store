const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const multer = require("multer");
const {
  initDatabase,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  dbPath
} = require("./database");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "..", "public");
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowedMime = ["image/jpeg", "image/png", "image/webp"];
    const allowedExt = [".jpg", ".jpeg", ".png", ".webp"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedMime.includes(file.mimetype) && allowedExt.includes(ext)) cb(null, true);
    else cb(new Error("Solo se permiten imágenes jpg, jpeg, png o webp."));
  }
});

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir, { maxAge: "7d" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, database: dbPath });
});

app.get("/api/config", (_req, res) => {
  res.json({
    tmdbApiKey: process.env.TMDB_API_KEY || "",
    rawgApiKey: process.env.RAWG_API_KEY || "",
    googleBooksApiKey: process.env.GOOGLE_BOOKS_API_KEY || ""
  });
});

function stripHtml(value = "") {
  return String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeYear(value) {
  const year = String(value || "").slice(0, 4);
  return /^\d{4}$/.test(year) ? Number(year) : null;
}

app.get("/api/search/comics", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    const apiKey = process.env.COMICVINE_API_KEY || "";
    if (!query) return res.json({ items: [], warnings: [] });
    if (!apiKey) {
      return res.json({
        items: [],
        warnings: ["Configura COMICVINE_API_KEY para buscar cómics en Comic Vine."]
      });
    }

    const url = new URL("https://comicvine.gamespot.com/api/search/");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("resources", "volume");
    url.searchParams.set("query", query);
    url.searchParams.set("limit", "12");
    url.searchParams.set("field_list", "id,name,deck,description,image,start_year,publisher");

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "RegistroMultimediaUmbrel/1.0"
      }
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[Registro multimedia] Error Comic Vine", response.status, errorText);
      return res.json({ items: [], warnings: ["Comic Vine no respondió correctamente. Revisa la API key."] });
    }

    const data = await response.json();
    const items = (data.results || []).map((comic) => ({
      title: comic.name || "",
      original_title: comic.name || "",
      category: "Cómic",
      status: "pending",
      cover_url: comic.image?.super_url || comic.image?.original_url || comic.image?.small_url || "",
      year: normalizeYear(comic.start_year),
      description: stripHtml(comic.deck || comic.description || ""),
      creator: comic.publisher?.name || "",
      genres: "",
      source: "comicvine",
      external_id: comic.id ? String(comic.id) : ""
    }));

    return res.json({ items, warnings: [] });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/search/manga", async (req, res, next) => {
  try {
    const queryText = String(req.query.q || "").trim();
    if (!queryText) return res.json({ items: [], warnings: [] });

    const gql = `
      query ($search: String!) {
        Page(page: 1, perPage: 12) {
          media(search: $search, type: MANGA, isAdult: false) {
            id
            title {
              romaji
              english
              native
            }
            coverImage {
              large
            }
            startDate {
              year
            }
            description(asHtml: false)
            genres
            format
          }
        }
      }
    `;

    const response = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: gql, variables: { search: queryText } })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error("[Registro multimedia] Error AniList", response.status, errorText);
      return res.json({ items: [], warnings: ["AniList no respondió correctamente."] });
    }

    const data = await response.json();
    const items = (data.data?.Page?.media || []).map((manga) => ({
      title: manga.title?.english || manga.title?.romaji || manga.title?.native || "",
      original_title: manga.title?.romaji || manga.title?.native || "",
      category: "Manga",
      status: "pending",
      cover_url: manga.coverImage?.large || "",
      year: manga.startDate?.year || null,
      description: stripHtml(manga.description || ""),
      creator: "AniList",
      genres: Array.isArray(manga.genres) ? manga.genres.join(", ") : "",
      source: "anilist",
      external_id: manga.id ? String(manga.id) : ""
    }));

    return res.json({ items, warnings: [] });
  } catch (error) {
    return next(error);
  }
});

app.get("/api/items", async (_req, res, next) => {
  try {
    res.json(await listItems());
  } catch (error) {
    next(error);
  }
});

app.get("/api/items/:id", async (req, res, next) => {
  try {
    const item = await getItem(req.params.id);
    if (!item) return res.status(404).json({ error: "Registro no encontrado." });
    return res.json(item);
  } catch (error) {
    return next(error);
  }
});

app.post("/api/items", async (req, res, next) => {
  try {
    const item = await createItem(req.body);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

app.put("/api/items/:id", async (req, res, next) => {
  try {
    const item = await updateItem(req.params.id, req.body);
    if (!item) return res.status(404).json({ error: "Registro no encontrado." });
    return res.json(item);
  } catch (error) {
    return next(error);
  }
});

app.delete("/api/items/:id", async (req, res, next) => {
  try {
    const deleted = await deleteItem(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Registro no encontrado." });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

app.post("/api/uploads/cover", (req, res, next) => {
  upload.single("cover")(req, res, (error) => {
    if (error) return next(error);
    if (!req.file) return res.status(400).json({ error: "No se recibió ningún archivo." });
    return res.status(201).json({ cover_url: `/uploads/${req.file.filename}` });
  });
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint no encontrado." });
});

app.use(express.static(publicDir));
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = error.statusCode || (error.code === "LIMIT_FILE_SIZE" ? 413 : 500);
  const message = status === 500 ? "Error interno del servidor." : error.message;
  if (status === 500) console.error(error);
  res.status(status).json({ error: message });
});

initDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Registro multimedia listo en puerto ${port}`);
    });
  })
  .catch((error) => {
    console.error("No se pudo inicializar la base de datos", error);
    process.exit(1);
  });

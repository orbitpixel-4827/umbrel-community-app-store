import cors from "cors";
import express from "express";
import morgan from "morgan";
import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { db, getSetting, migrate, rowCount, setSetting } from "./db.js";
import { refreshImageCache, syncLastfm, syncProgress, testLastfmConnection, validateLastfmSettings } from "./lastfm.js";
import { activity, overview, recentPlays, topAlbums, topArtists, topTracks, weeklyActivity, wrapped } from "./stats.js";
import { albumDetail, artistDetail, globalSearch, trackDetail } from "./search.js";

migrate();

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(config.frontendDistPath || path.join(__dirname, "../../frontend/dist"));
const frontendIndex = path.join(frontendDist, "index.html");

app.use(cors());
app.use(express.json());
app.use(morgan("tiny"));
app.use("/cache", express.static(config.imageCacheDir));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "music-stats" });
});

app.get("/api/dashboard", (req, res) => {
  const period = req.query.period || "month";
  res.json({
    overview: overview(period),
    topTracks: topTracks(period, 10),
    topArtists: topArtists(period, 10),
    topAlbums: topAlbums(period, 10),
    recent: recentPlays(20),
    activity: activity(period),
    weeklyActivity: weeklyActivity(period)
  });
});

app.get("/api/stats", (req, res) => {
  const period = req.query.period || "3m";
  const base = overview(period);
  res.json({
    overview: {
      ...base,
      averageDailyPlays: base.activeDays ? Math.round(base.totalPlays / base.activeDays) : 0
    },
    tracks: topTracks(period, 50),
    artists: topArtists(period, 50),
    albums: topAlbums(period, 50),
    trends: {
      growingArtists: topArtists(period, 10),
      repeatedTracks: topTracks(period, 10),
      repeatedAlbums: topAlbums(period, 10)
    },
    activity: activity(period)
  });
});

app.get("/api/wrapped", (req, res) => {
  res.json(wrapped(req.query.period || "year"));
});

app.get("/api/search", (req, res) => {
  res.json(globalSearch(String(req.query.q || "")));
});

app.get("/api/tracks/:id", (req, res) => {
  const detail = trackDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Canción no encontrada" });
  return res.json(detail);
});

app.get("/api/artists/:id", (req, res) => {
  const detail = artistDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Artista no encontrado" });
  return res.json(detail);
});

app.get("/api/albums/:id", (req, res) => {
  const detail = albumDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Álbum no encontrado" });
  return res.json(detail);
});

app.get("/api/admin/status", (_req, res) => {
  const sync = db.prepare("SELECT * FROM sync_state WHERE id = 1").get();
  const username = getSetting("LASTFM_USERNAME", config.lastfmUsername);
  const validation = validateLastfmSettings();
  const remoteTotal = Number(getSetting("LASTFM_TOTAL_SCROBBLES", "0") || 0);
  const fullSyncCompletedAt = getSetting("LASTFM_FULL_SYNC_COMPLETED_AT", "");
  const localPlays = rowCount("plays");
  res.json({
    lastfmUsername: username,
    hasLastfmApiKey: validation.hasApiKey,
    hasLastfmApiSecret: validation.hasApiSecret,
    lastfm: validation,
    sync,
    syncProgress,
    history: {
      localPlays,
      remoteTotal,
      fullSyncCompletedAt,
      complete: Boolean(fullSyncCompletedAt) && (!remoteTotal || localPlays >= remoteTotal * 0.98)
    },
    counts: {
      artists: rowCount("artists"),
      albums: rowCount("albums"),
      tracks: rowCount("tracks"),
      plays: localPlays
    }
  });
});

app.put("/api/admin/settings", (req, res) => {
  const username = String(req.body.lastfmUsername || "").trim();
  const apiKey = String(req.body.lastfmApiKey || "").trim();
  const apiSecret = String(req.body.lastfmApiSecret || "").trim();
  const isMaskedValue = (value) => {
    const cleanValue = value.toLowerCase();
    return cleanValue === "[redacted]" || cleanValue.startsWith("<hidden") || cleanValue === "ya configurada" || cleanValue === "ya configurado";
  };
  if (isMaskedValue(apiKey) || isMaskedValue(apiSecret)) {
    return res.status(400).json({ error: "La app está usando un valor enmascarado, vuelve a guardar la API Key real." });
  }
  setSetting("LASTFM_USERNAME", username);
  if (apiKey && !isMaskedValue(apiKey)) setSetting("LASTFM_API_KEY", apiKey);
  if (apiSecret && !isMaskedValue(apiSecret)) setSetting("LASTFM_API_SECRET", apiSecret);
  res.json({ ok: true });
});

app.post("/api/admin/lastfm/test", async (_req, res) => {
  try {
    const result = await testLastfmConnection();
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      ok: false,
      error: error.message,
      details: error.details || null
    });
  }
});

app.post("/api/admin/sync", async (_req, res) => {
  try {
    const validation = validateLastfmSettings();
    if (!validation.ok) {
      const message = `No se puede sincronizar Last.fm: ${validation.errors.join(" ")}`;
      db.prepare("UPDATE sync_state SET last_sync_at = ?, last_error = ? WHERE id = 1").run(new Date().toISOString(), message);
      return res.status(400).json({ error: message });
    }
    const result = await syncLastfm({ mode: "recent" });
    await refreshImageCache();
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

app.post("/api/admin/sync-full", async (_req, res) => {
  try {
    const validation = validateLastfmSettings();
    if (!validation.ok) {
      const message = `No se puede sincronizar Last.fm: ${validation.errors.join(" ")}`;
      db.prepare("UPDATE sync_state SET last_sync_at = ?, last_error = ? WHERE id = 1").run(new Date().toISOString(), message);
      return res.status(400).json({ error: message });
    }
    if (syncProgress.running) {
      return res.status(409).json({ error: "Ya hay una sincronización en curso.", progress: syncProgress });
    }

    syncLastfm({ mode: "full" })
      .then(() => refreshImageCache())
      .catch((error) => console.error(`[sync-full] ${error.message}`));

    res.json({ started: true, progress: syncProgress });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message,
      details: error.details || null
    });
  }
});

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Ruta API no encontrada" });
});

if (process.env.NODE_ENV === "production") {
  if (!fs.existsSync(frontendIndex)) {
    console.error(`[startup] No existe el build del frontend en ${frontendIndex}`);
  }
  app.use(express.static(frontendDist));
  app.get("*", (_req, res) => {
    if (!fs.existsSync(frontendIndex)) {
      return res.status(500).send(`Frontend no encontrado. Se esperaba index.html en ${frontendIndex}`);
    }
    return res.sendFile(frontendIndex);
  });
}

const cronExpression = `*/${Math.max(1, config.syncIntervalMinutes)} * * * *`;
cron.schedule(cronExpression, async () => {
  try {
    const validation = validateLastfmSettings();
    if (!validation.ok) {
      const message = `Sincronización omitida: ${validation.errors.join(" ")}`;
      db.prepare("UPDATE sync_state SET last_sync_at = ?, last_error = ? WHERE id = 1").run(new Date().toISOString(), message);
      console.error(`[sync] ${message}`);
      return;
    }
    await syncLastfm({ mode: "recent" });
    await refreshImageCache();
  } catch (error) {
    console.error(`[sync] ${error.message}`);
  }
});

app.listen(config.port, () => {
  console.log(`Music Stats API escuchando en puerto ${config.port}`);
});

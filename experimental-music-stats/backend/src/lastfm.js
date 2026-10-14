import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, getSetting, setSetting } from "./db.js";
import { config } from "./config.js";

const LASTFM_API = "https://ws.audioscrobbler.com/2.0/";

export const syncProgress = {
  running: false,
  mode: "idle",
  page: 0,
  totalPages: 0,
  imported: 0,
  skipped: 0,
  startedAt: null,
  finishedAt: null,
  error: null
};

class LastfmError extends Error {
  constructor(message, status = 500, details = {}) {
    super(message);
    this.name = "LastfmError";
    this.status = status;
    this.details = details;
  }
}

function normalizeName(value, fallback = "Desconocido") {
  return String(value || fallback).trim() || fallback;
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && typeof value["#text"] === "string") return value["#text"].trim();
  return "";
}

function stableUid(...parts) {
  return crypto.createHash("sha1").update(parts.join("|").toLowerCase()).digest("hex");
}

function largestImage(images = []) {
  if (!Array.isArray(images)) return null;
  const found = [...images].reverse().find((image) => image?.["#text"]);
  return found?.["#text"] || null;
}

function isNowPlaying(track) {
  return track?.["@attr"]?.nowplaying === "true";
}

function safeTrackId(track, artistName, albumName, trackName) {
  const candidate = textValue(track?.id) || textValue(track?.mbid) || textValue(track?.url);
  if (candidate) return candidate;
  return stableUid("lastfm-track", artistName, albumName || "Sin álbum", trackName);
}

function normalizeScrobble(track) {
  if (!track || typeof track !== "object") {
    return { ok: false, reason: "track vacío o inválido" };
  }

  if (isNowPlaying(track)) {
    return { ok: false, reason: "now playing sin fecha definitiva" };
  }

  const artistName = textValue(track.artist);
  const albumName = textValue(track.album);
  const trackName = textValue(track.name);
  const playedAtUnix = Number(track.date?.uts);

  if (!artistName || !albumName || !trackName || !track.date || !Number.isFinite(playedAtUnix)) {
    return { ok: false, reason: "scrobble incompleto" };
  }

  const playedAt = new Date(playedAtUnix * 1000).toISOString();
  if (Number.isNaN(new Date(playedAt).getTime())) {
    return { ok: false, reason: "fecha inválida" };
  }

  return {
    ok: true,
    artistName,
    albumName,
    trackName,
    playedAt,
    imageUrl: largestImage(track.image),
    durationSeconds: Number(track.duration || 0) || config.defaultTrackDurationSeconds,
    externalUid: safeTrackId(track, artistName, albumName, trackName)
  };
}

function isMaskedCredential(value) {
  const cleanValue = String(value || "").trim().toLowerCase();
  return cleanValue === "[redacted]" || cleanValue.startsWith("<hidden") || cleanValue === "ya configurada" || cleanValue === "ya configurado";
}

function cleanCredential(value) {
  const cleanValue = String(value || "").trim();
  return isMaskedCredential(cleanValue) ? "" : cleanValue;
}

function getLastfmCredentials() {
  const rawUsername = getSetting("LASTFM_USERNAME", config.lastfmUsername);
  const rawApiKey = getSetting("LASTFM_API_KEY", config.lastfmApiKey);
  const rawApiSecret = getSetting("LASTFM_API_SECRET", config.lastfmApiSecret);
  return {
    username: cleanCredential(rawUsername),
    apiKey: cleanCredential(rawApiKey),
    apiSecret: cleanCredential(rawApiSecret),
    apiKeyMasked: isMaskedCredential(rawApiKey),
    apiSecretMasked: isMaskedCredential(rawApiSecret)
  };
}

function buildLastfmUrl(params, apiKey) {
  const orderedEntries = [
    ["method", params.method],
    ["user", params.user],
    ["api_key", apiKey],
    ["format", "json"],
    ...Object.entries(params).filter(([key]) => !["method", "user", "api_key", "format"].includes(key))
  ].filter(([, value]) => value !== undefined && value !== null && value !== "");

  const query = orderedEntries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return new URL(`${LASTFM_API}?${query}`);
}

function requestForDisplay(url, apiKey) {
  const safeUrl = new URL(url);
  return {
    url: `${safeUrl.origin}${safeUrl.pathname}`,
    method: safeUrl.searchParams.get("method"),
    user: safeUrl.searchParams.get("user"),
    format: safeUrl.searchParams.get("format"),
    hasApiKey: Boolean(apiKey),
    apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : ""
  };
}

function logLastfmRequest({ username, apiKey, url, status, body }) {
  console.log("[lastfm] request", {
    user: username,
    hasApiKey: Boolean(apiKey),
    apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : "",
    request: requestForDisplay(url, apiKey),
    status,
    body
  });
}

function parseLastfmBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callLastfm(params, options = {}) {
  const { username, apiKey, apiKeyMasked } = getLastfmCredentials();
  if (apiKeyMasked) {
    throw new LastfmError("La app está usando un valor enmascarado, vuelve a guardar la API Key real.", 400);
  }
  if (!apiKey) {
    throw new LastfmError("Last.fm no está configurado: falta LASTFM_API_KEY.", 400);
  }

  const url = buildLastfmUrl(params, apiKey);
  const response = await fetch(url);
  const text = await response.text();
  const body = parseLastfmBody(text);

  logLastfmRequest({
    username: params.user || username,
    apiKey,
    url,
    status: response.status,
    body
  });

  if (options.returnRaw) {
    return {
      ok: response.ok && !body?.error,
      status: response.status,
      request: requestForDisplay(url, apiKey),
      apiKeyPrefix: apiKey.slice(0, 6),
      hasApiKey: true,
      body
    };
  }

  if (!response.ok || body?.error) {
    const message = body?.message || (typeof body === "string" && body) || `Last.fm respondió ${response.status}.`;
    throw new LastfmError(message, response.status || 502, {
      request: requestForDisplay(url, apiKey),
      apiKeyPrefix: apiKey.slice(0, 6),
      hasApiKey: true,
      lastfmStatus: response.status,
      lastfmBody: body
    });
  }

  return body;
}

function upsertArtist(name, imageUrl = null) {
  const cleanName = normalizeName(name);
  db.prepare("INSERT OR IGNORE INTO artists (name) VALUES (?)").run(cleanName);
  if (imageUrl) {
    db.prepare(`
      UPDATE artists
      SET image_url = COALESCE(image_url, ?), image_updated_at = COALESCE(image_updated_at, CURRENT_TIMESTAMP)
      WHERE name = ?
    `).run(imageUrl, cleanName);
  }
  return db.prepare("SELECT * FROM artists WHERE name = ?").get(cleanName);
}

function upsertAlbum(artistId, name, coverUrl = null) {
  const cleanName = normalizeName(name, "Sin álbum");
  db.prepare("INSERT OR IGNORE INTO albums (artist_id, name) VALUES (?, ?)").run(artistId, cleanName);
  if (coverUrl) {
    db.prepare(`
      UPDATE albums
      SET cover_url = COALESCE(cover_url, ?), image_updated_at = COALESCE(image_updated_at, CURRENT_TIMESTAMP)
      WHERE artist_id = ? AND name = ?
    `).run(coverUrl, artistId, cleanName);
  }
  return db.prepare("SELECT * FROM albums WHERE artist_id = ? AND name = ?").get(artistId, cleanName);
}

function upsertTrack({ artistId, albumId, name, durationSeconds, externalUid }) {
  const cleanName = normalizeName(name);
  const uid = externalUid || stableUid("lastfm-track", artistId, albumId || "no-album", cleanName);
  db.prepare(`
    INSERT OR IGNORE INTO tracks (artist_id, album_id, name, duration_seconds, external_uid)
    VALUES (?, ?, ?, ?, ?)
  `).run(artistId, albumId, cleanName, durationSeconds || config.defaultTrackDurationSeconds, uid);

  db.prepare(`
    UPDATE tracks
    SET duration_seconds = CASE WHEN duration_seconds = 0 THEN ? ELSE duration_seconds END,
        updated_at = CURRENT_TIMESTAMP
    WHERE external_uid = ?
  `).run(durationSeconds || config.defaultTrackDurationSeconds, uid);

  return db.prepare("SELECT * FROM tracks WHERE external_uid = ?").get(uid);
}

function insertPlay(trackId, playedAt, sourcePlayId) {
  const result = db.prepare(`
    INSERT OR IGNORE INTO plays (track_id, played_at, source, source_play_id)
    VALUES (?, ?, 'lastfm', ?)
  `).run(trackId, playedAt, sourcePlayId);

  if (result.changes) {
    db.prepare("UPDATE tracks SET play_count = play_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(trackId);
  }
  return result.changes;
}

function importScrobbles(tracks) {
  let imported = 0;
  let skipped = 0;

  const importOne = db.transaction((scrobble) => {
    const artist = upsertArtist(scrobble.artistName, scrobble.imageUrl);
    if (!artist?.id) throw new Error(`No se pudo crear artista: ${scrobble.artistName}`);
    const album = upsertAlbum(artist.id, scrobble.albumName, scrobble.imageUrl);
    if (!album?.id) throw new Error(`No se pudo crear álbum: ${scrobble.albumName}`);
    const savedTrack = upsertTrack({
      artistId: artist.id,
      albumId: album.id,
      name: scrobble.trackName,
      durationSeconds: scrobble.durationSeconds,
      externalUid: scrobble.externalUid
    });
    if (!savedTrack?.id) throw new Error(`No se pudo crear canción: ${scrobble.trackName}`);
    const sourcePlayId = stableUid("lastfm-play", scrobble.artistName, scrobble.albumName, scrobble.trackName, scrobble.playedAt);
    return insertPlay(savedTrack.id, scrobble.playedAt, sourcePlayId);
  });

  for (const track of tracks) {
    const scrobble = normalizeScrobble(track);
    if (!scrobble.ok) {
      skipped += 1;
      console.log("[lastfm] scrobble omitido", { reason: scrobble.reason });
      continue;
    }

    try {
      imported += importOne(scrobble);
    } catch (error) {
      skipped += 1;
      console.log("[lastfm] scrobble omitido", {
        reason: error.message,
        artist: scrobble.artistName,
        album: scrobble.albumName,
        track: scrobble.trackName,
        playedAt: scrobble.playedAt
      });
    }
  }

  return { imported, skipped };
}

export async function syncLastfm(options = {}) {
  const mode = options.mode || "recent";
  const isFullSync = mode === "full";
  const { username, apiKey, apiKeyMasked } = getLastfmCredentials();
  if (!username) {
    throw new LastfmError("Last.fm no está configurado: falta LASTFM_USERNAME.", 400);
  }
  if (apiKeyMasked) {
    throw new LastfmError("La app está usando un valor enmascarado, vuelve a guardar la API Key real.", 400);
  }
  if (!apiKey) {
    throw new LastfmError("Last.fm no está configurado: falta LASTFM_API_KEY.", 400);
  }

  const startedAt = new Date().toISOString();
  let imported = 0;
  let skipped = 0;
  let page = 1;
  let totalPages = 1;
  let remoteTotal = 0;
  const latestPlay = db.prepare("SELECT played_at FROM plays ORDER BY played_at DESC LIMIT 1").get();
  const fromUnix = !isFullSync && latestPlay ? Math.max(0, Math.floor(new Date(latestPlay.played_at).getTime() / 1000) - 86400) : undefined;

  syncProgress.running = true;
  syncProgress.mode = mode;
  syncProgress.page = 0;
  syncProgress.totalPages = 0;
  syncProgress.imported = 0;
  syncProgress.skipped = 0;
  syncProgress.startedAt = startedAt;
  syncProgress.finishedAt = null;
  syncProgress.error = null;

  try {
    do {
      const payload = await callLastfm({
        method: "user.getrecenttracks",
        user: username,
        limit: "200",
        page: String(page),
        ...(fromUnix ? { from: String(fromUnix) } : {})
      });

      const recent = payload.recenttracks;
      const tracks = Array.isArray(recent?.track) ? recent.track : [];
      totalPages = Number(recent?.["@attr"]?.totalPages || 1);
      remoteTotal = Number(recent?.["@attr"]?.total || remoteTotal || 0);
      const batch = importScrobbles(tracks);
      imported += batch.imported;
      skipped += batch.skipped;
      syncProgress.page = page;
      syncProgress.totalPages = totalPages;
      syncProgress.imported = imported;
      syncProgress.skipped = skipped;
      console.log("[lastfm] sync progress", { mode, page, totalPages, imported, skipped });
      page += 1;
    } while (page <= totalPages && (isFullSync || page <= 20));

    db.prepare(`
      UPDATE sync_state
      SET last_sync_at = ?, last_success_at = ?, last_error = NULL, imported_total = imported_total + ?
      WHERE id = 1
    `).run(startedAt, new Date().toISOString(), imported);

    if (remoteTotal) setSetting("LASTFM_TOTAL_SCROBBLES", String(remoteTotal));
    if (isFullSync) setSetting("LASTFM_FULL_SYNC_COMPLETED_AT", new Date().toISOString());

    console.log("[lastfm] sync complete", { imported, skipped, syncedAt: startedAt });
    syncProgress.running = false;
    syncProgress.finishedAt = new Date().toISOString();

    return { imported, skipped, remoteTotal, syncedAt: startedAt, mode };
  } catch (error) {
    db.prepare("UPDATE sync_state SET last_sync_at = ?, last_error = ? WHERE id = 1").run(startedAt, error.message);
    syncProgress.running = false;
    syncProgress.finishedAt = new Date().toISOString();
    syncProgress.error = error.message;
    throw error;
  }
}

export function validateLastfmSettings() {
  const { username, apiKey, apiSecret, apiKeyMasked, apiSecretMasked } = getLastfmCredentials();
  const errors = [];
  if (!username) errors.push("Falta LASTFM_USERNAME.");
  if (apiKeyMasked) errors.push("La app está usando un valor enmascarado, vuelve a guardar la API Key real.");
  if (apiSecretMasked) errors.push("La app está usando un valor enmascarado, vuelve a guardar el API Secret real.");
  if (!apiKey && !apiKeyMasked) errors.push("Falta LASTFM_API_KEY.");
  return {
    ok: errors.length === 0,
    errors,
    username,
    hasApiKey: Boolean(apiKey),
    hasApiSecret: Boolean(apiSecret),
    apiKeyPrefix: apiKey ? apiKey.slice(0, 6) : "",
    apiSecretPrefix: apiSecret ? apiSecret.slice(0, 6) : ""
  };
}

export async function testLastfmConnection() {
  const { username, apiKey, apiKeyMasked } = getLastfmCredentials();
  if (!username) {
    throw new LastfmError("Falta LASTFM_USERNAME.", 400);
  }
  if (apiKeyMasked) {
    throw new LastfmError("La app está usando un valor enmascarado, vuelve a guardar la API Key real.", 400);
  }
  if (!apiKey) {
    throw new LastfmError("Falta LASTFM_API_KEY.", 400);
  }

  return callLastfm({
    method: "user.getrecenttracks",
    user: username
  }, { returnRaw: true });
}

export async function refreshImageCache() {
  fs.mkdirSync(config.imageCacheDir, { recursive: true });
  const albums = db.prepare(`
    SELECT id, cover_url FROM albums
    WHERE cover_url IS NOT NULL AND cover_local_path IS NULL
    LIMIT 25
  `).all();

  for (const album of albums) {
    try {
      const response = await fetch(album.cover_url);
      if (!response.ok) continue;
      const ext = response.headers.get("content-type")?.includes("png") ? "png" : "jpg";
      const filename = `album-${album.id}.${ext}`;
      const filepath = path.join(config.imageCacheDir, filename);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(filepath, buffer);
      db.prepare("UPDATE albums SET cover_local_path = ?, image_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(`/cache/${filename}`, album.id);
    } catch {
      // Broken remote images are ignored; the UI falls back to a generated placeholder.
    }
  }
}

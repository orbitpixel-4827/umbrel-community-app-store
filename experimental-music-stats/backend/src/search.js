import { db } from "./db.js";

export function globalSearch(query) {
  const q = `%${query.trim()}%`;
  if (query.trim().length < 2) return { tracks: [], artists: [], albums: [] };

  const tracks = db.prepare(`
    SELECT t.id, t.name, ar.name AS artist, al.name AS album, al.cover_url, al.cover_local_path,
           COUNT(p.id) AS plays
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE t.name LIKE @q OR ar.name LIKE @q OR al.name LIKE @q
    GROUP BY t.id
    ORDER BY plays DESC
    LIMIT 12
  `).all({ q });

  const artists = db.prepare(`
    SELECT ar.id, ar.name, ar.image_url, ar.image_local_path, COUNT(p.id) AS plays
    FROM artists ar
    LEFT JOIN tracks t ON t.artist_id = ar.id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE ar.name LIKE @q
    GROUP BY ar.id
    ORDER BY plays DESC
    LIMIT 12
  `).all({ q });

  const albums = db.prepare(`
    SELECT al.id, al.name, ar.name AS artist, al.cover_url, al.cover_local_path, COUNT(p.id) AS plays
    FROM albums al
    JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN tracks t ON t.album_id = al.id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE al.name LIKE @q OR ar.name LIKE @q
    GROUP BY al.id
    ORDER BY plays DESC
    LIMIT 12
  `).all({ q });

  return { tracks, artists, albums };
}

export function trackDetail(id) {
  const track = db.prepare(`
    SELECT t.id, t.name, t.duration_seconds, t.play_count, ar.name AS artist, al.name AS album,
           al.cover_url, al.cover_local_path, MIN(p.played_at) AS first_played_at, MAX(p.played_at) AS last_played_at
    FROM tracks t
    JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE t.id = ?
    GROUP BY t.id
  `).get(id);

  if (!track) return null;
  const history = db.prepare("SELECT played_at, source FROM plays WHERE track_id = ? ORDER BY played_at DESC LIMIT 200").all(id);
  return { ...track, history };
}

export function artistDetail(id) {
  const artist = db.prepare(`
    SELECT ar.id, ar.name, ar.image_url, ar.image_local_path,
           COUNT(p.id) AS plays, COALESCE(SUM(t.duration_seconds), 0) AS seconds
    FROM artists ar
    LEFT JOIN tracks t ON t.artist_id = ar.id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE ar.id = ?
    GROUP BY ar.id
  `).get(id);

  if (!artist) return null;
  const topAlbums = db.prepare(`
    SELECT al.id, al.name, al.cover_url, al.cover_local_path, COUNT(p.id) AS plays
    FROM albums al
    JOIN tracks t ON t.album_id = al.id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE al.artist_id = ?
    GROUP BY al.id
    ORDER BY plays DESC
    LIMIT 10
  `).all(id);
  const topTracks = db.prepare(`
    SELECT t.id, t.name, al.name AS album, al.cover_url, al.cover_local_path, COUNT(p.id) AS plays
    FROM tracks t
    LEFT JOIN albums al ON al.id = t.album_id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE t.artist_id = ?
    GROUP BY t.id
    ORDER BY plays DESC
    LIMIT 10
  `).all(id);
  const monthly = db.prepare(`
    SELECT STRFTIME('%Y-%m', p.played_at) AS month, COUNT(p.id) AS plays
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    WHERE t.artist_id = ?
    GROUP BY month
    ORDER BY month ASC
  `).all(id);
  return { ...artist, topAlbums, topTracks, monthly };
}

export function albumDetail(id) {
  const album = db.prepare(`
    SELECT al.id, al.name, ar.name AS artist, al.cover_url, al.cover_local_path,
           COUNT(p.id) AS plays, COALESCE(SUM(t.duration_seconds), 0) AS seconds
    FROM albums al
    JOIN artists ar ON ar.id = al.artist_id
    LEFT JOIN tracks t ON t.album_id = al.id
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE al.id = ?
    GROUP BY al.id
  `).get(id);

  if (!album) return null;
  const tracks = db.prepare(`
    SELECT t.id, t.name, COUNT(p.id) AS plays, COALESCE(SUM(t.duration_seconds), 0) AS seconds
    FROM tracks t
    LEFT JOIN plays p ON p.track_id = t.id
    WHERE t.album_id = ?
    GROUP BY t.id
    ORDER BY plays DESC
  `).all(id);
  const monthly = db.prepare(`
    SELECT STRFTIME('%Y-%m', p.played_at) AS month, COUNT(p.id) AS plays
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    WHERE t.album_id = ?
    GROUP BY month
    ORDER BY month ASC
  `).all(id);
  return { ...album, tracks, monthly };
}


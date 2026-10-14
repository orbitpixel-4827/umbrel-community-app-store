import { db } from "./db.js";

export function periodClause(period) {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthsAgo = (months) => {
    const date = new Date(now);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCMonth(date.getUTCMonth() - months);
    return date;
  };
  const periods = {
    month: startOfMonth,
    "3m": monthsAgo(3),
    "6m": monthsAgo(6),
    year: monthsAgo(12),
    all: null
  };
  const start = periods[period] === undefined ? periods.month : periods[period];
  return {
    where: start ? "WHERE p.played_at >= @start" : "",
    params: start ? { start: start.toISOString() } : {}
  };
}

export function overview(period = "month") {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT
      COUNT(p.id) AS totalPlays,
      COUNT(DISTINCT t.id) AS totalTracks,
      COALESCE(SUM(t.duration_seconds), 0) AS totalSeconds,
      COUNT(DISTINCT ar.id) AS uniqueArtists,
      COUNT(DISTINCT al.id) AS uniqueAlbums,
      COUNT(DISTINCT DATE(p.played_at)) AS activeDays
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ${where}
  `).get(params);
}

export function topTracks(period = "month", limit = 50) {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT t.id, t.name, ar.name AS artist, al.name AS album, al.cover_url, al.cover_local_path,
           COUNT(p.id) AS plays, SUM(t.duration_seconds) AS seconds,
           MIN(p.played_at) AS first_played_at, MAX(p.played_at) AS last_played_at
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ${where}
    GROUP BY t.id
    ORDER BY plays DESC, seconds DESC
    LIMIT @limit
  `).all({ ...params, limit });
}

export function topArtists(period = "month", limit = 50) {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT ar.id, ar.name, ar.image_url, ar.image_local_path,
           COUNT(p.id) AS plays, SUM(t.duration_seconds) AS seconds
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    ${where}
    GROUP BY ar.id
    ORDER BY plays DESC, seconds DESC
    LIMIT @limit
  `).all({ ...params, limit });
}

export function topAlbums(period = "month", limit = 50) {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT al.id, al.name, ar.name AS artist, al.cover_url, al.cover_local_path,
           COUNT(p.id) AS plays, SUM(t.duration_seconds) AS seconds
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    JOIN albums al ON al.id = t.album_id
    ${where}
    GROUP BY al.id
    ORDER BY plays DESC, seconds DESC
    LIMIT @limit
  `).all({ ...params, limit });
}

export function recentPlays(limit = 25) {
  return db.prepare(`
    SELECT p.id, p.played_at, t.name AS track, ar.name AS artist, al.name AS album,
           al.cover_url, al.cover_local_path
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    JOIN artists ar ON ar.id = t.artist_id
    LEFT JOIN albums al ON al.id = t.album_id
    ORDER BY p.played_at DESC
    LIMIT ?
  `).all(limit);
}

export function activity(period = "month") {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT DATE(p.played_at) AS day, COUNT(p.id) AS plays, SUM(t.duration_seconds) AS seconds
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    ${where}
    GROUP BY day
    ORDER BY day ASC
  `).all(params);
}

export function weeklyActivity(period = "month") {
  const { where, params } = periodClause(period);
  return db.prepare(`
    SELECT STRFTIME('%Y-W%W', p.played_at) AS week, COUNT(p.id) AS plays, SUM(t.duration_seconds) AS seconds
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    ${where}
    GROUP BY week
    ORDER BY week ASC
  `).all(params);
}

export function wrapped(period = "month") {
  const dayRows = activity(period);
  const byMonth = db.prepare(`
    SELECT STRFTIME('%Y-%m', p.played_at) AS month, COUNT(p.id) AS plays
    FROM plays p
    JOIN tracks t ON t.id = p.track_id
    ${periodClause(period).where}
    GROUP BY month
    ORDER BY plays DESC
    LIMIT 1
  `).get(periodClause(period).params);

  return {
    overview: overview(period),
    numberOneArtist: topArtists(period, 1)[0] || null,
    numberOneTrack: topTracks(period, 1)[0] || null,
    numberOneAlbum: topAlbums(period, 1)[0] || null,
    busiestDay: [...dayRows].sort((a, b) => b.plays - a.plays)[0] || null,
    busiestMonth: byMonth || null,
    topTracks: topTracks(period, 10),
    topArtists: topArtists(period, 10),
    topAlbums: topAlbums(period, 10)
  };
}

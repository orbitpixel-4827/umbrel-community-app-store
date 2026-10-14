import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 3001),
  databasePath: process.env.DATABASE_PATH || "./data/music-stats.sqlite",
  imageCacheDir: process.env.IMAGE_CACHE_DIR || "./data/image-cache",
  frontendDistPath: process.env.FRONTEND_DIST_PATH || "/app/frontend/dist",
  lastfmUsername: process.env.LASTFM_USERNAME || "",
  lastfmApiKey: process.env.LASTFM_API_KEY || "",
  lastfmApiSecret: process.env.LASTFM_API_SECRET || "",
  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES || 30),
  defaultTrackDurationSeconds: Number(process.env.DEFAULT_TRACK_DURATION_SECONDS || 180)
};

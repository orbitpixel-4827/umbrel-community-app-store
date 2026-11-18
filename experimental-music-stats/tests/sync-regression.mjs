import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

process.env.DATABASE_PATH = path.resolve(".cache/sync-regression.sqlite");
process.env.IMAGE_CACHE_DIR = path.resolve(".cache/test-images");
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(process.env.DATABASE_PATH + suffix, { force: true });
const { db, migrate, setSetting, getSetting, rowCount } = await import("../backend/src/db.js");
const { syncLastfm } = await import("../backend/src/lastfm.js");
migrate();
setSetting("LASTFM_USERNAME", "synthetic-listener");
setSetting("LASTFM_API_KEY", "synthetic-api-key-for-local-tests");
const now = Math.floor(Date.now() / 1000);
const track = (name, uts, album = "Synthetic album") => ({ name, artist: { "#text": "Synthetic artist" }, album: { "#text": album }, date: { uts: String(uts) } });
const log = console.log;
console.log = () => {};
let rows = [];
let failPage = 0;
const requests = [];
globalThis.fetch = async url => {
  const params = new URL(url).searchParams;
  assert.equal(params.get("api_key"), "synthetic-api-key-for-local-tests");
  assert.equal(params.has("api_sig"), false);
  const from = Number(params.get("from") || 0);
  const page = Number(params.get("page") || 1);
  requests.push({ from, page });
  if (page === failPage) throw new Error("Synthetic interrupted request");
  const filtered = rows.filter(t => Number(t?.date?.uts) >= from || !t?.date);
  return new Response(JSON.stringify({ recenttracks: { track: filtered.slice((page - 1) * 200, page * 200), "@attr": { totalPages: String(Math.max(1, Math.ceil(filtered.length / 200))), total: String(filtered.length) } } }));
};
const results = [];
async function check(id, task) {
  try { await task(); results.push({ id, passed: true }); }
  catch (error) { results.push({ id, passed: false, error: error.message }); }
}
await check("CR-01 missing album imported once", async () => {
  rows = [track("No album", now - 20, "")];
  assert.equal((await syncLastfm({ mode: "full" })).imported, 1);
  assert.equal((await syncLastfm({ mode: "full" })).imported, 0);
  assert.equal(rowCount("plays"), 1);
  assert.equal(rowCount("albums"), 0);
});
db.exec("DELETE FROM plays; DELETE FROM tracks; DELETE FROM albums; DELETE FROM artists;");
await check("CR-07 empty library does not silently cut initial history", async () => {
  rows = [track("Today", now - 7200), track("Last week", now - 7 * 86400)];
  assert.equal((await syncLastfm({ mode: "recent" })).imported, 2);
  assert.equal(requests.at(-1).from, 0);
});
db.exec("DELETE FROM plays; DELETE FROM tracks; DELETE FROM albums; DELETE FROM artists;");
rows = [track("Anchor", now - 90 * 86400)];
await syncLastfm({ mode: "full" });
await check("CR-02 all 23 recent pages and no duplicates", async () => {
  const historicalTotal = getSetting("LASTFM_TOTAL_SCROBBLES");
  rows = Array.from({ length: 4500 }, (_, index) => track("Catchup", now - index * 600));
  assert.equal((await syncLastfm({ mode: "recent" })).imported, 4500);
  assert.equal(rowCount("plays"), 4501);
  assert.equal((await syncLastfm({ mode: "recent" })).imported, 0);
  assert.equal(getSetting("LASTFM_TOTAL_SCROBBLES"), historicalTotal);
});
await check("CR-02 interrupted window resumes", async () => {
  db.exec("DELETE FROM plays; DELETE FROM tracks; DELETE FROM albums; DELETE FROM artists;");
  rows = [track("Old anchor", now - 90 * 86400)];
  await syncLastfm({ mode: "full" });
  rows = Array.from({ length: 4500 }, (_, index) => track("Retry catchup", now - index * 600));
  failPage = 3;
  await assert.rejects(syncLastfm({ mode: "recent" }), /Synthetic interrupted/);
  const interruptedFrom = requests.at(-1).from;
  failPage = 0;
  await syncLastfm({ mode: "recent" });
  assert.equal(requests.at(-1).from, interruptedFrom);
  assert.equal(rowCount("plays"), 4501);
  assert.equal(getSetting("LASTFM_RECENT_FROM"), "");
});
await check("CR-06 invalid dates and now playing do not break batch", async () => {
  rows = [track("Impossible date", 1e20), { ...track("Now playing", now), "@attr": { nowplaying: "true" } }, track("Still imported", now + 10), null];
  const result = await syncLastfm({ mode: "full" });
  assert.equal(result.imported, 1);
  assert.equal(result.skipped, 3);
});
console.log = log;
log(JSON.stringify(results, null, 2));
await fs.promises.mkdir("artifacts", { recursive: true });
await fs.promises.writeFile(`artifacts/sync-${process.env.BASELINE ? "before" : "after"}.json`, JSON.stringify(results, null, 2));
db.close();
process.exitCode = results.every(r => r.passed) ? 0 : 1;

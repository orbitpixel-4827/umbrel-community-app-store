const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const { chromium } = require("playwright");

async function main() {
  const root = path.resolve(".verification");
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  const categories = ["Película", "Libro", "Videojuego", "Cómic", "Manga"];
  const items = Array.from({ length: 137 }, (_, i) => ({
    id: i + 1, title: i === 0 ? "El señor de los anillos" : `Registro ${i + 1}`,
    category: categories[i % 5], status: "finished", year: 1982,
    finished_date: `${String(i % 28 + 1).padStart(2, "0")}/04/2026`,
    cover_url: "/uploads/prueba.png", notes: "Notas de prueba"
  }));
  items.push({ id: 200, title: "Pokémon", category: "Videojuego", status: "pending" });
  items.push({ id: 201, title: "Una historia por descubrir", category: "Libro", status: "active" });
  items.push({ id: 202, title: "Deseo", category: "Manga", status: "wishlist" });
  let saves = 0;
  let searches = 0;
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api/config") { res.setHeader("Content-Type", "application/json"); return res.end("{}"); }
    if (pathname === "/api/items" && req.method === "GET") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify(items)); }
    if (pathname.startsWith("/api/items") && ["POST", "PUT"].includes(req.method)) {
      let data = "";
      req.on("data", chunk => data += chunk);
      return req.on("end", () => {
        const payload = JSON.parse(data);
        const existing = items.find(i => i.id === Number(pathname.split("/").pop()));
        if (existing) Object.assign(existing, payload);
        else items.push({ ...payload, id: 300 + saves });
        saves++;
        res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(payload));
      });
    }
    if (pathname.startsWith("/api/search/")) { searches++; res.setHeader("Content-Type", "application/json"); return res.end('{"items":[],"warnings":[]}'); }
    let file = path.join(process.cwd(), "public", pathname === "/" ? "index.html" : pathname);
    if (pathname === "/uploads/prueba.png") file = path.join(process.cwd(), "public/icons/icon-192.png");
    if (!file.startsWith(path.join(process.cwd(), "public")) || !fs.existsSync(file)) { res.statusCode = 404; return res.end(); }
    res.setHeader("Content-Type", ({ ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" })[path.extname(file)] || "text/html");
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const context = await chromium.launchPersistentContext(path.join(root, "browser-profile"), {
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    headless: true,
    env: { ...process.env, TMPDIR: path.join(root, "tmp"), XDG_CACHE_HOME: path.join(root, "cache") },
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true
  });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.locator(".card").first().waitFor();
    await page.screenshot({ path: path.join(root, "iphone-home.png"), fullPage: true });
    assert.equal(await page.locator(".nav-item").count(), 5);
    await page.locator('[data-view="library"]').click();
    assert.equal(await page.locator(".card").count(), 50);
    assert.match(await page.locator(".section-header").innerText(), /137 registros/);
    assert.match(await page.locator(".pagination").innerText(), /Página 1 de 3/);
    await page.locator('[data-library-page="next"]').click();
    assert.match(await page.locator(".pagination").innerText(), /Página 2 de 3/);
    await page.locator('[data-search-filter="librarySearch"]').fill("senor");
    assert.equal(await page.locator(".card").count(), 1);
    assert.match(await page.locator(".section-header").innerText(), /1 registros/);
    await page.locator('[data-search-filter="librarySearch"]').fill("");
    assert.match(await page.locator(".pagination").innerText(), /Página 1 de 3/);
    const years = await page.locator('[data-filter="libraryYear"]').innerText();
    assert.ok(years.includes("2026") && !years.includes("1982"));
    const sortedIds = await page.locator(".card").evaluateAll(cards => cards.map(card => Number(card.dataset.openDetail)));
    for (let i = 1; i < sortedIds.length; i++) assert.ok((sortedIds[i - 1] - 1) % 28 >= (sortedIds[i] - 1) % 28);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(root, "iphone-library.png"), fullPage: true });
    await page.locator('[data-open-detail="28"]').click();
    await page.locator('[data-edit="28"]').click();
    assert.equal(await page.locator("#finished_date").inputValue(), "2026-04-28");
    assert.equal(await page.locator("#cover_url").inputValue(), "");
    await page.locator("#notes").fill("Nota editada");
    await page.locator("#save-item-btn").click();
    await page.locator("#item-dialog").waitFor({ state: "hidden" });
    assert.equal(items.find(i => i.id === 28).cover_url, "/uploads/prueba.png");
    await page.locator("#open-add-btn").click();
    await page.locator("#search-category").selectOption("Manga");
    await page.locator("#search-title").fill("Monster");
    assert.equal(searches, 0);
    await page.screenshot({ path: path.join(root, "iphone-search.png") });
    await page.evaluate(() => { ApiServices.search = async () => { window.testSearches = (window.testSearches || 0) + 1; return { items: [], warnings: [] }; }; });
    await page.locator("#search-title").press("Enter");
    await page.locator(".empty").filter({ hasText: "No encontré" }).waitFor();
    assert.equal(await page.evaluate(() => window.testSearches), 1);
    await page.locator("#modal-search-results [data-open-manual]").click();
    assert.equal(await page.locator("#title").inputValue(), "Monster");
    await page.locator("#save-item-btn").click();
    await page.locator("#item-dialog").waitFor({ state: "hidden" });
    await page.locator("#open-add-btn").click();
    await page.locator("#search-form [data-open-manual]").first().click();
    await page.locator("#title").fill("Otro registro");
    await page.screenshot({ path: path.join(root, "iphone-form.png") });
    await page.locator("#save-item-btn").click();
    await page.locator("#item-dialog").waitFor({ state: "hidden" });
    assert.equal(saves, 3);
    await page.locator('[data-view="stats"]').click();
    assert.equal(await page.locator(".stat").count(), 5);
    assert.equal(await page.locator("canvas").count(), 1);
    await page.screenshot({ path: path.join(root, "iphone-stats.png"), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.locator('[data-view="home"]').click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(root, "desktop-home.png"), fullPage: true });
    for (const size of [320, 375, 430]) {
      await page.setViewportSize({ width: size, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `overflow at ${size}`);
    }
    assert.deepEqual(errors, []);
    console.log("UI verificada: 137 registros, paginación, orden, filtros, fechas heredadas, portadas, Enter, guardado consecutivo y vistas 320-1440px.");
  } finally { await context.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exit(1); });

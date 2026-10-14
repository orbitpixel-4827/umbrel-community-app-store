import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, BarChart3, Cog, Gauge, Gift, Search, Sparkles, RefreshCw, X, Save, Plug, Download } from "lucide-react";
import { api } from "./api.js";
import { AreaLine, Cover, MiniBars, SortableTable, StatCard, TopList } from "./components.jsx";
import { formatDate, formatDuration, formatNumber, formatTime } from "./utils.js";

const nav = [
  { id: "dashboard", label: "Inicio", icon: Gauge },
  { id: "stats", label: "Estadísticas", icon: BarChart3 },
  { id: "wrapped", label: "Wrapped", icon: Gift },
  { id: "settings", label: "Ajustes", icon: Cog }
];

const periods = [
  ["3m", "3 meses"],
  ["6m", "6 meses"],
  ["year", "1 año"],
  ["all", "Historial"]
];

const pagePaths = {
  dashboard: "/",
  stats: "/stats",
  wrapped: "/wrapped",
  settings: "/settings"
};

function pageFromPath(pathname) {
  return Object.entries(pagePaths).find(([, path]) => path === pathname)?.[0] || "dashboard";
}

function useApi(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, loading: true }));
    api(path)
      .then((data) => active && setState({ loading: false, data, error: "" }))
      .catch((error) => active && setState({ loading: false, data: null, error: error.message }));
    return () => {
      active = false;
    };
  }, deps);
  return state;
}

function Shell({ page, setPage, children }) {
  const status = useApi("/api/admin/status", [page]);
  const syncError = status.data?.sync?.last_error;
  return (
    <div className="app-shell miestilo">
      <aside>
        <div className="brand">
          <div><Activity size={24} /></div>
          <span>Music Stats</span>
        </div>
        <nav aria-label="Navegación principal">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button aria-current={page === item.id ? "page" : undefined} className={page === item.id ? "active" : ""} key={item.id} onClick={() => setPage(item.id)} title={item.label}>
                <Icon size={22} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main>
        {syncError ? (
          <div className="sync-alert">
            <strong>Error de sincronización Last.fm</strong>
            <span>{syncError}</span>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

function Header({ title, subtitle }) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">Last.fm local</span>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <GlobalSearch />
    </header>
  );
}

function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState(null);
  const result = useApi(`/api/search?q=${encodeURIComponent(query)}`, [query]);
  const groups = result.data || { tracks: [], artists: [], albums: [] };

  async function openDetail(type, id) {
    const path = type === "tracks" ? "tracks" : type === "artists" ? "artists" : "albums";
    setDetail({ loading: true });
    try {
      setDetail(await api(`/api/${path}/${id}`));
    } catch (error) {
      setDetail({ error: error.message });
    }
  }

  return (
    <div className="search-box">
      <Search size={17} />
      <input aria-label="Buscar canciones, artistas y álbumes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar música" />
      {query ? <button className="search-clear" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}><X size={18} /></button> : null}
      {query.length > 1 && !detail ? (
        <div className="search-results">
          {result.loading ? <p role="status">Buscando...</p> : null}
          {result.error ? <p role="alert">{result.error}</p> : null}
          {!result.loading && !result.error && !Object.values(groups).some((items) => items.length) ? <p>Sin resultados</p> : null}
          {["tracks", "artists", "albums"].map((type) => (
            <section key={type}>
              <h3>{type === "tracks" ? "Canciones" : type === "artists" ? "Artistas" : "Álbumes"}</h3>
              {groups[type]?.map((item) => (
                <button key={`${type}-${item.id}`} onClick={() => openDetail(type, item.id)}>
                  <Cover item={item} type={type === "artists" ? "artist" : "album"} />
                  <span>{item.name}</span>
                  <small>{item.artist || `${formatNumber(item.plays)} reps`}</small>
                </button>
              ))}
            </section>
          ))}
        </div>
      ) : null}
      {detail ? <DetailModal detail={detail} onClose={() => setDetail(null)} /> : null}
    </div>
  );
}

function DetailModal({ detail, onClose }) {
  const dialog = useRef(null);
  const close = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    function onKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], input, [tabindex="0"]')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      previousFocus?.focus();
    };
  }, []);
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <article ref={dialog} className="modal miestilo" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={(event) => event.stopPropagation()}>
        <button ref={close} className="close" aria-label="Cerrar detalle" onClick={onClose}><X size={22} /></button>
        {detail.loading ? <h2 id="detail-title" role="status">Cargando detalle...</h2> : detail.error ? <div role="alert"><h2 id="detail-title">No se pudo cargar</h2><p>{detail.error}</p></div> : <>
        <div className="detail-head">
          <Cover item={detail} type={detail.image_url ? "artist" : "album"} />
          <div>
            <h2 id="detail-title">{detail.name}</h2>
            <p>{detail.artist || detail.album || ""}</p>
            <strong>{formatNumber(detail.plays || detail.play_count)} reproducciones</strong>
          </div>
        </div>
        {detail.seconds ? <p>{formatDuration(detail.seconds)} escuchados</p> : null}
        {detail.first_played_at ? <p>Primera escucha: {formatDate(detail.first_played_at)} · Última: {formatDate(detail.last_played_at)}</p> : null}
        {detail.topTracks ? <TopList title="Canciones más escuchadas" items={detail.topTracks} /> : null}
        {detail.topAlbums ? <TopList title="Álbumes más escuchados" items={detail.topAlbums} /> : null}
        {detail.tracks ? <SortableTable columns={[{ key: "name", label: "Canción" }, { key: "plays", label: "Reps" }]} rows={detail.tracks} /> : null}
        {detail.history ? (
          <SortableTable columns={[
            { key: "date", label: "Fecha", sortValue: (row) => row.played_at, render: (row) => formatDate(row.played_at) },
            { key: "time", label: "Hora", sortValue: (row) => row.played_at, render: (row) => formatTime(row.played_at) }
          ]} rows={detail.history} />
        ) : null}
        </>}
      </article>
    </div>, document.body
  );
}

function Dashboard() {
  const { data, loading, error } = useApi("/api/dashboard", []);
  const status = useApi("/api/admin/status", []);
  const needsSetup = status.data?.lastfm && !status.data.lastfm.ok;
  const stats = data?.overview || {
    totalTracks: 0,
    totalPlays: 0,
    totalSeconds: 0,
    uniqueArtists: 0,
    uniqueAlbums: 0
  };
  return (
    <>
      <Header title="Music Stats" subtitle={new Intl.DateTimeFormat("es", { month: "long", year: "numeric" }).format(new Date())} />
      {error ? <VisibleError title="No se pudo cargar el dashboard" message={error} /> : null}
      {status.error ? <VisibleError title="No se pudo leer la configuración" message={status.error} /> : null}
      {needsSetup ? <SetupNotice /> : null}
      {loading ? <Loading compact /> : null}
      <section className="stat-grid">
        <StatCard label="Canciones" value={formatNumber(stats.totalTracks)} />
        <StatCard label="Reproducciones" value={formatNumber(stats.totalPlays)} />
        <StatCard label="Tiempo" value={formatDuration(stats.totalSeconds)} />
        <StatCard label="Artistas" value={formatNumber(stats.uniqueArtists)} />
        <StatCard label="Álbumes" value={formatNumber(stats.uniqueAlbums)} />
      </section>
      <section className="dashboard-grid">
        <TopList title="Top canciones" items={data?.topTracks || []} />
        <TopList title="Top artistas" items={data?.topArtists || []} type="artists" />
        <TopList title="Top álbumes" items={data?.topAlbums || []} type="albums" />
      </section>
      <section className="wide-grid">
        <div className="panel">
          <h2>Actividad por día</h2>
          <MiniBars data={data?.activity || []} />
        </div>
        <div className="panel">
          <h2>Actividad por semana</h2>
          <MiniBars data={data?.weeklyActivity || []} />
        </div>
      </section>
      <section className="wide-grid">
        <div className="panel">
          <h2>Tiempo acumulado</h2>
          <AreaLine data={data?.activity || []} />
        </div>
      </section>
      <section className="panel">
        <h2>Actividad reciente</h2>
        <SortableTable
          rows={data?.recent || []}
          columns={[
            { key: "cover", label: "Portada", render: (row) => <Cover item={row} /> },
            { key: "date", label: "Fecha", sortValue: (row) => row.played_at, render: (row) => formatDate(row.played_at) },
            { key: "time", label: "Hora", sortValue: (row) => row.played_at, render: (row) => formatTime(row.played_at) },
            { key: "track", label: "Canción" },
            { key: "artist", label: "Artista" },
            { key: "album", label: "Álbum" }
          ]}
        />
      </section>
    </>
  );
}

function SetupNotice() {
  return (
    <section className="setup-notice">
      <div>
        <h2>Configura tu cuenta de Last.fm para comenzar</h2>
        <a className="secondary" href="/settings">Configurar Last.fm</a>
      </div>
    </section>
  );
}

function StatsPage() {
  const [period, setPeriod] = useState("3m");
  const { data, loading, error } = useApi(`/api/stats?period=${period}`, [period]);
  const status = useApi("/api/admin/status", []);
  if (loading) return <Loading />;
  if (error) return <Empty message={error} />;
  return (
    <>
      <Header title="Estadísticas" subtitle="Comparativas y tendencias para periodos largos." />
      {status.data?.history && !status.data.history.complete ? (
        <section className="setup-notice">
          <h2>Historial incompleto, ejecuta sincronización completa</h2>
          <p>SQLite tiene {formatNumber(status.data.history.localPlays)} scrobbles{status.data.history.remoteTotal ? ` de ${formatNumber(status.data.history.remoteTotal)} reportados por Last.fm` : ""}.</p>
        </section>
      ) : null}
      <PeriodTabs value={period} onChange={setPeriod} />
      <section className="stat-grid">
        <StatCard label="Tiempo total" value={formatDuration(data.overview.totalSeconds)} />
        <StatCard label="Reproducciones" value={formatNumber(data.overview.totalPlays)} />
        <StatCard label="Promedio diario" value={formatNumber(data.overview.averageDailyPlays)} />
        <StatCard label="Días activos" value={formatNumber(data.overview.activeDays)} />
      </section>
      <section className="dashboard-grid">
        <TopList title="Top 50 canciones" items={data.tracks} />
        <TopList title="Top 50 artistas" items={data.artists} type="artists" />
        <TopList title="Top 50 álbumes" items={data.albums} type="albums" />
      </section>
      <section className="wide-grid">
        <TopList title="Artistas en crecimiento" items={data.trends.growingArtists} type="artists" />
        <TopList title="Canciones más repetidas" items={data.trends.repeatedTracks} />
      </section>
    </>
  );
}

function WrappedPage() {
  const [period, setPeriod] = useState("year");
  const { data, loading, error } = useApi(`/api/wrapped?period=${period}`, [period]);
  if (loading) return <Loading />;
  if (error) return <Empty message={error} />;
  return (
    <>
      <Header title="Wrapped privado" subtitle="Un resumen visual de tu periodo musical sin compartir datos fuera de tu servidor." />
      <PeriodTabs value={period} onChange={setPeriod} />
      <section className="wrapped-hero">
        <Cover item={data.numberOneArtist || {}} type="artist" />
        <Sparkles size={34} />
        <h2>{data.numberOneArtist?.name || "Sin datos todavía"}</h2>
        <p>Tu artista número 1</p>
      </section>
      <section className="wrapped-grid">
        <WrappedCard title="Canción #1" item={data.numberOneTrack} />
        <WrappedCard title="Álbum #1" item={data.numberOneAlbum} />
        <StatCard label="Reproducciones" value={formatNumber(data.overview.totalPlays)} />
        <StatCard label="Tiempo escuchado" value={formatDuration(data.overview.totalSeconds)} />
        <StatCard label="Día más activo" value={data.busiestDay?.day || "-"} sub={`${formatNumber(data.busiestDay?.plays)} reps`} />
        <StatCard label="Mes más activo" value={data.busiestMonth?.month || "-"} sub={`${formatNumber(data.busiestMonth?.plays)} reps`} />
      </section>
      <section className="dashboard-grid">
        <TopList title="Top 10 canciones" items={data.topTracks} />
        <TopList title="Top 10 artistas" items={data.topArtists} type="artists" />
        <TopList title="Top 10 álbumes" items={data.topAlbums} type="albums" />
      </section>
    </>
  );
}

function WrappedCard({ title, item }) {
  return (
    <article className="wrapped-card">
      <Cover item={item || {}} />
      <span>{title}</span>
      <strong>{item?.name || "-"}</strong>
      <small>{item?.artist || `${formatNumber(item?.plays)} reps`}</small>
    </article>
  );
}

function SettingsPage() {
  const [tick, setTick] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [fullSyncing, setFullSyncing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [testResult, setTestResult] = useState(null);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ lastfmUsername: "", lastfmApiKey: "", lastfmApiSecret: "" });
  const { data, loading, error } = useApi("/api/admin/status", [tick]);
  useEffect(() => {
    if (data) setForm((current) => ({ ...current, lastfmUsername: data.lastfmUsername || "" }));
  }, [data]);
  useEffect(() => {
    if (!data?.syncProgress?.running) return undefined;
    const timer = window.setInterval(() => setTick((value) => value + 1), 2500);
    return () => window.clearInterval(timer);
  }, [data?.syncProgress?.running]);
  async function sync() {
    setSyncing(true);
    setActionError("");
    try {
      await api("/api/admin/sync", { method: "POST" });
      setTick((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
      setTick((value) => value + 1);
    } finally {
      setSyncing(false);
    }
  }
  async function testConnection() {
    setTesting(true);
    setActionError("");
    setTestResult(null);
    try {
      const result = await api("/api/admin/lastfm/test", { method: "POST" });
      setTestResult(result);
    } catch (error) {
      setActionError(error.message);
      setTestResult(error.details || { ok: false, error: error.message });
    } finally {
      setTesting(false);
    }
  }
  async function syncFullHistory() {
    setFullSyncing(true);
    setActionError("");
    try {
      await api("/api/admin/sync-full", { method: "POST" });
      setTick((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
      setTick((value) => value + 1);
    } finally {
      setFullSyncing(false);
    }
  }
  async function saveSettings(event) {
    event.preventDefault();
    setActionError("");
    setSaved(false);
    const maskedValues = ["[redacted]", "ya configurada", "ya configurado"];
    const looksMasked = (value) => {
      const cleanValue = String(value || "").trim().toLowerCase();
      return cleanValue.startsWith("<hidden") || maskedValues.includes(cleanValue);
    };
    if (looksMasked(form.lastfmApiKey) || looksMasked(form.lastfmApiSecret)) {
      setActionError("La app está usando un valor enmascarado, vuelve a guardar la API Key real.");
      return;
    }
    try {
      await api("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      setForm((current) => ({ ...current, lastfmApiKey: "", lastfmApiSecret: "" }));
      setSaved(true);
      setTick((value) => value + 1);
    } catch (error) {
      setActionError(error.message);
    }
  }
  if (loading && !data) return <Loading />;
  if (error) return <Empty message={error} />;
  return (
    <>
      <Header title="Configuración" subtitle="Estado de sincronización y datos locales." />
      <section className="settings-grid">
        <div className="panel">
          <h2>Last.fm</h2>
          {actionError ? <div className="inline-error">{actionError}</div> : null}
          {saved ? <p role="status">Configuración guardada</p> : null}
          <form className="settings-form" onSubmit={saveSettings}>
            <label>
              Usuario
              <input value={form.lastfmUsername} onChange={(event) => setForm({ ...form, lastfmUsername: event.target.value })} placeholder="usuario_lastfm" />
            </label>
            <label>
              API Key
              <input value={form.lastfmApiKey} onChange={(event) => setForm({ ...form, lastfmApiKey: event.target.value })} placeholder={data.hasLastfmApiKey ? "Ya configurada" : "Pega tu API key"} />
              {data.lastfm?.apiKeyPrefix ? <small>Cargada: {data.lastfm.apiKeyPrefix}...</small> : null}
            </label>
            <label>
              API Secret
              <input value={form.lastfmApiSecret} onChange={(event) => setForm({ ...form, lastfmApiSecret: event.target.value })} placeholder={data.hasLastfmApiSecret ? "Ya configurado" : "Opcional"} />
              {data.lastfm?.apiSecretPrefix ? <small>Cargado: {data.lastfm.apiSecretPrefix}...</small> : null}
            </label>
            <button className="primary" type="submit"><Save size={20} />Guardar configuración</button>
          </form>
          <button className="primary" onClick={sync} disabled={syncing}>
            <RefreshCw size={17} />
            {syncing ? "Sincronizando" : "Sincronizar ahora"}
          </button>
          <button className="secondary" onClick={testConnection} disabled={testing}>
            <Plug size={20} />
            {testing ? "Probando conexión" : "Probar conexión Last.fm"}
          </button>
          <button className="secondary" onClick={syncFullHistory} disabled={fullSyncing || data.syncProgress?.running}>
            <Download size={20} />
            {data.syncProgress?.running && data.syncProgress.mode === "full" ? "Sincronizando historial" : "Sincronizar historial completo"}
          </button>
          {testResult ? (
            <div className={testResult.ok ? "connection-result ok" : "connection-result error"}>
              <strong>{testResult.ok ? "Conexión correcta" : "Last.fm devolvió un error"}</strong>
              <p>HTTP: {testResult.status || testResult.lastfmStatus || "-"}</p>
              {testResult.request ? <p>Request: {testResult.request.method} · {testResult.request.user} · API Key {testResult.request.apiKeyPrefix}...</p> : null}
              <pre>{JSON.stringify(testResult.body || testResult.lastfmBody || testResult, null, 2)}</pre>
            </div>
          ) : null}
        </div>
        <div className="panel">
          <h2>Base de datos</h2>
          {data.lastfm?.ok ? null : <div className="inline-error">{data.lastfm?.errors?.join(" ")}</div>}
          {data.history && !data.history.complete ? <div className="inline-error">Historial incompleto, ejecuta sincronización completa</div> : null}
          {data.syncProgress?.running ? (
            <div className="connection-result ok">
              <strong>Sincronización en curso</strong>
              <p>Modo: {data.syncProgress.mode}</p>
              <p>Página {formatNumber(data.syncProgress.page)} de {formatNumber(data.syncProgress.totalPages)}</p>
              <p>Importados: {formatNumber(data.syncProgress.imported)} · Omitidos: {formatNumber(data.syncProgress.skipped)}</p>
            </div>
          ) : null}
          <p>Última sincronización: {formatDate(data.sync.last_success_at)} {formatTime(data.sync.last_success_at)}</p>
          <p>Error: {data.sync.last_error || "Sin errores"}</p>
          <p>Scrobbles locales: {formatNumber(data.history?.localPlays)}</p>
          <p>Total Last.fm detectado: {data.history?.remoteTotal ? formatNumber(data.history.remoteTotal) : "Pendiente"}</p>
          <div className="mini-counts">
            {Object.entries(data.counts).map(([key, value]) => <StatCard key={key} label={key} value={formatNumber(value)} />)}
          </div>
        </div>
      </section>
    </>
  );
}

function PeriodTabs({ value, onChange }) {
  return (
    <div className="period-tabs">
      {periods.map(([id, label]) => (
        <button aria-pressed={value === id} className={value === id ? "active" : ""} key={id} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

function Loading({ compact = false }) {
  return <div className={compact ? "loading-strip" : "empty"}>Cargando estadísticas...</div>;
}

function Empty({ message }) {
  return <VisibleError title="Music Stats" message={message} />;
}

function VisibleError({ title, message }) {
  return (
    <section className="visible-error">
      <h1>{title}</h1>
      <p>{message || "Ocurrió un error inesperado."}</p>
    </section>
  );
}

export default function App() {
  const [page, setPageState] = useState(() => pageFromPath(window.location.pathname));
  function setPage(nextPage) {
    setPageState(nextPage);
    window.history.pushState({}, "", pagePaths[nextPage] || "/");
  }

  useEffect(() => {
    const onPopState = () => setPageState(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const content = useMemo(() => {
    if (page === "stats") return <StatsPage />;
    if (page === "wrapped") return <WrappedPage />;
    if (page === "settings") return <SettingsPage />;
    return <Dashboard />;
  }, [page]);

  return <Shell page={page} setPage={setPage}>{content}</Shell>;
}

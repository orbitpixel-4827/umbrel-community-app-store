'use client';

import {
  Activity, Apple as AppleIcon, BarChart3, Bitcoin, Blocks, Building2, CarFront,
  Maximize2, Minimize2, Redo2, List, Download, RefreshCw, Check, ChartNoAxesCombined, ChevronDown, ChevronLeft, ChevronRight, Cpu, Crosshair, Eye, EyeOff,
  LineChart, LocateFixed, Lock, Minus, MousePointer2, Palette, PanelRightClose,
  PanelRightOpen, PanelsTopLeft, Plus, RectangleHorizontal, Search, SlidersHorizontal, Star,
  Trash2, TrendingUp, Type as TypeIcon, Ruler, Undo2, Unlock, X,
} from 'lucide-react';
import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

type Asset = { symbol: string; name: string; price: number; change: number; color: string; category: string; exchange?: string };
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Point = { x: number; y: number };
type DataPoint = { index: number; price: number; time?: number };
type Drawing = { id: number; kind: 'rect' | 'trend' | 'fib' | 'fibext' | 'hline' | 'text'; start: DataPoint; end: DataPoint; third?: DataPoint; color: string; timeframe: string; text?: string; fontSize?: number; opacity?: number; width?: number };
type Tool = 'cursor' | 'trend' | 'rect' | 'fib' | 'fibext' | 'hline' | 'text' | 'ruler';
type Measurement = { start: DataPoint; end: DataPoint; complete: boolean };
type IndicatorStyle = { color: string; opacity: number; width: number };

const INITIAL_ASSETS: Asset[] = [
  { symbol: 'BTCUSD', name: 'Bitcoin / Dólar', price: 0, change: 0, color: '#f7931a', category: 'Cripto', exchange: 'Bitfinex' },
  { symbol: '^GSPC', name: 'S&P 500', price: 0, change: 0, color: '#71e0c4', category: 'Índice' },
  { symbol: '^NDX', name: 'Nasdaq 100', price: 0, change: 0, color: '#7c8cff', category: 'Índice' },
  { symbol: 'AAPL', name: 'Apple', price: 0, change: 0, color: '#d7dde8', category: 'Acción' },
  { symbol: 'NVDA', name: 'NVIDIA', price: 0, change: 0, color: '#8bd450', category: 'Acción' },
  { symbol: 'TSLA', name: 'Tesla', price: 0, change: 0, color: '#e85d75', category: 'Acción' },
  { symbol: 'MSFT', name: 'Microsoft', price: 0, change: 0, color: '#55a8ff', category: 'Acción' },
];

const FALLBACK: Candle[] = Array.from({ length: 120 }, (_, i) => {
  const open = 78000 + i * 280 + ((i * 97) % 2800) - 1400;
  const close = open + ((i * 347) % 3400) - 1600;
  return { time: Date.UTC(2025, 0, 1) + i * 86_400_000, open, close, high: Math.max(open, close) + 900, low: Math.min(open, close) - 800, volume: 100 };
});

const INDICATORS = [
  { id: 'sma20', label: 'SMA 20', color: '#b447da', period: 20 },
  { id: 'sma200', label: 'SMA 200', color: '#ed4d59', period: 200 },
] as const;

const TOOL_ITEMS: { id: Tool; label: string; icon: typeof MousePointer2; color: string }[] = [
  { id: 'cursor', label: 'Mover y seleccionar', icon: MousePointer2, color: '#4bd2dc' },
  { id: 'trend', label: 'Línea de tendencia', icon: TrendingUp, color: '#ffb14a' },
  { id: 'fib', label: 'Retroceso Fibonacci', icon: SlidersHorizontal, color: '#a98cff' },
  { id: 'fibext', label: 'Extensión Fibonacci', icon: LocateFixed, color: '#4bd2dc' },
  { id: 'rect', label: 'Rectángulo', icon: RectangleHorizontal, color: '#4bd2dc' },
  { id: 'hline', label: 'Línea horizontal', icon: Minus, color: '#ffcf5c' },
  { id: 'text', label: 'Texto', icon: TypeIcon, color: '#f1f5f9' },
  { id: 'ruler', label: 'Regla', icon: Ruler, color: '#4bd2dc' },
];

const ASSET_COLORS = ['#f7931a', '#71e0c4', '#7c8cff', '#d7dde8', '#8bd450', '#e85d75', '#55a8ff'];

function formatPrice(value: number, currency = 'USD') {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency, maximumFractionDigits: value < 10 ? 4 : 2 }).format(value);
}

function movingAverage(candles: Candle[], period: number) {
  let sum = 0;
  return candles.map((candle, index) => {
    sum += candle.close;
    if (index >= period) sum -= candles[index - period].close;
    return index >= period - 1 ? sum / period : null;
  });
}

function AssetIcon({ asset, size = 'small' }: { asset: Asset; size?: 'small' | 'medium' | 'large' }) {
  const props = { size: size === 'large' ? 18 : size === 'medium' ? 15 : 13, strokeWidth: 2.2 };
  const Icon = asset.symbol === 'BTCUSD' ? Bitcoin
    : asset.symbol === 'AAPL' ? AppleIcon
    : asset.symbol === 'NVDA' ? Cpu
    : asset.symbol === 'TSLA' ? CarFront
    : asset.symbol === 'MSFT' ? PanelsTopLeft
    : asset.category === 'Índice' ? ChartNoAxesCombined
    : asset.category === 'ETF' ? Blocks
    : asset.category === 'Cripto' ? Activity
    : Building2;
  return <span className={`asset-dot ${size}`} style={{ background: asset.color }}><Icon {...props} /></span>;
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const apply = (next: string) => { if (/^#[0-9a-f]{6}$/i.test(next)) onChange(next); };
  return <span className="color-control"><input aria-label={`${label}: selector de color`} type="color" value={value} onInput={(event) => apply(event.currentTarget.value)} onChange={(event) => apply(event.currentTarget.value)} /><input aria-label={`${label}: código hexadecimal`} className="color-hex" value={draft} maxLength={7} spellCheck={false} onChange={(event) => { setDraft(event.target.value); apply(event.target.value); }} onBlur={() => setDraft(value)} /></span>;
}

export default function Home() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeframe, setTimeframe] = useState('1D');
  const [catalog, setCatalog] = useState<Asset[]>(INITIAL_ASSETS);
  const [favorites, setFavorites] = useState(INITIAL_ASSETS.map((asset) => asset.symbol));
  const [market, setMarket] = useState({ key: '', candles: FALLBACK, price: 0, change: 0, currency: 'USD', exchange: 'Bitfinex', name: 'Bitcoin / Dólar' });
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [indicators, setIndicators] = useState(['sma20', 'sma200']);
  const [indicatorStyles, setIndicatorStyles] = useState<Record<string, IndicatorStyle>>({ sma20: { color: '#b447da', opacity: .92, width: 3.2 }, sma200: { color: '#ed4d59', opacity: .92, width: 3.8 } });
  const [selectedIndicator, setSelectedIndicator] = useState<string | null>('sma20');
  const [showStudies, setShowStudies] = useState(true);
  const [studiesLocked, setStudiesLocked] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
  const [mobileFavoritesOpen, setMobileFavoritesOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [indicatorMenu, setIndicatorMenu] = useState(false);
  const [assetMenu, setAssetMenu] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Asset[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [verticalScale, setVerticalScale] = useState(1);
  const [priceShift, setPriceShift] = useState(0);
  const [spacePanning, setSpacePanning] = useState(false);
  const spaceHeld = useRef(false);
  const chartHovered = useRef(false);
  const [offset, setOffset] = useState(0);
  const [colors, setColors] = useState({ up: '#4bd2dc', down: '#f1f5f9', background: '#07090c' });
  const [drawings, setDrawings] = useState<Record<string, Drawing[]>>({});
  const [draft, setDraft] = useState<Drawing | null>(null);
  const [fibExtStage, setFibExtStage] = useState<0 | 1 | 2>(0);
  const [selectedDrawing, setSelectedDrawing] = useState<number | null>(null);
  const [crosshair, setCrosshair] = useState<Point | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [textPlacement, setTextPlacement] = useState<DataPoint | null>(null);
  const [newText, setNewText] = useState('');
  const [ready, setReady] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [toolsMenu, setToolsMenu] = useState(false);
  const [objectsMenu, setObjectsMenu] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [saveState, setSaveState] = useState('Cargando tu espacio');
  const [retry, setRetry] = useState(0);
  const [saveRetry, setSaveRetry] = useState(0);
  const [searchRetry, setSearchRetry] = useState(0);
  const [searchError, setSearchError] = useState('');
  const [quoteUpdated, setQuoteUpdated] = useState<number | null>(null);
  const [historyUpdated, setHistoryUpdated] = useState<number | null>(null);
  const [quoteError, setQuoteError] = useState(false);
  const [plotSize, setPlotSize] = useState({ width: 1000, height: 620 });
  const canvasRef = useRef<HTMLDivElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const saveRevision = useRef(0);
  const pendingBackup = useRef<Record<string, unknown> | null>(null);
  useEffect(() => { const backup = () => { try { if (pendingBackup.current) localStorage.setItem('mercado-workspace-v2', JSON.stringify(pendingBackup.current)); } catch {} }; window.addEventListener('pagehide',backup); return ()=>window.removeEventListener('pagehide',backup); }, []);
  const undoHistory = useRef<Record<string, { past: Drawing[][]; future: Drawing[][] }>>({});
  const gestureBefore = useRef<Drawing[] | null>(null);
  const dragStart = useRef<{x:number; y:number} | null>(null);
  const styleHistoryTime = useRef(0);
  const [, updateHistory] = useState(0);
  const lastSuccessfulKey = `${symbol}:${timeframe}`;
  const dataReady = market.key === lastSuccessfulKey && market.candles.length > 0 && !loading && !error;
  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) => setPlotSize({ width: Math.max(280, Math.round(entry.contentRect.width)), height: Math.max(180, Math.round(entry.contentRect.height)) }));
    resize.observe(node); return () => resize.disconnect();
  }, []);
  const panRef = useRef<{ x: number; y: number; offset: number; shift: number; pricePerUnit: number } | null>(null);
  const scaleRef = useRef<{ y: number; scale: number } | null>(null);
  const dragRef = useRef<{ id: number; anchor: DataPoint; originalStart: DataPoint; originalEnd: DataPoint; originalThird?: DataPoint } | null>(null);
  const resizeRef = useRef<{ id: number; kind: Drawing['kind']; startClientX: number; initialFontSize: number } | null>(null);
  const requestRef = useRef(0);
  const panelActive = settingsOpen || indicatorMenu || assetMenu || mobileFavoritesOpen || toolsMenu || objectsMenu;
  const closePanels = () => { setSettingsOpen(false); setIndicatorMenu(false); setAssetMenu(false); setMobileFavoritesOpen(false); setToolsMenu(false); setObjectsMenu(false); };
  const openPanel = (panel: 'settings' | 'indicators' | 'assets' | 'favorites' | 'tools' | 'objects') => {
    closePanels();
    if (panel === 'tools') setToolsMenu(!toolsMenu);
    if (panel === 'objects') setObjectsMenu(!objectsMenu);
    if (panel === 'settings') setSettingsOpen(!settingsOpen);
    if (panel === 'indicators') setIndicatorMenu(!indicatorMenu);
    if (panel === 'assets') setAssetMenu(!assetMenu);
    if (panel === 'favorites') setMobileFavoritesOpen(!mobileFavoritesOpen);
  };
  useEffect(() => {
    if (!panelActive) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = document.querySelector<HTMLElement>('[data-app-panel]');
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    focusable()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closePanels(); }
      if (event.key !== 'Tab') return;
      const items = focusable(), first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel?.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel?.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [settingsOpen, indicatorMenu, assetMenu, mobileFavoritesOpen, toolsMenu, objectsMenu, panelActive]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.code !== 'Space' || event.repeat || target?.closest('input,textarea,.compact-inspector,.tool-prompt,[role="dialog"],[contenteditable="true"]')) return;
      if (target?.closest('button,a') && !chartHovered.current) return;
      event.preventDefault(); spaceHeld.current = true; setSpacePanning(true);
    };
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') { spaceHeld.current = false; setSpacePanning(false); } };
    const blur = () => { spaceHeld.current = false; setSpacePanning(false); panRef.current = null; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  const asset = catalog.find((item) => item.symbol === symbol) ?? INITIAL_ASSETS[0];
  const candles = market.candles.length ? market.candles : FALLBACK;
  const drawingKey = `${symbol}:${timeframe}`;
  const frameMs = timeframe === '4H' ? 14_400_000 : timeframe === '1S' ? 604_800_000 : 86_400_000;
  const anchor = (index: number, price: number): DataPoint => {
    index = Math.max(0, Math.round(index));
    const tail = candles.at(-1)!;
    return { index, price, time: candles[index]?.time ?? tail.time + (index - candles.length + 1) * frameMs };
  };
  const resolvePoint = (point: DataPoint): DataPoint => {
    if (!point.time || !dataReady) return point;
    let lo = 0, hi = candles.length - 1;
    if (point.time < candles[0].time) return {...point, index: -Math.ceil((candles[0].time-point.time)/frameMs)};
    if (point.time > candles[hi].time) return { ...point, index: hi + Math.round((point.time - candles[hi].time) / frameMs) };
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (candles[mid].time < point.time) lo = mid + 1; else hi = mid; }
    if (lo && Math.abs(candles[lo - 1].time - point.time) < Math.abs(candles[lo].time - point.time)) lo--;
    return { ...point, index: lo };
  };
  const currentDrawings: Drawing[] = (drawings[drawingKey] ?? []).map(d => ({ ...d, start: resolvePoint(d.start), end: resolvePoint(d.end), third: d.third ? resolvePoint(d.third) : undefined }));
  const remember = (snapshot = currentDrawings, coalesce = false) => {
    const now = Date.now(); if (coalesce && now - styleHistoryTime.current < 600) return;
    styleHistoryTime.current = coalesce ? now : 0;
    const history = undoHistory.current[drawingKey] ??= { past: [], future: [] };
    history.past.push(structuredClone(snapshot)); history.past = history.past.slice(-60); history.future = []; updateHistory(n => n + 1);
  };
  const undo = () => {
    const h = undoHistory.current[drawingKey]; if (!h?.past.length || studiesLocked) return;
    h.future.push(structuredClone(currentDrawings)); const previous = h.past.pop()!;
    setDrawings(all => ({...all, [drawingKey]: previous})); setSelectedDrawing(null); updateHistory(n => n + 1);
  };
  const redo = () => {
    const h = undoHistory.current[drawingKey]; if (!h?.future.length || studiesLocked) return;
    h.past.push(structuredClone(currentDrawings)); const next = h.future.pop()!;
    setDrawings(all => ({...all, [drawingKey]: next})); setSelectedDrawing(null); updateHistory(n => n + 1);
  };
  const cancelOperation = (restoreGesture: unknown = true) => { if (restoreGesture !== false && gestureBefore.current) { const before=gestureBefore.current; setDrawings(all=>({...all,[drawingKey]:before})); } setDraft(null); setFibExtStage(0); setMeasurement(null); setTextPlacement(null); setNewText(''); setActiveTool('cursor'); setSelectedDrawing(null); setEditorOpen(false); panRef.current = null; scaleRef.current = null; dragRef.current = null; resizeRef.current = null; gestureBefore.current = null; };
  useEffect(() => { cancelOperation(false); setCrosshair(null); setVerticalScale(1); setPriceShift(0); setQuoteUpdated(null); setHistoryUpdated(null); }, [symbol, timeframe]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input,textarea,[contenteditable="true"]')) return;
      if (e.key === 'Escape' && !panelActive) { e.preventDefault(); cancelOperation(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if (!studiesLocked && selectedDrawing && e.key === 'Delete') { e.preventDefault(); deleteSelected(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const averages = useMemo(() => ({ sma20: movingAverage(candles, 20), sma200: movingAverage(candles, 200) }), [candles]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 680px)');
    const update = () => setIsCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const response = await fetch('/api/workspace', { cache: 'no-store' });
        const remote = response.ok ? (await response.json()).state : null;
        const local = localStorage.getItem('mercado-workspace-v2');
        const localState = local ? JSON.parse(local) : null;
        const state = (localState?.savedAt ?? 0) > (remote?.savedAt ?? 0) ? localState : remote ?? localState;
        if (state && !cancelled) {
        if (state.symbol) setSymbol(state.symbol);
        if (state.timeframe) setTimeframe(state.timeframe);
        if (state.indicators) setIndicators(state.indicators.filter((id: string) => ['sma20', 'sma200'].includes(id)));
        if (state.indicatorStyles) setIndicatorStyles(state.indicatorStyles);
        if (typeof state.studiesLocked === 'boolean') setStudiesLocked(state.studiesLocked);
        if (state.colors) setColors(state.colors);
        if (state.drawings) setDrawings(state.drawings);
        if (state.favorites) setFavorites(state.favorites);
        if (state.catalog) setCatalog(state.catalog);
        }
      } catch {
        try {
          const local = localStorage.getItem('mercado-workspace-v2');
          if (local && !cancelled) {
            const state = JSON.parse(local);
            if (state.symbol) setSymbol(state.symbol);
            if (state.timeframe) setTimeframe(state.timeframe);
            if (state.indicators) setIndicators(state.indicators.filter((id: string) => ['sma20', 'sma200'].includes(id)));
            if (state.indicatorStyles) setIndicatorStyles(state.indicatorStyles);
            if (typeof state.studiesLocked === 'boolean') setStudiesLocked(state.studiesLocked);
            if (state.colors) setColors(state.colors);
            if (state.drawings) setDrawings(state.drawings);
            if (state.favorites) setFavorites(state.favorites);
            if (state.catalog) setCatalog(state.catalog);
          }
        } catch {}
      } finally { if (!cancelled) setReady(true); }
    };
    void restore();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const revision = ++saveRevision.current;
    setSaveState('Cambios pendientes');
    const snapshot = { schemaVersion: 3, savedAt: Date.now(), symbol, timeframe, indicators, indicatorStyles, studiesLocked, colors, drawings, favorites, catalog };
    pendingBackup.current = snapshot;
    const timer = window.setTimeout(() => {
      const body = JSON.stringify(snapshot);
      let localSaved = false;
      try { localStorage.setItem('mercado-workspace-v2', body); localSaved = true; } catch { setSaveState('No se pudo guardar en este navegador'); }
      saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
        if (revision !== saveRevision.current) return;
        setSaveState('Guardando…');
        try {
          const result = await fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
          if (!result.ok) throw new Error('Error de guardado');
          if (revision === saveRevision.current) setSaveState('Guardado');
        } catch { if (revision === saveRevision.current) setSaveState(localSaved ? 'Solo en este navegador · reintentar' : 'Error de guardado · reintentar'); }
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [symbol, timeframe, indicators, indicatorStyles, studiesLocked, colors, drawings, favorites, catalog, ready, saveRetry]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: Record<string, unknown>, options?: { signal: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Record<string, unknown>) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch {} };
    register({
      name: 'select_market_asset', title: 'Seleccionar activo', description: 'Cambia el activo visible en el gráfico.',
      inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const next = (input as { symbol?: string })?.symbol?.toUpperCase();
        if (!next || !catalog.some((item) => item.symbol === next)) throw new Error('El activo debe estar en el catálogo de la aplicación');
        setSymbol(next); return { selectedSymbol: next };
      },
    });
    register({
      name: 'configure_market_view', title: 'Configurar gráfico', description: 'Cambia el marco temporal y la visibilidad del análisis.',
      inputSchema: { type: 'object', properties: { timeframe: { type: 'string', enum: ['4H', '1D', '1S'] }, showAnalysis: { type: 'boolean' } }, additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const value = input as { timeframe?: string; showAnalysis?: boolean };
        if (value.timeframe && !['4H', '1D', '1S'].includes(value.timeframe)) throw new Error('Marco temporal no válido');
        if (value.timeframe) setTimeframe(value.timeframe);
        if (typeof value.showAnalysis === 'boolean') setShowStudies(value.showAnalysis);
        return { timeframe: value.timeframe ?? timeframe, analysisVisible: value.showAnalysis ?? showStudies };
      },
    });
    return () => lifecycle.abort();
  }, [catalog, showStudies, timeframe]);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = ++requestRef.current;
    const key = `${symbol}:${timeframe}`;
    setLoading(true); setError(''); setOffset(0); setSelectedDrawing(null);
    fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => { if (!response.ok) throw new Error((await response.json()).error ?? 'Datos no disponibles'); return response.json(); })
      .then((data) => {
        if (requestId !== requestRef.current) return;
        if (!data.candles?.length) throw new Error('El proveedor no devolvió velas');
        setMarket({ ...data, key }); setHistoryUpdated(Date.now()); setQuoteUpdated(Date.now());
        setCatalog((items) => {
          const next = { ...asset, name: data.name ?? asset.name, price: data.price, change: data.change, exchange: data.exchange };
          return items.some((item) => item.symbol === symbol) ? items.map((item) => item.symbol === symbol ? next : item) : [...items, next];
        });
      })
      .catch((reason) => { if (reason.name !== 'AbortError' && requestId === requestRef.current) setError(reason.message); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
    return () => controller.abort();
  }, [symbol, timeframe, retry]);

  useEffect(() => {
    const controller = new AbortController(); const key = `${symbol}:${timeframe}`;
    const updateQuote = () => fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&compact=1`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Cotización sin actualizar'); return response.json(); })
      .then(data => {
        if (controller.signal.aborted) return;
        setMarket(current => current.key === key ? { ...current, price: data.price, change: data.change, exchange: data.exchange, currency: data.currency } : current);
        setCatalog(items => items.map(item => item.symbol === symbol ? {...item, price: data.price, change: data.change} : item));
        setQuoteUpdated(Date.now()); setQuoteError(false);
      }).catch(reason => { if (reason.name !== 'AbortError') setQuoteError(true); });
    const timer = window.setInterval(updateQuote, 15_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setSearching(false); setSearchError(''); return; }
    const controller = new AbortController();
    setSearching(true); setSearchError('');
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error('No se pudo consultar el catálogo'); return response.json(); })
        .then((data) => { if (controller.signal.aborted) return; setSearchResults((data.results ?? []).map((item: Asset, index: number) => ({ ...item, price: 0, change: 0, color: ASSET_COLORS[index % ASSET_COLORS.length] }))); })
        .catch(reason => { if (!controller.signal.aborted) { setSearchError(reason.message); setSearchResults([]); } }).finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search, searchRetry]);

  const chart = useMemo(() => {
    const width = plotSize.width;
    const height = plotSize.height;
    const padding = isCompact ? { left: 12, right: 94, top: 28, bottom: 42 } : { left: 20, right: 108, top: 38, bottom: 48 };
    const baseVisibleCount = isCompact ? 38 : 140;
    const visibleCount = Math.min(candles.length, Math.max(isCompact ? 16 : 22, Math.round(baseVisibleCount / zoom)));
    const maxOffset = Math.max(0, candles.length - visibleCount);
    const minOffset = -Math.max(12, Math.round(visibleCount * .9));
    const safeOffset = Math.max(minOffset, Math.min(offset, maxOffset));
    const start = candles.length - visibleCount - safeOffset;
    const end = start + visibleCount;
    const dataStart = Math.max(0, Math.floor(start));
    const dataEnd = Math.min(candles.length, Math.ceil(end));
    const visible = candles.slice(dataStart, dataEnd);
    const studyValues = indicators.flatMap((id) => {
      const series = id === 'sma20' ? averages.sma20 : id === 'sma200' ? averages.sma200 : [];
      return series.slice(dataStart, dataEnd).filter((value): value is number => value !== null);
    });
    const low = Math.min(...visible.map((c) => c.low), ...studyValues), high = Math.max(...visible.map((c) => c.high), ...studyValues);
    const spread = high - low || 1, center = (high + low) / 2 + priceShift, halfRange = spread * .58 / verticalScale;
    const min = center - halfRange, max = center + halfRange;
    const innerW = width - padding.left - padding.right, innerH = height - padding.top - padding.bottom;
    const barW = innerW / visibleCount;
    const x = (index: number) => padding.left + (index - start + .5) * barW;
    const y = (value: number) => padding.top + ((max - value) / (max - min)) * innerH;
    const fromScreen = (point: Point) => ({ index: Math.max(0, Math.min(Math.max(candles.length - 1, Math.ceil(end) - 1), Math.floor(start + (point.x - padding.left) / barW))), price: max - ((point.y - padding.top) / innerH) * (max - min) });
    return { width, height, padding, visible, visibleCount, maxOffset, minOffset, start, end, dataStart, dataEnd, min, max, innerW, innerH, barW, x, y, fromScreen };
  }, [averages, candles, indicators, isCompact, offset, verticalScale, zoom, plotSize, priceShift]);

  function pointFromClient(clientX: number, clientY: number, element: SVGElement) {
    const svg = element instanceof SVGSVGElement ? element : element.closest('svg')!;
    const matrix = svg.getScreenCTM();
    const point = matrix ? new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse()) : new DOMPoint(0, 0);
    return { x: point.x, y: point.y };
  }
  function screenPoint(event: PointerEvent<SVGSVGElement>) { return pointFromClient(event.clientX, event.clientY, event.currentTarget); }
  function anchoredPoint(point: Point) { const p = chart.fromScreen(point); return anchor(p.index, p.price); }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    event.preventDefault();
    if (!dataReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = screenPoint(event);
    setCrosshair(screen);
    const temporaryPan = spaceHeld.current || event.button === 1;
    if (!temporaryPan && screen.x >= chart.width - chart.padding.right) { scaleRef.current = { y: event.clientY, scale: verticalScale }; setSelectedDrawing(null); return; }
    if (activeTool === 'cursor' || temporaryPan) {
      if (measurement?.complete) setMeasurement(null);
      panRef.current = { x: screen.x, y: screen.y, offset, shift: priceShift, pricePerUnit: (chart.max - chart.min) / chart.innerH };
      if (!temporaryPan) { setSelectedDrawing(null); setEditorOpen(false); }
      return;
    }
    const point = anchoredPoint(screenPoint(event));
    const color = TOOL_ITEMS.find((item) => item.id === activeTool)?.color ?? '#4bd2dc';
    if (activeTool === 'hline') {
      remember();
      const line: Drawing = { id: Date.now(), kind: 'hline', start: point, end: anchor(Math.ceil(chart.end) - 1, point.price), color, timeframe, opacity: 1, width: 2 };
      setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), line] }));
      setSelectedDrawing(line.id); setActiveTool('cursor'); return;
    }
    if (activeTool === 'text') {
      setTextPlacement(point); setNewText('');
      setActiveTool('cursor'); return;
    }
    if (activeTool === 'ruler') {
      if (!measurement || measurement.complete) setMeasurement({ start: point, end: point, complete: false });
      else { setMeasurement({ ...measurement, end: point, complete: true }); setActiveTool('cursor'); }
      return;
    }
    if (activeTool === 'fibext') {
      if (!draft || fibExtStage === 0) { setDraft({ id: Date.now(), kind: 'fibext', start: point, end: point, third: point, color, timeframe, opacity: 1, width: 2 }); setFibExtStage(1); }
      else if (fibExtStage === 1) { setDraft({ ...draft, end: point, third: point }); setFibExtStage(2); }
      else {
        remember();
        const completed = { ...draft, third: point };
        setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), completed] }));
        setSelectedDrawing(completed.id); setDraft(null); setFibExtStage(0); setActiveTool('cursor');
      }
      return;
    }
    setDraft({ id: Date.now(), kind: activeTool, start: point, end: point, color, timeframe, opacity: 1, width: activeTool === 'trend' ? 3 : activeTool === 'rect' ? 1.4 : 2 });
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = screenPoint(event);
    setCrosshair(point.x >= chart.padding.left && point.x <= chart.width - chart.padding.right && point.y >= chart.padding.top && point.y <= chart.height - chart.padding.bottom ? point : null);
    if (scaleRef.current) {
      const next = scaleRef.current.scale * Math.exp((scaleRef.current.y - event.clientY) / 180);
      setVerticalScale(Math.max(.25, Math.min(6, next)));
    } else if (panRef.current) {
      const pan = panRef.current;
      const bars = (point.x - pan.x) / chart.barW;
      setOffset(Math.max(chart.minOffset, Math.min(chart.maxOffset, pan.offset + bars)));
      setPriceShift(pan.shift + (point.y - pan.y) * pan.pricePerUnit);
    } else if (resizeRef.current) {
      const resize = resizeRef.current;
      if (resize.kind === 'text') {
        const rect = event.currentTarget.getBoundingClientRect();
        const delta = (event.clientX - resize.startClientX) * chart.width / rect.width;
        setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === resize.id ? { ...drawing, fontSize: Math.max(10, Math.min(72, Math.round(resize.initialFontSize + delta / 5))) } : drawing) }));
      } else {
        const end = anchoredPoint(point);
        setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === resize.id ? resize.kind === 'fibext' ? { ...drawing, third: end } : { ...drawing, end: resize.kind === 'hline' ? anchor(end.index, drawing.start.price) : end } : drawing) }));
      }
    } else if (dragRef.current) {
      if (dragStart.current && Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) < (event.pointerType === 'touch' ? 8 : 4)) return;
      const current = anchoredPoint(point), drag = dragRef.current;
      const indexDelta = current.index - drag.anchor.index, priceDelta = current.price - drag.anchor.price;
      setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === drag.id ? {
        ...drawing,
        start: anchor(drag.originalStart.index + indexDelta, drag.originalStart.price + priceDelta),
        end: anchor(drag.originalEnd.index + indexDelta, drag.originalEnd.price + priceDelta),
        third: drag.originalThird ? anchor(drag.originalThird.index + indexDelta, drag.originalThird.price + priceDelta) : drawing.third,
      } : drawing) }));
    } else if (activeTool === 'fibext' && draft) {
      const current = anchoredPoint(point);
      setDraft(fibExtStage === 1 ? { ...draft, end: current, third: current } : { ...draft, third: current });
    } else if (activeTool === 'ruler' && measurement && !measurement.complete) setMeasurement({ ...measurement, end: anchoredPoint(point) });
    else if (draft) setDraft({ ...draft, end: anchoredPoint(point) });
  }

  function pointerUp() {
    if (panRef.current) { panRef.current = null; return; }
    if (gestureBefore.current && JSON.stringify(gestureBefore.current) !== JSON.stringify(currentDrawings)) remember(gestureBefore.current);
    gestureBefore.current = null; dragStart.current = null;
    panRef.current = null;
    scaleRef.current = null;
    dragRef.current = null;
    resizeRef.current = null;
    if (activeTool === 'fibext' || !draft) return;
    remember();
    setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), draft] }));
    setSelectedDrawing(draft.id); setDraft(null); setActiveTool('cursor');
  }

  function toggleStudiesLock() {
    setStudiesLocked((locked) => {
      const next = !locked;
      if (next) {
        setSelectedDrawing(null);
        setSelectedIndicator(null);
        setActiveTool('cursor');
        setDraft(null);
        setFibExtStage(0);
      }
      return next;
    });
  }

  function chooseAsset(next: Asset, add = false) {
    setCatalog((items) => items.some((item) => item.symbol === next.symbol) ? items : [...items, next]);
    if (add) setFavorites((items) => items.includes(next.symbol) ? items : [...items, next.symbol]);
    setSymbol(next.symbol); setAssetMenu(false); setSearch('');
  }

  function updateSelected(changes: Partial<Drawing>) {
    if (studiesLocked) return; remember(currentDrawings, true);
    setDrawings((all) => ({ ...all, [drawingKey]: currentDrawings.map((drawing) => drawing.id === selectedDrawing ? { ...drawing, ...changes } : drawing) }));
  }

  function deleteSelected() {
    if (studiesLocked) return; remember();
    setDrawings((all) => ({ ...all, [drawingKey]: currentDrawings.filter((drawing) => drawing.id !== selectedDrawing) }));
    setSelectedDrawing(null);
  }

  function addText() {
    const text = newText.trim();
    if (!text || !textPlacement) return;
    remember();
    const label: Drawing = { id: Date.now(), kind: 'text', start: textPlacement, end: textPlacement, color: '#f1f5f9', timeframe, text, fontSize: 18, opacity: 1, width: 2 };
    setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), label] }));
    setSelectedDrawing(label.id); setTextPlacement(null); setNewText('');
  }

  const pathFor = (id: 'sma20' | 'sma200') => {
    const values = averages[id];
    return values.slice(chart.dataStart, chart.dataEnd).flatMap((value, i) => value === null ? [] : [`${i && values[chart.dataStart + i - 1] !== null ? 'L' : 'M'} ${chart.x(chart.dataStart + i).toFixed(1)} ${chart.y(value).toFixed(1)}`]).join(' ');
  };

  const drawingElement = (drawing: Drawing) => {
    const x1 = chart.x(drawing.start.index), x2 = chart.x(drawing.end.index), y1 = chart.y(drawing.start.price), y2 = chart.y(drawing.end.price);
    const width = drawing.width ?? (drawing.kind === 'trend' ? 3 : 2), opacity = drawing.opacity ?? 1;
    const select = (event: PointerEvent<SVGElement>) => {
      if (spaceHeld.current || event.button === 1 || activeTool !== 'cursor' || studiesLocked || !dataReady) return;
      event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      gestureBefore.current = structuredClone(currentDrawings); dragStart.current = {x: event.clientX, y: event.clientY};
      setSelectedDrawing(drawing.id); setActiveTool('cursor');
      dragRef.current = { id: drawing.id, anchor: chart.fromScreen(pointFromClient(event.clientX, event.clientY, event.currentTarget)), originalStart: drawing.start, originalEnd: drawing.end, originalThird: drawing.third };
    };
    const selected = !studiesLocked && drawing.id === selectedDrawing && activeTool === 'cursor';
    const resize = (event: PointerEvent<SVGCircleElement>) => { if (!dataReady || studiesLocked || spaceHeld.current || event.button === 1) return; gestureBefore.current = structuredClone(currentDrawings); event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeRef.current = { id: drawing.id, kind: drawing.kind, startClientX: event.clientX, initialFontSize: drawing.fontSize ?? 18 }; };
    const textW = Math.max(45, (drawing.text?.length ?? 1) * (drawing.fontSize ?? 18) * .62);
    const handleX = drawing.kind === 'text' ? x1 + textW : x2, handleY = drawing.kind === 'hline' ? y1 : drawing.kind === 'text' ? y1 - (drawing.fontSize ?? 18) / 2 : y2;
    const handle = selected ? <circle className="resize-handle" cx={handleX} cy={handleY} r="6" onPointerDown={resize} /> : null;
    if (drawing.kind === 'hline') return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}><line x1={x1} y1={y1} x2={x2} y2={y1} stroke={drawing.color} strokeWidth={width} /><line x1={x1} y1={y1} x2={x2} y2={y1} stroke="transparent" strokeWidth="16" />{handle}</g>;
    if (drawing.kind === 'text') return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}><text x={x1} y={y1} fill={drawing.color} fontSize={drawing.fontSize ?? 18} fontWeight="600">{drawing.text}</text><rect x={x1 - 6} y={y1 - (drawing.fontSize ?? 18)} width={textW} height={(drawing.fontSize ?? 18) + 10} fill="transparent" stroke={selected ? drawing.color : 'transparent'} strokeDasharray="4 3" />{handle}</g>;
    if (drawing.kind === 'rect') return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}><rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx={Math.min(6, Math.abs(x2 - x1) / 4, Math.abs(y2 - y1) / 4)} fill={drawing.color} fillOpacity={selected ? .085 : .045} stroke={drawing.color} strokeOpacity={selected ? 1 : .8} strokeWidth={width} vectorEffect="non-scaling-stroke" /><rect x={Math.min(x1, x2) - 5} y={Math.min(y1, y2) - 5} width={Math.abs(x2 - x1) + 10} height={Math.abs(y2 - y1) + 10} rx="8" fill="transparent" stroke="transparent" strokeWidth="10" />{handle}</g>;
    if (drawing.kind === 'trend') return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={drawing.color} strokeWidth={width} /><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="16" />{handle}</g>;
    if (drawing.kind === 'fibext') {
      const third = drawing.third ?? drawing.end, x3 = chart.x(third.index), y3 = chart.y(third.price);
      const levels = [0, .618, 1, 1.618, 2.618], amplitude = drawing.end.price - drawing.start.price;
      return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}><path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`} fill="none" stroke={drawing.color} strokeWidth={Math.max(1, width * .7)} strokeDasharray="5 5" />{levels.map((level) => { const y = chart.y(third.price + amplitude * level); return <g key={level}><line x1={x3} y1={y} x2={chart.width - chart.padding.right} y2={y} stroke={drawing.color} strokeWidth={width} strokeDasharray={level === 0 || level === 1 ? undefined : '5 5'} /><text x={chart.width - chart.padding.right - 7} y={y - 5} textAnchor="end" fill={drawing.color} fontSize="12">{level}</text></g>; })}{selected && <><circle className="fib-point" cx={x1} cy={y1} r="4" /><circle className="fib-point" cx={x2} cy={y2} r="4" /><circle className="resize-handle" cx={x3} cy={y3} r="6" onPointerDown={resize} /></>}</g>;
    }
    const levels = [0, .236, .382, .5, .618, .786, .886, 1];
    return <g key={drawing.id} onPointerDown={select} className={studiesLocked ? "locked-drawing" : "movable-drawing"} opacity={opacity}>{levels.map((level) => {
      const y = y2 + (y1 - y2) * level;
      return <g key={level}><line x1={x1} y1={y} x2={x2} y2={y} stroke={drawing.color} strokeWidth={width} strokeDasharray={level === 0 || level === 1 ? undefined : '5 5'} /><text x={x2 + 7} y={y - 5} fill={drawing.color} fontSize="12">{level}</text></g>;
    })}<rect x={Math.min(x1, x2)} y={Math.min(y1, y2) - 8} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1) + 16} fill="transparent" stroke="transparent" strokeWidth="12" />{handle}</g>;
  };

  const visibleAssets = search.trim() ? searchResults : favorites.map((id) => catalog.find((item) => item.symbol === id)).filter(Boolean) as Asset[];
  const selected = currentDrawings.find((drawing) => drawing.id === selectedDrawing);
  const SelectedIcon = TOOL_ITEMS.find(item => item.id === selected?.kind)?.icon ?? SlidersHorizontal;
  const selectedLabel = TOOL_ITEMS.find(item => item.id === selected?.kind)?.label ?? 'Dibujo';
  const activeHint = activeTool === 'hline' ? 'Un clic para colocar' : activeTool === 'text' ? 'Toca para escribir' : activeTool === 'fibext' ? ['Punto 1 de 3 · inicio','Punto 2 de 3 · impulso','Punto 3 de 3 · retroceso'][fibExtStage] : activeTool === 'ruler' ? (measurement ? 'Segundo punto · termina' : 'Primer punto · mide') : 'Arrastra entre dos puntos';
  const selectedIndicatorStyle = selectedIndicator ? indicatorStyles[selectedIndicator] : null;
  const last = candles.at(-1)!;
  const intervalMs = frameMs; // Future dates are estimates, not an exchange calendar.
  const timeAtIndex = (index: number) => {
    const snapped = Math.round(index);
    return snapped < candles.length ? candles[Math.max(0, snapped)].time : last.time + (snapped - candles.length + 1) * intervalMs;
  };
  const crossIndex = crosshair ? Math.floor(chart.start + (crosshair.x - chart.padding.left) / chart.barW) : 0;
  const hoveredCandle = crosshair && crossIndex >= 0 && crossIndex < candles.length ? candles[crossIndex] : null;
  const infoCandle = hoveredCandle ?? last;
  const activeLabel = TOOL_ITEMS.find(t => t.id === activeTool)?.label ?? 'Mover y seleccionar';
  const currentHistory = undoHistory.current[drawingKey];
  const luminance = (hex: string) => { const c = [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; };
  const contrast = (a:string,b:string) => { const x=luminance(a),y=luminance(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
  const colorWarning = Math.min(contrast(colors.up,colors.background),contrast(colors.down,colors.background)) < 3;
  const axisInk = luminance(colors.background) > .179 ? '#000000' : '#ffffff';
  const exportAnalysis = () => { const payload = {schemaVersion:3, savedAt:Date.now(), symbol,timeframe,indicators,indicatorStyles,studiesLocked,colors,drawings,favorites,catalog}; const blob = new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}); const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='graphicview-analisis.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const toggleFavorite = (item: Asset) => { setCatalog(items => items.some(x=>x.symbol===item.symbol)?items:[...items,item]); setFavorites(items=>items.includes(item.symbol)?items.filter(id=>id!==item.symbol):[...items,item.symbol]); };
  const crossPrice = crosshair ? chart.max - ((crosshair.y - chart.padding.top) / chart.innerH) * (chart.max - chart.min) : 0;
  const crossDate = crosshair ? new Date(timeAtIndex(crossIndex)).toLocaleString('es-MX', timeframe === '4H'
    ? { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }
    : { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  const measurementStats = measurement ? {
    candles: Math.abs(measurement.end.index - measurement.start.index) + 1,
    price: measurement.end.price - measurement.start.price,
    percent: measurement.start.price ? (measurement.end.price - measurement.start.price) / measurement.start.price * 100 : 0,
  } : null;

  return (
    <main className={`app-shell miestilo-dark graphicview-shell ${focusMode ? 'focus-mode' : ''}`} style={{ '--chart-bg': colors.background, '--axis-ink': axisInk } as React.CSSProperties}>
      {panelActive && <button className="panel-backdrop" aria-label="Cerrar panel" tabIndex={-1} onClick={closePanels} />}
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><BarChart3 size={18} /></span><span>GraphicView</span></div>
        <div className="asset-picker-wrap">
          <button className="asset-picker" onClick={() => openPanel('assets')} aria-expanded={assetMenu} aria-label="Seleccionar activo"><AssetIcon asset={asset} size="medium" /><span><strong>{symbol}</strong><small>{market.name || asset.name}</small></span><ChevronDown size={16} /></button>
          {assetMenu && <div className="asset-menu" data-app-panel role="dialog" aria-modal="true" aria-label="Seleccionar activo"><div className="panel-heading"><span>Explorar mercados</span><button className="panel-close" aria-label="Cerrar búsqueda" onClick={closePanels}><X size={18} /></button></div>
            <label><Search size={15} /><input aria-label="Buscar acciones, ETF o índices" autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar acciones, ETF o índices" /></label>
            <div className="asset-results">{searching && <p className="menu-status">Buscando…</p>}{!searching && searchError && <p className="menu-status" role="alert">{searchError} <button onClick={() => setSearchRetry(n=>n+1)}>Reintentar</button></p>}{!searching && !searchError && !visibleAssets.length && <p className="menu-status">{search.trim() ? `Sin coincidencias para “${search}”` : 'Busca por nombre o símbolo'}</p>}{!searching && visibleAssets.map((item) => <div className="asset-result" key={item.symbol}><button onClick={() => chooseAsset(item)}><AssetIcon asset={item} /><span><strong>{item.symbol}</strong><small>{item.name} · {item.exchange ?? item.category}</small></span></button><button className={favorites.includes(item.symbol) ? 'starred' : ''} onClick={() => toggleFavorite(item)} aria-label={`${favorites.includes(item.symbol) ? 'Quitar' : 'Agregar'} ${item.symbol} ${favorites.includes(item.symbol) ? 'de' : 'a'} favoritos`}><Star size={16} fill={favorites.includes(item.symbol) ? 'currentColor' : 'none'} /></button></div>)}</div>
          </div>}
        </div>
        <nav className="timeframes" aria-label="Marco temporal">{['4H', '1D', '1S'].map((item) => <button key={item} className={timeframe === item ? 'active' : ''} aria-pressed={timeframe === item} aria-label={item === '1S' ? '1 semana' : item === '1D' ? '1 día' : '4 horas'} onClick={() => { setCrosshair(null); setTimeframe(item); }}>{item}</button>)}</nav>
        <div className="top-actions"><button className="icon-button" title="Objetos del gráfico" aria-label="Objetos del gráfico" onClick={()=>openPanel('objects')}><List size={18}/></button>
          <button className="icon-button mobile-favorites-toggle" onClick={() => openPanel('favorites')} aria-label="Favoritos" aria-expanded={mobileFavoritesOpen}><Star size={18} /></button>
          <button className="action-button" onClick={() => openPanel('indicators')} aria-expanded={indicatorMenu} aria-label="Indicadores"><LineChart size={17} /><span>Indicadores</span><b>{indicators.length}</b></button>
          <button className={`icon-button ${!showStudies ? 'active' : ''}`} onClick={() => setShowStudies(!showStudies)} aria-pressed={!showStudies} aria-label="Mostrar u ocultar dibujos">{showStudies ? <Eye size={18} /> : <EyeOff size={18} />}</button>
          <button className={`icon-button ${studiesLocked ? 'active' : ''}`} onClick={toggleStudiesLock} aria-label={studiesLocked ? 'Desbloquear dibujos e indicadores' : 'Bloquear dibujos e indicadores'} aria-pressed={studiesLocked} title={studiesLocked ? 'Desbloquear dibujos e indicadores' : 'Bloquear dibujos e indicadores'}>{studiesLocked ? <Lock size={18} /> : <Unlock size={18} />}</button>
          <button className="icon-button" onClick={() => openPanel('settings')} aria-expanded={settingsOpen} aria-label="Apariencia"><Palette size={18} /></button>
        </div>
        {indicatorMenu && <div className="floating-panel indicators-panel" data-app-panel role="dialog" aria-modal="true" aria-label="Indicadores"><div className="panel-heading"><span>Indicadores</span><button className="panel-close" aria-label="Cerrar indicadores" onClick={closePanels}><X size={18} /></button></div>{INDICATORS.map((item) => <div className={`indicator-row ${selectedIndicator === item.id ? 'current' : ''}`} key={item.id}><button disabled={studiesLocked} onClick={() => { setSelectedIndicator(item.id); }}><span style={{ background: indicatorStyles[item.id]?.color ?? item.color }} />{item.label}</button><button disabled={studiesLocked} className={indicators.includes(item.id) ? 'visible-toggle' : ''} onClick={() => setIndicators((list) => list.includes(item.id) ? list.filter((id) => id !== item.id) : [...list, item.id])} aria-label={`${indicators.includes(item.id) ? 'Ocultar' : 'Mostrar'} ${item.label}`}>{indicators.includes(item.id) ? <Eye size={15} /> : <EyeOff size={15} />}</button></div>)}{!studiesLocked && selectedIndicator && selectedIndicatorStyle && <div className="indicator-editor"><strong>{INDICATORS.find((item) => item.id === selectedIndicator)?.label}</strong><label>Color <input type="color" value={selectedIndicatorStyle.color} onInput={(event) => { const color=event.currentTarget.value; setIndicatorStyles(styles=>({...styles,[selectedIndicator]:{...styles[selectedIndicator],color}})); }} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], color: event.target.value } }))} /></label><label>Opacidad <input type="range" min="10" max="100" value={Math.round(selectedIndicatorStyle.opacity * 100)} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], opacity: Number(event.target.value) / 100 } }))} /><output>{Math.round(selectedIndicatorStyle.opacity * 100)}%</output></label><label>Grosor <input type="range" min="1" max="8" step=".5" value={selectedIndicatorStyle.width} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], width: Number(event.target.value) } }))} /><output>{selectedIndicatorStyle.width}px</output></label></div>}</div>}
        {settingsOpen && <div className="floating-panel settings-panel" data-app-panel role="dialog" aria-modal="true" aria-label="Apariencia"><div className="panel-heading"><span>Apariencia</span><button className="panel-close" aria-label="Cerrar apariencia" onClick={closePanels}><X size={18} /></button></div><p className="panel-description">Los colores se guardan con tu espacio de trabajo.</p>{colorWarning && <p className="contrast-warning" role="status">Una vela tiene poco contraste con el fondo. Puedes conservarla o elegir un tono más visible.</p>}<div className="appearance-row"><span>Vela alcista</span><ColorControl label="Vela alcista" value={colors.up} onChange={(value) => setColors((current) => ({ ...current, up: value }))} /></div><div className="appearance-row"><span>Vela bajista</span><ColorControl label="Vela bajista" value={colors.down} onChange={(value) => setColors((current) => ({ ...current, down: value }))} /></div><div className="appearance-row"><span>Fondo del gráfico</span><ColorControl label="Fondo del gráfico" value={colors.background} onChange={(value) => setColors((current) => ({ ...current, background: value }))} /></div></div>}
        <button className="focus-toggle icon-button" title={focusMode ? 'Salir de concentración' : 'Concentración'} aria-label={focusMode ? 'Salir de concentración' : 'Concentración'} aria-pressed={focusMode} onClick={()=>setFocusMode(!focusMode)}>{focusMode ? <Minimize2 size={18}/> : <Maximize2 size={18}/>}</button>
        {toolsMenu && <div className="floating-panel tools-panel" data-app-panel role="dialog" aria-modal="true" aria-label="Herramientas"><div className="panel-heading"><span>Herramientas</span><button className="panel-close" onClick={closePanels} aria-label="Cerrar herramientas"><X size={18}/></button></div><p className="panel-description">{studiesLocked?'Desbloquea el análisis para dibujar.':'Elige qué necesitas. Escape cancela una operación.'}</p><div className="tool-grid">{TOOL_ITEMS.map(({id,label,icon:Icon})=><button key={id} disabled={studiesLocked && id!=='cursor' && id!=='ruler'} onClick={()=>{cancelOperation();setActiveTool(id);closePanels()}}><Icon size={22}/><span>{label}<small>{id==='fibext'?'Tres puntos: inicio, impulso y retroceso':id==='ruler'?'Dos puntos · medición temporal':id==='hline'?'Un toque · proyección a la derecha':id==='text'?'Coloca y escribe una anotación':id==='cursor'?'Desplazar y seleccionar':'Arrastra entre dos puntos'}</small></span></button>)}</div><div className="panel-row"><button onClick={undo} disabled={!currentHistory?.past.length||studiesLocked}>Deshacer</button><button onClick={redo} disabled={!currentHistory?.future.length||studiesLocked}>Rehacer</button><button onClick={()=>openPanel('objects')}>Objetos ({currentDrawings.length})</button></div></div>}
        {objectsMenu && <div className="floating-panel objects-panel" data-app-panel role="dialog" aria-modal="true" aria-label="Objetos del gráfico"><div className="panel-heading"><span>Objetos del gráfico</span><button className="panel-close" onClick={closePanels} aria-label="Cerrar objetos"><X size={18}/></button></div><p className="panel-description">{currentDrawings.length} objetos · {symbol} · {timeframe}. Selecciona uno para editarlo.</p>{!currentDrawings.length && <p>Aún no hay dibujos en este gráfico.</p>}{currentDrawings.map((d,i)=><button className="object-row" disabled={studiesLocked} key={d.id} onClick={()=>{cancelOperation();setActiveTool('cursor');setShowStudies(true);setSelectedDrawing(d.id);setEditorOpen(true);closePanels()}}><i style={{background:d.color}}/><span>{TOOL_ITEMS.find(t=>t.id===d.kind)?.label} {i+1}<small>{d.text || (d.start.time?new Date(d.start.time).toLocaleDateString('es-MX'):'Ancla antigua por índice')}</small></span><ChevronRight size={16}/></button>)}</div>}
      </header>

      <section className={`workspace ${toolsOpen ? '' : 'tools-closed'} ${favoritesOpen ? '' : 'favorites-closed'}`}>
        <aside className="toolrail">
          <button className="rail-toggle" aria-label="Ocultar herramientas" onClick={() => setToolsOpen(false)}><ChevronLeft size={17} /></button>
          {TOOL_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} disabled={studiesLocked && id !== 'cursor' && id !== 'ruler'} className={activeTool === id ? 'active' : ''} onClick={() => { setActiveTool(id); setDraft(null); setFibExtStage(0); }} title={label} data-tooltip={label} aria-label={label}><Icon size={19} /></button>)}
          <span className="rail-divider" />
          <button onClick={undo} disabled={studiesLocked || !currentHistory?.past.length} aria-label="Deshacer última acción" title="Deshacer última acción" data-tooltip="Deshacer"><Undo2 size={19} /></button><button onClick={redo} disabled={studiesLocked || !currentHistory?.future.length} aria-label="Rehacer" title="Rehacer"><Redo2 size={19}/></button><button onClick={()=>openPanel('objects')} aria-label="Objetos del gráfico" title="Objetos del gráfico"><List size={19}/></button>
          <button onClick={() => setShowStudies(!showStudies)} className={!showStudies ? 'active' : ''} data-tooltip="Mostrar u ocultar dibujos">{showStudies ? <Eye size={19} /> : <EyeOff size={19} />}</button>
          <button aria-label={studiesLocked ? 'Desbloquear dibujos e indicadores' : 'Bloquear dibujos e indicadores'} onClick={toggleStudiesLock} className={studiesLocked ? 'active' : ''} data-tooltip={studiesLocked ? 'Desbloquear dibujos e indicadores' : 'Bloquear dibujos e indicadores'}>{studiesLocked ? <Lock size={19} /> : <Unlock size={19} />}</button>
        </aside>
        {!toolsOpen && <button className="open-tools edge-button" aria-label="Mostrar herramientas" onClick={() => setToolsOpen(true)}><ChevronRight size={17} /></button>}

        <section className="chart-area">
          <div className="chart-header">
            <div><div className="chart-title"><AssetIcon asset={asset} size="medium" /><strong>{dataReady ? market.name : asset.name}</strong><em title={timeframe==='4H' && symbol!=='BTCUSD'?'Yahoo: agrupación de cuatro velas horarias; calendario de sesiones pendiente de validación':undefined}>· {timeframe}{timeframe==='4H' && symbol!=='BTCUSD'?'*':''}</em><span className="market-status"><i /> {market.exchange}</span></div><div className={`ohlc ${dataReady ? '' : 'unconfirmed'}`}><span title="Apertura">A <b>{formatPrice(infoCandle.open, market.currency)}</b></span><span title="Cierre">C <b>{formatPrice(infoCandle.close, market.currency)}</b></span><span title="Máximo">Máx <b>{formatPrice(infoCandle.high, market.currency)}</b></span><span title="Mínimo">Mín <b>{formatPrice(infoCandle.low, market.currency)}</b></span>{hoveredCandle ? <strong className="hovered-candle-date">{new Date(hoveredCandle.time).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong> : <strong className={market.change >= 0 ? 'positive' : 'negative'}>{market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%</strong>}</div></div>
            <div className="chart-controls"><button aria-label="Ajustar vista" title="Ajustar vista" onClick={()=>{setVerticalScale(1);setPriceShift(0);setZoom(1);setOffset(0)}}><LocateFixed size={16}/></button><button aria-label="Alejar gráfico" title="Alejar gráfico" onClick={() => setZoom((value) => Math.max(.5, Math.round((value - .05) * 100) / 100))}><Minus size={15} /></button><output>{Math.round(zoom * 100)}%</output><button aria-label="Acercar gráfico" title="Acercar gráfico" onClick={() => setZoom((value) => Math.min(8, Math.round((value + .05) * 100) / 100))}><Plus size={15} /></button></div>
          </div>
          <div className="analysis-strip"><div className="study-legend">{INDICATORS.filter(item=>indicators.includes(item.id)).map(item=><button key={item.id} onClick={()=>{setSelectedIndicator(item.id);openPanel('indicators')}}><i style={{background:indicatorStyles[item.id]?.color??item.color}}/>{item.label}<span>{dataReady && averages[item.id][hoveredCandle ? crossIndex : candles.length-1] != null ? formatPrice(averages[item.id][hoveredCandle ? crossIndex : candles.length-1]!,market.currency) : '—'}</span></button>)}</div><div className="analysis-actions"><button aria-label="Mostrar u ocultar dibujos" aria-pressed={!showStudies} title="Mostrar u ocultar dibujos" onClick={()=>setShowStudies(!showStudies)}>{showStudies?<Eye size={16}/>:<EyeOff size={16}/>}</button><button title={studiesLocked?'Desbloquear análisis':'Bloquear análisis'} aria-label={studiesLocked?'Desbloquear análisis':'Bloquear análisis'} aria-pressed={studiesLocked} onClick={toggleStudiesLock}>{studiesLocked?<Lock size={16}/>:<Unlock size={16}/>}</button></div></div>
          <div ref={canvasRef} onPointerEnter={()=>{chartHovered.current=true}} onPointerLeave={()=>{chartHovered.current=false}} className={`chart-canvas ${activeTool !== 'cursor' && !spacePanning ? 'drawing' : 'pannable'} ${studiesLocked ? 'studies-locked' : ''}`} onWheel={(event) => { event.preventDefault(); if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) setOffset((value) => Math.max(chart.minOffset, Math.min(chart.maxOffset, value + Math.round((event.deltaX || event.deltaY) / 8)))); else setZoom((value) => Math.min(8, Math.max(.5, Math.round((value + (event.deltaY < 0 ? .03 : -.03)) * 100) / 100))); }}>
            <svg key={`${symbol}-${timeframe}-${market.key}`} viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="xMidYMid meet" style={{opacity:dataReady?1:0,pointerEvents:dataReady?'auto':'none'}} aria-hidden={!dataReady} role="img" aria-label={`Gráfico de velas de ${market.name}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={() => { panRef.current = null; scaleRef.current = null; dragRef.current = null; resizeRef.current = null; setCrosshair(null); }} onPointerCancel={() => { panRef.current = null; scaleRef.current = null; dragRef.current = null; resizeRef.current = null; setDraft(null); setCrosshair(null); }}>
              <rect width={chart.width} height={chart.height} fill={colors.background} />
              {[0, 1, 2, 3, 4, 5].map((index) => { const y = chart.padding.top + chart.innerH / 5 * index, value = chart.max - (chart.max - chart.min) / 5 * index; return <text key={index} x={chart.width - chart.padding.right + 6} y={y + 4} className="axis-label">{formatPrice(value, market.currency).replace(/[A-Z$]/g, '')}</text>; })}
              {indicators.map((id) => { const item = INDICATORS.find((entry) => entry.id === id), style = indicatorStyles[id]; return item ? <path key={`${symbol}-${timeframe}-${id}-${chart.start}`} d={pathFor(item.id)} className="indicator-line" style={{ stroke: style?.color ?? item.color, strokeWidth: style?.width ?? 3, opacity: style?.opacity ?? .92 }} /> : null; })}
              {chart.visible.map((candle, i) => { const index = chart.dataStart + i, w = Math.max(2, chart.barW * .62), rising = candle.close >= candle.open, color = rising ? colors.up : colors.down; return <g key={candle.time} data-candle-index={index} data-time={candle.time} aria-label={`${new Date(candle.time).toISOString()} Apertura ${candle.open} Cierre ${candle.close} Máximo ${candle.high} Mínimo ${candle.low}`}><line x1={chart.x(index)} x2={chart.x(index)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.4" /><rect x={chart.x(index) - w / 2} y={Math.min(chart.y(candle.open), chart.y(candle.close))} width={w} height={Math.max(2, Math.abs(chart.y(candle.open) - chart.y(candle.close)))} fill={color} stroke={color} strokeWidth="1.2" /></g>; })}
              {showStudies && currentDrawings.map(drawingElement)}{showStudies && draft && drawingElement(draft)}
              {measurement && <g className="measurement-layer" pointerEvents="none">
                <line x1={chart.x(measurement.start.index)} y1={chart.y(measurement.start.price)} x2={chart.x(measurement.end.index)} y2={chart.y(measurement.end.price)} />
                <circle cx={chart.x(measurement.start.index)} cy={chart.y(measurement.start.price)} r="4" />
                <circle cx={chart.x(measurement.end.index)} cy={chart.y(measurement.end.price)} r="4" />
                {measurementStats && <g transform={`translate(${Math.max(26, Math.min(chart.width - 250, (chart.x(measurement.start.index) + chart.x(measurement.end.index)) / 2 - 115))},${Math.max(50, Math.min(chart.height - 85, (chart.y(measurement.start.price) + chart.y(measurement.end.price)) / 2 - 42))})`}>
                  <rect width="230" height="70" rx="7" /><text x="12" y="20">{measurementStats.candles} velas</text><text x="12" y="40">{measurementStats.percent >= 0 ? '+' : ''}{measurementStats.percent.toFixed(2)}%</text><text x="12" y="59">{measurementStats.price >= 0 ? '+' : ''}{formatPrice(measurementStats.price, market.currency)}</text>
                </g>}
              </g>}
              {crosshair && <g className="crosshair-layer" pointerEvents="none"><line x1={crosshair.x} x2={crosshair.x} y1={chart.padding.top} y2={chart.height - chart.padding.bottom} /><line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={crosshair.y} y2={crosshair.y} /><g transform={`translate(${Math.max(24, Math.min(chart.width - chart.padding.right - 130, crosshair.x - 65))},${chart.height - chart.padding.bottom + 8})`}><rect width="130" height="27" rx="4" /><text x="65" y="18" textAnchor="middle">{crossDate}</text></g><g transform={`translate(${chart.width - chart.padding.right},${Math.max(chart.padding.top, Math.min(chart.height - chart.padding.bottom - 27, crosshair.y - 13))})`}><rect width="88" height="27" rx="4" /><text x="44" y="18" textAnchor="middle">{formatPrice(crossPrice, market.currency).replace(/[A-Z$]/g, '')}</text></g></g>}
              {market.price > 0 && <><line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={chart.y(market.price)} y2={chart.y(market.price)} className="price-line" /><g transform={`translate(${chart.width - chart.padding.right},${chart.y(market.price) - 15})`}><rect width="88" height="30" rx="5" fill="#31c7d0" /><text x="7" y="20" fill="#031014" fontSize="13" fontWeight="700">{formatPrice(market.price, market.currency).replace(/[A-Z$]/g, '')}</text></g></>}
              {(isCompact ? [0, .5, 1] : [0, .33, .66, 1]).map((part) => { const index = chart.start + Math.round((chart.visibleCount - 1) * part), date = new Date(timeAtIndex(index)); return <text key={part} x={chart.x(index)} y={chart.height - 18} textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'} className="axis-label">{date.toLocaleDateString('es-MX', isCompact ? {day:'2-digit',month:'short',timeZone:'UTC'} : {month:'short',year:'numeric',timeZone:'UTC'}).toUpperCase()}</text>; })}
              <rect onDoubleClick={()=>{setVerticalScale(1);setPriceShift(0)}} className="price-axis-hit" x={chart.width - chart.padding.right} y={chart.padding.top} width={chart.padding.right} height={chart.innerH} fill="transparent" />
            </svg>
            {loading && <div className="loading-state" role="status">Cargando {symbol} · {timeframe}…</div>}
            {error && <div className="error-state" role="alert"><strong>{symbol}: datos no disponibles</strong><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Reintentar</button></div>}
            {textPlacement && <div className="text-creator"><strong>Agregar texto</strong><input autoFocus value={newText} onChange={(event) => setNewText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addText(); if (event.key === 'Escape') setTextPlacement(null); }} aria-label="Texto del dibujo" placeholder="Escribe aquí…" /><div><button onClick={() => setTextPlacement(null)}>Cancelar</button><button onClick={addText} disabled={!newText.trim()}>Agregar</button></div></div>}
            {dataReady && activeTool !== 'cursor' && <div className="drawing-tip tool-prompt" role="status"><span className="tool-prompt-icon"><Crosshair size={16} /></span><span className="tool-prompt-copy"><strong>{activeLabel}</strong><span>{spacePanning ? 'Desplazando el gráfico' : activeHint}</span></span><button className="tool-prompt-cancel" aria-label="Cancelar herramienta" title="Cancelar · Escape" onClick={()=>cancelOperation()}><X size={14}/></button></div>}
            {!showStudies && <div className="studies-hidden"><EyeOff size={15} /> Dibujos ocultos</div>}
            {selected && !editorOpen && showStudies && !studiesLocked && <div className="selection-bar"><span>{TOOL_ITEMS.find(t=>t.id===selected.kind)?.label}</span><button onClick={()=>setEditorOpen(!editorOpen)}>Estilo</button><button onClick={deleteSelected}>Eliminar</button><button aria-label="Quitar selección" onClick={()=>setSelectedDrawing(null)}><X size={16}/></button></div>}{selected && editorOpen && showStudies && !studiesLocked && <div className="drawing-editor compact-inspector" role="region" aria-label={`Estilo de ${selectedLabel.toLowerCase()}`}>
              <div className="inspector-heading"><span className="inspector-glyph"><SelectedIcon size={17}/></span><div><strong>{selectedLabel}</strong><small>Estilo del dibujo</small></div><button className="inspector-close" aria-label="Cerrar estilo del dibujo" title="Cerrar estilo" onClick={()=>setEditorOpen(false)}><X size={16}/></button></div>
              <div className="inspector-color"><span>Color</span><ColorControl label="Color del dibujo" value={selected.color} onChange={color=>updateSelected({color})}/></div>
              <label className="inspector-slider"><span>Opacidad</span><input type="range" min="10" max="100" value={Math.round((selected.opacity??1)*100)} onChange={event=>updateSelected({opacity:Number(event.target.value)/100})}/><output>{Math.round((selected.opacity??1)*100)}%</output></label>
              {selected.kind !== 'text' && <label className="inspector-slider"><span>Grosor</span><input type="range" min="1" max="8" step=".1" value={selected.width??2} onChange={event=>updateSelected({width:Number(event.target.value)})}/><output>{Number((selected.width??2).toFixed(1))} px</output></label>}
              {selected.kind === 'text' && <><label className="inspector-text"><span>Texto</span><input className="text-content" value={selected.text??''} onChange={event=>updateSelected({text:event.target.value})}/></label><label className="inspector-slider"><span>Tamaño</span><input type="range" min="10" max="72" step="1" value={selected.fontSize??18} onChange={event=>updateSelected({fontSize:Number(event.target.value)})}/><output>{selected.fontSize??18} px</output></label></>}
              <div className="inspector-footer"><span>Arrastra para mover · nodo para ajustar</span><button className="inspector-delete" onClick={deleteSelected}><Trash2 size={14}/>Eliminar</button></div>
            </div>}
          </div>
          <div className="history-nav" title="Navegar por el historial · fechas futuras estimadas"><button onClick={() => setOffset(chart.maxOffset)}>Inicio</button><input aria-label="Desplazarse por el historial" type="range" min="0" max={chart.maxOffset - chart.minOffset} value={chart.maxOffset - Math.max(chart.minOffset, Math.min(offset, chart.maxOffset))} onChange={(event) => setOffset(chart.maxOffset - Number(event.target.value))} /><button onClick={() => setOffset(0)}>Ahora</button></div>
        </section>

        <aside className={`watchlist ${mobileFavoritesOpen ? 'mobile-open' : ''}`} data-app-panel={mobileFavoritesOpen ? true : undefined} role={mobileFavoritesOpen ? 'dialog' : undefined} aria-modal={mobileFavoritesOpen ? true : undefined} aria-label="Favoritos">
          <div className="watchlist-header"><div><Star size={17} fill="currentColor" /><strong>Favoritos</strong></div><button aria-label="Cerrar favoritos" onClick={() => { setFavoritesOpen(false); setMobileFavoritesOpen(false); }}><PanelRightClose size={18} /></button></div>
          <div className="watchlist-columns"><span>Activo</span><span>Último</span><span>Cambio</span></div>
          <div className="watchlist-items">{favorites.map((id) => catalog.find((item) => item.symbol === id)).filter(Boolean).map((item) => <div className={`watch-row ${symbol === item!.symbol ? 'active' : ''}`} key={item!.symbol}><button onClick={() => { setSymbol(item!.symbol); setMobileFavoritesOpen(false); }}><AssetIcon asset={item!} /><span className="watch-name"><strong>{item!.symbol}</strong><small>{item!.category}</small></span><span className="watch-price">{item!.price ? formatPrice(item!.price).replace('$', '') : '—'}</span><span className={item!.change >= 0 ? 'positive' : 'negative'}>{item!.price ? `${item!.change >= 0 ? '+' : ''}${item!.change.toFixed(2)}%` : '—'}</span></button><button className="remove-favorite" onClick={() => setFavorites((list) => list.filter((entry) => entry !== item!.symbol))} aria-label={`Quitar ${item!.symbol} de favoritos`}><X size={13} /></button></div>)}</div>
          <button className="add-favorite" onClick={() => openPanel('assets')}><Plus size={16} /> Buscar y agregar activo</button>
          <div className="live-quote"><span>Activo en pantalla</span><div><AssetIcon asset={asset} size="large" /><p><strong>{symbol}</strong><small>{market.exchange} · sondeo cada 15 s</small></p></div><b>{dataReady ? formatPrice(market.price, market.currency) : '—'}</b><em className={market.change >= 0 ? 'positive' : 'negative'}>{dataReady ? `${market.change >= 0 ? '+' : ''}${market.change.toFixed(2)}%` : '—'}</em></div>
          <small className="quote-age">{quoteError ? 'Sin actualización de cotización' : quoteUpdated ? `Cotización recibida ${new Date(quoteUpdated).toLocaleTimeString('es-MX')}` : 'Esperando cotización'}<br/>{historyUpdated ? `Velas descargadas ${new Date(historyUpdated).toLocaleTimeString('es-MX')}` : 'Sin historial confirmado'}</small>
        </aside>
        {!favoritesOpen && <button className="open-watchlist edge-button" aria-label="Mostrar favoritos" onClick={() => setFavoritesOpen(true)}><PanelRightOpen size={18} /></button>}
      </section>
      <footer className="workspace-footer"><button className={saveState.includes('Error') || saveState.includes('Solo') ? 'save-warning' : ''} onClick={()=>setSaveRetry(n=>n+1)} aria-label={`Estado del guardado: ${saveState}`}><Check size={13}/>{saveState}</button><button onClick={exportAnalysis}><Download size={13}/>Exportar análisis</button></footer>
      <nav className="mobile-dock" aria-label="Paneles"><button onClick={()=>openPanel('favorites')}><Star size={20}/>Favoritos</button><button onClick={()=>openPanel('tools')}><TrendingUp size={20}/>Dibujar</button><button onClick={()=>openPanel('indicators')}><LineChart size={20}/>Medias</button><button onClick={()=>openPanel('settings')}><Palette size={20}/>Colores</button><button onClick={()=>setFocusMode(true)}><Maximize2 size={20}/>Enfocar</button></nav>
    </main>
  );
}

'use client';

import {
  Activity, Apple as AppleIcon, BarChart3, Bitcoin, Blocks, Building2, CarFront,
  ChartNoAxesCombined, ChevronDown, ChevronLeft, ChevronRight, Cpu, Crosshair, Eye, EyeOff,
  LineChart, LocateFixed, Minus, MousePointer2, Palette, PanelRightClose,
  PanelRightOpen, PanelsTopLeft, Plus, RectangleHorizontal, Search, SlidersHorizontal, Star,
  Trash2, TrendingUp, Type as TypeIcon, Ruler, Undo2, X,
} from 'lucide-react';
import { PointerEvent, useEffect, useMemo, useRef, useState } from 'react';

type Asset = { symbol: string; name: string; price: number; change: number; color: string; category: string; exchange?: string };
type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
type Point = { x: number; y: number };
type DataPoint = { index: number; price: number };
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

export default function Home() {
  const [symbol, setSymbol] = useState('BTCUSD');
  const [timeframe, setTimeframe] = useState('1D');
  const [catalog, setCatalog] = useState<Asset[]>(INITIAL_ASSETS);
  const [favorites, setFavorites] = useState(INITIAL_ASSETS.map((asset) => asset.symbol));
  const [market, setMarket] = useState({ key: 'BTCUSD:1D', candles: FALLBACK, price: 0, change: 0, currency: 'USD', exchange: 'Bitfinex', name: 'Bitcoin / Dólar' });
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [indicators, setIndicators] = useState(['sma20', 'sma200']);
  const [indicatorStyles, setIndicatorStyles] = useState<Record<string, IndicatorStyle>>({ sma20: { color: '#b447da', opacity: .92, width: 3.2 }, sma200: { color: '#ed4d59', opacity: .92, width: 3.8 } });
  const [selectedIndicator, setSelectedIndicator] = useState<string | null>('sma20');
  const [showStudies, setShowStudies] = useState(true);
  const [favoritesOpen, setFavoritesOpen] = useState(true);
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
  const panRef = useRef<{ x: number; offset: number } | null>(null);
  const scaleRef = useRef<{ y: number; scale: number } | null>(null);
  const dragRef = useRef<{ id: number; anchor: DataPoint; originalStart: DataPoint; originalEnd: DataPoint; originalThird?: DataPoint } | null>(null);
  const resizeRef = useRef<{ id: number; kind: Drawing['kind']; startClientX: number; initialFontSize: number } | null>(null);
  const requestRef = useRef(0);

  const asset = catalog.find((item) => item.symbol === symbol) ?? INITIAL_ASSETS[0];
  const candles = market.candles.length ? market.candles : FALLBACK;
  const drawingKey = `${symbol}:${timeframe}`;
  const currentDrawings = drawings[drawingKey] ?? [];
  const averages = useMemo(() => ({ sma20: movingAverage(candles, 20), sma200: movingAverage(candles, 200) }), [candles]);

  useEffect(() => {
    let cancelled = false;
    const restore = async () => {
      try {
        const response = await fetch('/api/workspace', { cache: 'no-store' });
        const remote = response.ok ? (await response.json()).state : null;
        const local = localStorage.getItem('mercado-workspace-v2');
        const state = remote ?? (local ? JSON.parse(local) : null);
        if (state && !cancelled) {
        if (state.symbol) setSymbol(state.symbol);
        if (state.timeframe) setTimeframe(state.timeframe);
        if (state.indicators) setIndicators(state.indicators.filter((id: string) => ['sma20', 'sma200'].includes(id)));
        if (state.indicatorStyles) setIndicatorStyles(state.indicatorStyles);
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
    const state = { symbol, timeframe, indicators, indicatorStyles, colors, drawings, favorites, catalog };
    localStorage.setItem('mercado-workspace-v2', JSON.stringify(state));
    const timer = window.setTimeout(() => fetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) }).catch(() => {}), 350);
    return () => window.clearTimeout(timer);
  }, [symbol, timeframe, indicators, indicatorStyles, colors, drawings, favorites, catalog, ready]);

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
        setMarket({ ...data, key });
        setCatalog((items) => {
          const next = { ...asset, name: data.name ?? asset.name, price: data.price, change: data.change, exchange: data.exchange };
          return items.some((item) => item.symbol === symbol) ? items.map((item) => item.symbol === symbol ? next : item) : [...items, next];
        });
      })
      .catch((reason) => { if (reason.name !== 'AbortError' && requestId === requestRef.current) setError(reason.message); })
      .finally(() => { if (requestId === requestRef.current) setLoading(false); });
    return () => controller.abort();
  }, [symbol, timeframe]);

  useEffect(() => {
    const updateQuote = () => fetch(`/api/market?symbol=${encodeURIComponent(symbol)}&timeframe=${timeframe}&compact=1`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return;
        setMarket((current) => ({ ...current, price: data.price, change: data.change, exchange: data.exchange, currency: data.currency }));
        setCatalog((items) => items.map((item) => item.symbol === symbol ? { ...item, price: data.price, change: data.change } : item));
      }).catch(() => {});
    const timer = window.setInterval(updateQuote, 15_000);
    return () => window.clearInterval(timer);
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!search.trim()) { setSearchResults([]); setSearching(false); return; }
    const controller = new AbortController();
    setSearching(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((data) => setSearchResults((data.results ?? []).map((item: Asset, index: number) => ({ ...item, price: 0, change: 0, color: ASSET_COLORS[index % ASSET_COLORS.length] }))))
        .catch(() => setSearchResults([])).finally(() => setSearching(false));
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [search]);

  const chart = useMemo(() => {
    const width = 1200, height = 660, padding = { left: 20, right: 88, top: 42, bottom: 64 };
    const visibleCount = Math.min(candles.length, Math.max(22, Math.round(150 / zoom)));
    const maxOffset = Math.max(0, candles.length - visibleCount);
    const minOffset = -Math.max(12, Math.round(visibleCount * .28));
    const safeOffset = Math.max(minOffset, Math.min(offset, maxOffset));
    const start = candles.length - visibleCount - safeOffset;
    const end = start + visibleCount;
    const dataStart = Math.max(0, start);
    const dataEnd = Math.min(candles.length, end);
    const visible = candles.slice(dataStart, dataEnd);
    const studyValues = indicators.flatMap((id) => {
      const series = id === 'sma20' ? averages.sma20 : id === 'sma200' ? averages.sma200 : [];
      return series.slice(dataStart, dataEnd).filter((value): value is number => value !== null);
    });
    const low = Math.min(...visible.map((c) => c.low), ...studyValues), high = Math.max(...visible.map((c) => c.high), ...studyValues);
    const spread = high - low || 1, center = (high + low) / 2, halfRange = spread * .58 / verticalScale;
    const min = center - halfRange, max = center + halfRange;
    const innerW = width - padding.left - padding.right, innerH = height - padding.top - padding.bottom;
    const barW = innerW / visibleCount;
    const x = (index: number) => padding.left + (index - start + .5) * barW;
    const y = (value: number) => padding.top + ((max - value) / (max - min)) * innerH;
    const fromScreen = (point: Point) => ({ index: Math.max(0, Math.min(Math.max(candles.length - 1, Math.ceil(end) - 1), Math.round(start + (point.x - padding.left) / barW))), price: max - ((point.y - padding.top) / innerH) * (max - min) });
    return { width, height, padding, visible, visibleCount, maxOffset, minOffset, start, end, dataStart, dataEnd, min, max, innerW, innerH, barW, x, y, fromScreen };
  }, [averages, candles, indicators, offset, verticalScale, zoom]);

  function screenPoint(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width * 1200, y: (event.clientY - rect.top) / rect.height * 660 };
  }

  function pointFromClient(clientX: number, clientY: number, element: SVGElement) {
    const svg = element.closest('svg')!;
    const rect = svg.getBoundingClientRect();
    return { x: (clientX - rect.left) / rect.width * 1200, y: (clientY - rect.top) / rect.height * 660 };
  }

  function pointerDown(event: PointerEvent<SVGSVGElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    const screen = screenPoint(event);
    setCrosshair(screen);
    if (screen.x >= chart.width - chart.padding.right) { scaleRef.current = { y: event.clientY, scale: verticalScale }; setSelectedDrawing(null); return; }
    if (activeTool === 'cursor') {
      if (measurement?.complete) { setMeasurement(null); return; }
      panRef.current = { x: event.clientX, offset }; setSelectedDrawing(null); return;
    }
    const point = chart.fromScreen(screenPoint(event));
    const color = TOOL_ITEMS.find((item) => item.id === activeTool)?.color ?? '#4bd2dc';
    if (activeTool === 'hline') {
      const line: Drawing = { id: Date.now(), kind: 'hline', start: point, end: { ...point, index: Math.ceil(chart.end) - 1 }, color, timeframe, opacity: 1, width: 2 };
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
        const completed = { ...draft, third: point };
        setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), completed] }));
        setSelectedDrawing(completed.id); setDraft(null); setFibExtStage(0); setActiveTool('cursor');
      }
      return;
    }
    setDraft({ id: Date.now(), kind: activeTool, start: point, end: point, color, timeframe, opacity: 1, width: activeTool === 'trend' ? 3 : 2 });
  }

  function pointerMove(event: PointerEvent<SVGSVGElement>) {
    const point = screenPoint(event);
    setCrosshair(point.x >= chart.padding.left && point.x <= chart.width - chart.padding.right && point.y >= chart.padding.top && point.y <= chart.height - chart.padding.bottom ? point : null);
    if (scaleRef.current) {
      const next = scaleRef.current.scale * Math.exp((scaleRef.current.y - event.clientY) / 180);
      setVerticalScale(Math.max(.25, Math.min(6, next)));
    } else if (panRef.current) {
      const bars = Math.round((event.clientX - panRef.current.x) / Math.max(3, chart.barW * event.currentTarget.getBoundingClientRect().width / 1200));
      setOffset(Math.max(chart.minOffset, Math.min(chart.maxOffset, panRef.current.offset + bars)));
    } else if (resizeRef.current) {
      const resize = resizeRef.current;
      if (resize.kind === 'text') {
        const rect = event.currentTarget.getBoundingClientRect();
        const delta = (event.clientX - resize.startClientX) * 1200 / rect.width;
        setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === resize.id ? { ...drawing, fontSize: Math.max(10, Math.min(72, Math.round(resize.initialFontSize + delta / 5))) } : drawing) }));
      } else {
        const end = chart.fromScreen(point);
        setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === resize.id ? resize.kind === 'fibext' ? { ...drawing, third: end } : { ...drawing, end: resize.kind === 'hline' ? { index: end.index, price: drawing.start.price } : end } : drawing) }));
      }
    } else if (dragRef.current) {
      const current = chart.fromScreen(point), drag = dragRef.current;
      const indexDelta = current.index - drag.anchor.index, priceDelta = current.price - drag.anchor.price;
      setDrawings((all) => ({ ...all, [drawingKey]: (all[drawingKey] ?? []).map((drawing) => drawing.id === drag.id ? {
        ...drawing,
        start: { index: drag.originalStart.index + indexDelta, price: drag.originalStart.price + priceDelta },
        end: { index: drag.originalEnd.index + indexDelta, price: drag.originalEnd.price + priceDelta },
        third: drag.originalThird ? { index: drag.originalThird.index + indexDelta, price: drag.originalThird.price + priceDelta } : drawing.third,
      } : drawing) }));
    } else if (activeTool === 'fibext' && draft) {
      const current = chart.fromScreen(point);
      setDraft(fibExtStage === 1 ? { ...draft, end: current, third: current } : { ...draft, third: current });
    } else if (activeTool === 'ruler' && measurement && !measurement.complete) setMeasurement({ ...measurement, end: chart.fromScreen(point) });
    else if (draft) setDraft({ ...draft, end: chart.fromScreen(point) });
  }

  function pointerUp() {
    panRef.current = null;
    scaleRef.current = null;
    dragRef.current = null;
    resizeRef.current = null;
    if (activeTool === 'fibext' || !draft) return;
    setDrawings((all) => ({ ...all, [drawingKey]: [...(all[drawingKey] ?? []), draft] }));
    setSelectedDrawing(draft.id); setDraft(null); setActiveTool('cursor');
  }

  function chooseAsset(next: Asset, add = false) {
    setCatalog((items) => items.some((item) => item.symbol === next.symbol) ? items : [...items, next]);
    if (add) setFavorites((items) => items.includes(next.symbol) ? items : [...items, next.symbol]);
    setSymbol(next.symbol); setAssetMenu(false); setSearch('');
  }

  function updateSelected(changes: Partial<Drawing>) {
    setDrawings((all) => ({ ...all, [drawingKey]: currentDrawings.map((drawing) => drawing.id === selectedDrawing ? { ...drawing, ...changes } : drawing) }));
  }

  function deleteSelected() {
    setDrawings((all) => ({ ...all, [drawingKey]: currentDrawings.filter((drawing) => drawing.id !== selectedDrawing) }));
    setSelectedDrawing(null);
  }

  function addText() {
    const text = newText.trim();
    if (!text || !textPlacement) return;
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
      if (activeTool !== 'cursor') return;
      event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
      setSelectedDrawing(drawing.id); setActiveTool('cursor');
      dragRef.current = { id: drawing.id, anchor: chart.fromScreen(pointFromClient(event.clientX, event.clientY, event.currentTarget)), originalStart: drawing.start, originalEnd: drawing.end, originalThird: drawing.third };
    };
    const selected = drawing.id === selectedDrawing && activeTool === 'cursor';
    const resize = (event: PointerEvent<SVGCircleElement>) => { event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); resizeRef.current = { id: drawing.id, kind: drawing.kind, startClientX: event.clientX, initialFontSize: drawing.fontSize ?? 18 }; };
    const textW = Math.max(45, (drawing.text?.length ?? 1) * (drawing.fontSize ?? 18) * .62);
    const handleX = drawing.kind === 'text' ? x1 + textW : x2, handleY = drawing.kind === 'hline' ? y1 : drawing.kind === 'text' ? y1 - (drawing.fontSize ?? 18) / 2 : y2;
    const handle = selected ? <circle className="resize-handle" cx={handleX} cy={handleY} r="6" onPointerDown={resize} /> : null;
    if (drawing.kind === 'hline') return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}><line x1={x1} y1={y1} x2={x2} y2={y1} stroke={drawing.color} strokeWidth={width} /><line x1={x1} y1={y1} x2={x2} y2={y1} stroke="transparent" strokeWidth="16" />{handle}</g>;
    if (drawing.kind === 'text') return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}><text x={x1} y={y1} fill={drawing.color} fontSize={drawing.fontSize ?? 18} fontWeight="600">{drawing.text}</text><rect x={x1 - 6} y={y1 - (drawing.fontSize ?? 18)} width={textW} height={(drawing.fontSize ?? 18) + 10} fill="transparent" stroke={selected ? drawing.color : 'transparent'} strokeDasharray="4 3" />{handle}</g>;
    if (drawing.kind === 'rect') return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}><rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill={drawing.color} fillOpacity=".13" stroke={drawing.color} strokeWidth={width} /><rect x={Math.min(x1, x2) - 5} y={Math.min(y1, y2) - 5} width={Math.abs(x2 - x1) + 10} height={Math.abs(y2 - y1) + 10} fill="transparent" stroke="transparent" strokeWidth="10" />{handle}</g>;
    if (drawing.kind === 'trend') return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={drawing.color} strokeWidth={width} /><line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth="16" />{handle}</g>;
    if (drawing.kind === 'fibext') {
      const third = drawing.third ?? drawing.end, x3 = chart.x(third.index), y3 = chart.y(third.price);
      const levels = [0, .618, 1, 1.618, 2.618], amplitude = drawing.end.price - drawing.start.price;
      return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}><path d={`M ${x1} ${y1} L ${x2} ${y2} L ${x3} ${y3}`} fill="none" stroke={drawing.color} strokeWidth={Math.max(1, width * .7)} strokeDasharray="5 5" />{levels.map((level) => { const y = chart.y(third.price + amplitude * level); return <g key={level}><line x1={x3} y1={y} x2={chart.width - chart.padding.right} y2={y} stroke={drawing.color} strokeWidth={width} strokeDasharray={level === 0 || level === 1 ? undefined : '5 5'} /><text x={chart.width - chart.padding.right - 7} y={y - 5} textAnchor="end" fill={drawing.color} fontSize="12">{level}</text></g>; })}{selected && <><circle className="fib-point" cx={x1} cy={y1} r="4" /><circle className="fib-point" cx={x2} cy={y2} r="4" /><circle className="resize-handle" cx={x3} cy={y3} r="6" onPointerDown={resize} /></>}</g>;
    }
    const levels = [0, .236, .382, .5, .618, .786, .886, 1];
    return <g key={drawing.id} onPointerDown={select} className="movable-drawing" opacity={opacity}>{levels.map((level) => {
      const y = y2 + (y1 - y2) * level;
      return <g key={level}><line x1={x1} y1={y} x2={x2} y2={y} stroke={drawing.color} strokeWidth={width} strokeDasharray={level === 0 || level === 1 ? undefined : '5 5'} /><text x={x2 + 7} y={y - 5} fill={drawing.color} fontSize="12">{level}</text></g>;
    })}<rect x={Math.min(x1, x2)} y={Math.min(y1, y2) - 8} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1) + 16} fill="transparent" stroke="transparent" strokeWidth="12" />{handle}</g>;
  };

  const visibleAssets = search.trim() ? searchResults : favorites.map((id) => catalog.find((item) => item.symbol === id)).filter(Boolean) as Asset[];
  const selected = currentDrawings.find((drawing) => drawing.id === selectedDrawing);
  const selectedIndicatorStyle = selectedIndicator ? indicatorStyles[selectedIndicator] : null;
  const last = candles.at(-1)!;
  const intervalMs = candles.length > 1 ? Math.max(1, last.time - candles.at(-2)!.time) : 86_400_000;
  const timeAtIndex = (index: number) => index < candles.length
    ? candles[Math.max(0, index)].time
    : last.time + (index - candles.length + 1) * intervalMs;
  const crossIndex = crosshair ? Math.round(chart.start + (crosshair.x - chart.padding.left) / chart.barW) : 0;
  const hoveredCandle = crosshair && crossIndex >= 0 && crossIndex < candles.length ? candles[crossIndex] : null;
  const infoCandle = hoveredCandle ?? last;
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
    <main className="app-shell" style={{ '--chart-bg': colors.background } as React.CSSProperties}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><BarChart3 size={18} /></span><span>Mercado</span></div>
        <div className="asset-picker-wrap">
          <button className="asset-picker" onClick={() => setAssetMenu(!assetMenu)}><AssetIcon asset={asset} size="medium" /><span><strong>{symbol}</strong><small>{market.name || asset.name}</small></span><ChevronDown size={16} /></button>
          {assetMenu && <div className="asset-menu">
            <label><Search size={15} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar acciones, ETF o índices" /></label>
            <div className="asset-results">{searching && <p className="menu-status">Buscando…</p>}{!searching && visibleAssets.map((item) => <div className="asset-result" key={item.symbol}><button onClick={() => chooseAsset(item)}><AssetIcon asset={item} /><span><strong>{item.symbol}</strong><small>{item.name} · {item.exchange ?? item.category}</small></span></button><button className={favorites.includes(item.symbol) ? 'starred' : ''} onClick={() => setFavorites((list) => list.includes(item.symbol) ? list.filter((id) => id !== item.symbol) : [...list, item.symbol])} aria-label="Agregar o quitar favorito"><Star size={16} fill={favorites.includes(item.symbol) ? 'currentColor' : 'none'} /></button></div>)}</div>
          </div>}
        </div>
        <nav className="timeframes" aria-label="Marco temporal">{['4H', '1D', '1S'].map((item) => <button key={item} className={timeframe === item ? 'active' : ''} aria-pressed={timeframe === item} onClick={() => { setCrosshair(null); setTimeframe(item); }}>{item}</button>)}</nav>
        <div className="top-actions">
          <button className="action-button" onClick={() => setIndicatorMenu(!indicatorMenu)}><LineChart size={17} /><span>Indicadores</span><b>{indicators.length}</b></button>
          <button className={`icon-button ${!showStudies ? 'active' : ''}`} onClick={() => setShowStudies(!showStudies)} aria-label="Mostrar u ocultar dibujos">{showStudies ? <Eye size={18} /> : <EyeOff size={18} />}</button>
          <button className="icon-button" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Apariencia"><Palette size={18} /></button>
        </div>
        {indicatorMenu && <div className="floating-panel indicators-panel"><div className="panel-heading"><span>Indicadores</span></div>{INDICATORS.map((item) => <div className={`indicator-row ${selectedIndicator === item.id ? 'current' : ''}`} key={item.id}><button onClick={() => { setSelectedIndicator(item.id); if (!indicators.includes(item.id)) setIndicators((list) => [...list, item.id]); }}><span style={{ background: indicatorStyles[item.id]?.color ?? item.color }} />{item.label}</button><button className={indicators.includes(item.id) ? 'visible-toggle' : ''} onClick={() => setIndicators((list) => list.includes(item.id) ? list.filter((id) => id !== item.id) : [...list, item.id])} aria-label={`${indicators.includes(item.id) ? 'Ocultar' : 'Mostrar'} ${item.label}`}>{indicators.includes(item.id) ? <Eye size={15} /> : <EyeOff size={15} />}</button></div>)}{selectedIndicator && selectedIndicatorStyle && <div className="indicator-editor"><strong>{INDICATORS.find((item) => item.id === selectedIndicator)?.label}</strong><label>Color <input type="color" value={selectedIndicatorStyle.color} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], color: event.target.value } }))} /></label><label>Opacidad <input type="range" min="10" max="100" value={Math.round(selectedIndicatorStyle.opacity * 100)} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], opacity: Number(event.target.value) / 100 } }))} /><output>{Math.round(selectedIndicatorStyle.opacity * 100)}%</output></label><label>Grosor <input type="range" min="1" max="8" step=".5" value={selectedIndicatorStyle.width} onChange={(event) => setIndicatorStyles((styles) => ({ ...styles, [selectedIndicator]: { ...styles[selectedIndicator], width: Number(event.target.value) } }))} /><output>{selectedIndicatorStyle.width}px</output></label></div>}</div>}
        {settingsOpen && <div className="floating-panel settings-panel"><div className="panel-heading"><span>Apariencia</span><small>Guardado local</small></div><label>Vela alcista<input type="color" value={colors.up} onChange={(event) => setColors({ ...colors, up: event.target.value })} /></label><label>Vela bajista<input type="color" value={colors.down} onChange={(event) => setColors({ ...colors, down: event.target.value })} /></label><label>Fondo del gráfico<input type="color" value={colors.background} onChange={(event) => setColors({ ...colors, background: event.target.value })} /></label></div>}
      </header>

      <section className={`workspace ${toolsOpen ? '' : 'tools-closed'} ${favoritesOpen ? '' : 'favorites-closed'}`}>
        <aside className="toolrail">
          <button className="rail-toggle" onClick={() => setToolsOpen(false)}><ChevronLeft size={17} /></button>
          {TOOL_ITEMS.map(({ id, label, icon: Icon }) => <button key={id} className={activeTool === id ? 'active' : ''} onClick={() => { setActiveTool(id); setDraft(null); setFibExtStage(0); }} data-tooltip={label} aria-label={label}><Icon size={19} /></button>)}
          <span className="rail-divider" />
          <button onClick={() => setDrawings((all) => ({ ...all, [drawingKey]: currentDrawings.slice(0, -1) }))} disabled={!currentDrawings.length} data-tooltip="Deshacer dibujo"><Undo2 size={19} /></button>
          <button onClick={() => setShowStudies(!showStudies)} className={!showStudies ? 'active' : ''} data-tooltip="Mostrar u ocultar dibujos">{showStudies ? <Eye size={19} /> : <EyeOff size={19} />}</button>
        </aside>
        {!toolsOpen && <button className="open-tools edge-button" onClick={() => setToolsOpen(true)}><ChevronRight size={17} /></button>}

        <section className="chart-area">
          <div className="chart-header">
            <div><div className="chart-title"><AssetIcon asset={asset} size="medium" /><strong>{market.name || asset.name}</strong><em>· {timeframe}</em><span className="market-status"><i /> {market.exchange}</span></div><div className="ohlc"><span>O <b>{formatPrice(infoCandle.open, market.currency)}</b></span><span>C <b>{formatPrice(infoCandle.close, market.currency)}</b></span><span>H <b>{formatPrice(infoCandle.high, market.currency)}</b></span><span>L <b>{formatPrice(infoCandle.low, market.currency)}</b></span>{hoveredCandle ? <strong className="hovered-candle-date">{new Date(hoveredCandle.time).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong> : <strong className={market.change >= 0 ? 'positive' : 'negative'}>{market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%</strong>}</div></div>
            <div className="chart-controls"><span>Zoom</span><button onClick={() => setZoom((value) => Math.max(.5, Math.round((value - .05) * 100) / 100))}><Minus size={15} /></button><output>{Math.round(zoom * 100)}%</output><button onClick={() => setZoom((value) => Math.min(8, Math.round((value + .05) * 100) / 100))}><Plus size={15} /></button></div>
          </div>
          <div className={`chart-canvas ${activeTool !== 'cursor' ? 'drawing' : 'pannable'}`} onWheel={(event) => { event.preventDefault(); if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) setOffset((value) => Math.max(chart.minOffset, Math.min(chart.maxOffset, value + Math.round((event.deltaX || event.deltaY) / 8)))); else setZoom((value) => Math.min(8, Math.max(.5, Math.round((value + (event.deltaY < 0 ? .03 : -.03)) * 100) / 100))); }}>
            <svg key={`${symbol}-${timeframe}-${market.key}`} viewBox="0 0 1200 660" role="img" aria-label={`Gráfico de velas de ${market.name}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerLeave={() => { panRef.current = null; scaleRef.current = null; dragRef.current = null; resizeRef.current = null; setCrosshair(null); }} onPointerCancel={() => { panRef.current = null; scaleRef.current = null; dragRef.current = null; resizeRef.current = null; setDraft(null); setCrosshair(null); }}>
              <rect width="1200" height="660" fill={colors.background} />
              {[0, 1, 2, 3, 4, 5].map((index) => { const y = chart.padding.top + chart.innerH / 5 * index, value = chart.max - (chart.max - chart.min) / 5 * index; return <text key={index} x={1118} y={y + 4} className="axis-label">{formatPrice(value, market.currency).replace(/[A-Z$]/g, '')}</text>; })}
              {indicators.map((id) => { const item = INDICATORS.find((entry) => entry.id === id), style = indicatorStyles[id]; return item ? <path key={`${symbol}-${timeframe}-${id}-${chart.start}`} d={pathFor(item.id)} className="indicator-line" style={{ stroke: style?.color ?? item.color, strokeWidth: style?.width ?? 3, opacity: style?.opacity ?? .92 }} /> : null; })}
              {chart.visible.map((candle, i) => { const index = chart.dataStart + i, w = Math.max(2, chart.barW * .62), rising = candle.close >= candle.open, color = rising ? colors.up : colors.down; return <g key={candle.time}><line x1={chart.x(index)} x2={chart.x(index)} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="1.4" /><rect x={chart.x(index) - w / 2} y={Math.min(chart.y(candle.open), chart.y(candle.close))} width={w} height={Math.max(2, Math.abs(chart.y(candle.open) - chart.y(candle.close)))} fill={color} stroke={color} strokeWidth="1.2" /></g>; })}
              {showStudies && currentDrawings.map(drawingElement)}{showStudies && draft && drawingElement(draft)}
              {measurement && <g className="measurement-layer" pointerEvents="none">
                <line x1={chart.x(measurement.start.index)} y1={chart.y(measurement.start.price)} x2={chart.x(measurement.end.index)} y2={chart.y(measurement.end.price)} />
                <circle cx={chart.x(measurement.start.index)} cy={chart.y(measurement.start.price)} r="4" />
                <circle cx={chart.x(measurement.end.index)} cy={chart.y(measurement.end.price)} r="4" />
                {measurementStats && <g transform={`translate(${Math.max(26, Math.min(890, (chart.x(measurement.start.index) + chart.x(measurement.end.index)) / 2 - 115))},${Math.max(50, Math.min(575, (chart.y(measurement.start.price) + chart.y(measurement.end.price)) / 2 - 42))})`}>
                  <rect width="230" height="70" rx="7" /><text x="12" y="20">{measurementStats.candles} velas</text><text x="12" y="40">{measurementStats.percent >= 0 ? '+' : ''}{measurementStats.percent.toFixed(2)}%</text><text x="12" y="59">{measurementStats.price >= 0 ? '+' : ''}{formatPrice(measurementStats.price, market.currency)}</text>
                </g>}
              </g>}
              {crosshair && <g className="crosshair-layer" pointerEvents="none"><line x1={crosshair.x} x2={crosshair.x} y1={chart.padding.top} y2={chart.height - chart.padding.bottom} /><line x1={chart.padding.left} x2={chart.width - chart.padding.right} y1={crosshair.y} y2={crosshair.y} /><g transform={`translate(${Math.max(24, Math.min(1010, crosshair.x - 65))},${chart.height - chart.padding.bottom + 8})`}><rect width="130" height="27" rx="4" /><text x="65" y="18" textAnchor="middle">{crossDate}</text></g><g transform={`translate(${chart.width - chart.padding.right},${Math.max(chart.padding.top, Math.min(chart.height - chart.padding.bottom - 27, crosshair.y - 13))})`}><rect width="88" height="27" rx="4" /><text x="44" y="18" textAnchor="middle">{formatPrice(crossPrice, market.currency).replace(/[A-Z$]/g, '')}</text></g></g>}
              {market.price > 0 && <><line x1="20" x2="1112" y1={chart.y(market.price)} y2={chart.y(market.price)} className="price-line" /><g transform={`translate(1112,${chart.y(market.price) - 15})`}><rect width="88" height="30" rx="5" fill="#31c7d0" /><text x="7" y="20" fill="#031014" fontSize="13" fontWeight="700">{formatPrice(market.price, market.currency).replace(/[A-Z$]/g, '')}</text></g></>}
              {[0, .33, .66, 1].map((part) => { const index = chart.start + Math.round((chart.visibleCount - 1) * part), date = new Date(timeAtIndex(index)); return <text key={part} x={chart.x(index)} y="642" textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'} className="axis-label">{date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()}</text>; })}
              <rect className="price-axis-hit" x={chart.width - chart.padding.right} y={chart.padding.top} width={chart.padding.right} height={chart.innerH} fill="transparent" />
            </svg>
            {loading && <div className="loading-state">Actualizando historial…</div>}
            {error && <div className="error-state">{error}</div>}
            {textPlacement && <div className="text-creator"><strong>Agregar texto</strong><input autoFocus value={newText} onChange={(event) => setNewText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addText(); if (event.key === 'Escape') setTextPlacement(null); }} placeholder="Escribe aquí…" /><div><button onClick={() => setTextPlacement(null)}>Cancelar</button><button onClick={addText} disabled={!newText.trim()}>Agregar</button></div></div>}
            {activeTool !== 'cursor' && <div className="drawing-tip"><Crosshair size={15} />{activeTool === 'hline' ? 'Haz clic para colocar la línea' : activeTool === 'text' ? 'Haz clic para agregar texto' : activeTool === 'fibext' ? (fibExtStage === 0 ? 'Primer clic: inicio del movimiento' : fibExtStage === 1 ? 'Segundo clic: final del movimiento' : 'Tercer clic: final del retroceso') : activeTool === 'ruler' ? (measurement ? 'Segundo clic para terminar la medición' : 'Primer clic para iniciar la medición') : 'Arrastra para dibujar'}</div>}
            {!showStudies && <div className="studies-hidden"><EyeOff size={15} /> Dibujos ocultos</div>}
            {selected && showStudies && <div className="drawing-editor"><strong>{selected.kind === 'text' ? 'Texto seleccionado' : 'Dibujo seleccionado'}</strong><label>Color <input type="color" value={selected.color} onChange={(event) => updateSelected({ color: event.target.value })} /></label><label>Opacidad <input className="style-range" type="range" min="10" max="100" value={Math.round((selected.opacity ?? 1) * 100)} onChange={(event) => updateSelected({ opacity: Number(event.target.value) / 100 })} /><output>{Math.round((selected.opacity ?? 1) * 100)}%</output></label>{selected.kind !== 'text' && <label>Grosor <input className="style-range" type="range" min="1" max="8" step=".5" value={selected.width ?? 2} onChange={(event) => updateSelected({ width: Number(event.target.value) })} /><output>{selected.width ?? 2}px</output></label>}{selected.kind === 'text' && <><label className="text-content-label">Texto <input className="text-content" value={selected.text ?? ''} onChange={(event) => updateSelected({ text: event.target.value })} /></label><label>Tamaño <input className="font-size" type="number" min="10" max="72" value={selected.fontSize ?? 18} onChange={(event) => updateSelected({ fontSize: Math.max(10, Math.min(72, Number(event.target.value))) })} /></label></>}<small>Arrastra para mover · usa el nodo derecho para redimensionar</small><button onClick={deleteSelected}><Trash2 size={15} /> Eliminar</button><button className="close-editor" onClick={() => setSelectedDrawing(null)}><X size={14} /></button></div>}
          </div>
          <div className="history-nav"><button onClick={() => setOffset(chart.maxOffset)}>Inicio</button><input aria-label="Desplazarse por el historial" type="range" min="0" max={chart.maxOffset - chart.minOffset} value={chart.maxOffset - Math.max(chart.minOffset, Math.min(offset, chart.maxOffset))} onChange={(event) => setOffset(chart.maxOffset - Number(event.target.value))} /><button onClick={() => setOffset(0)}>Ahora</button></div>
        </section>

        <aside className="watchlist">
          <div className="watchlist-header"><div><Star size={17} fill="currentColor" /><strong>Favoritos</strong></div><button onClick={() => setFavoritesOpen(false)}><PanelRightClose size={18} /></button></div>
          <div className="watchlist-columns"><span>Activo</span><span>Último</span><span>Cambio</span></div>
          <div className="watchlist-items">{favorites.map((id) => catalog.find((item) => item.symbol === id)).filter(Boolean).map((item) => <div className={`watch-row ${symbol === item!.symbol ? 'active' : ''}`} key={item!.symbol}><button onClick={() => setSymbol(item!.symbol)}><AssetIcon asset={item!} /><span className="watch-name"><strong>{item!.symbol}</strong><small>{item!.category}</small></span><span className="watch-price">{item!.price ? formatPrice(item!.price).replace('$', '') : '—'}</span><span className={item!.change >= 0 ? 'positive' : 'negative'}>{item!.price ? `${item!.change >= 0 ? '+' : ''}${item!.change.toFixed(2)}%` : '—'}</span></button><button className="remove-favorite" onClick={() => setFavorites((list) => list.filter((entry) => entry !== item!.symbol))} aria-label={`Quitar ${item!.symbol} de favoritos`}><X size={13} /></button></div>)}</div>
          <button className="add-favorite" onClick={() => setAssetMenu(true)}><Plus size={16} /> Buscar y agregar activo</button>
          <div className="live-quote"><span>Activo en pantalla</span><div><AssetIcon asset={asset} size="large" /><p><strong>{symbol}</strong><small>{market.exchange} · actualización cada 15 s</small></p></div><b>{formatPrice(market.price, market.currency)}</b><em className={market.change >= 0 ? 'positive' : 'negative'}>{market.change >= 0 ? '+' : ''}{market.change.toFixed(2)}%</em></div>
        </aside>
        {!favoritesOpen && <button className="open-watchlist edge-button" onClick={() => setFavoritesOpen(true)}><PanelRightOpen size={18} /></button>}
      </section>
    </main>
  );
}

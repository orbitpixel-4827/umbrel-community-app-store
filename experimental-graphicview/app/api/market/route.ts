import { NextRequest, NextResponse } from 'next/server';

type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };

const FRAME = {
  '4H': { bitfinex: '4h', yahooInterval: '1h', yahooRange: '2y', group: 4 },
  '1D': { bitfinex: '1D', yahooInterval: '1d', yahooRange: 'max', group: 1 },
  '1S': { bitfinex: '1W', yahooInterval: '1wk', yahooRange: 'max', group: 1 },
} as const;

function aggregate(candles: Candle[], size: number) {
  if (size === 1) return candles;
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i += size) {
    const part = candles.slice(i, i + size);
    if (!part.length) continue;
    result.push({
      time: part[0].time,
      open: part[0].open,
      high: Math.max(...part.map((c) => c.high)),
      low: Math.min(...part.map((c) => c.low)),
      close: part.at(-1)!.close,
      volume: part.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return result;
}

async function bitfinex(frame: keyof typeof FRAME, compact: boolean) {
  if (compact) {
    const response = await fetch('https://api-pub.bitfinex.com/v2/ticker/tBTCUSD', { cache: 'no-store' });
    if (!response.ok) throw new Error('Bitfinex no respondió');
    const ticker = await response.json() as number[];
    return { symbol: 'BTCUSD', name: 'Bitcoin / Dólar', exchange: 'Bitfinex', currency: 'USD', price: ticker[6], change: ticker[5] * 100, candles: [] };
  }
  const interval = FRAME[frame].bitfinex;
  const duration = frame === '4H' ? 14_400_000 : frame === '1D' ? 86_400_000 : 604_800_000;
  const all: number[][] = [];
  let start = 1_360_000_000_000;
  for (let page = 0; page < 8 && start < Date.now(); page += 1) {
    const url = `https://api-pub.bitfinex.com/v2/candles/trade:${interval}:tBTCUSD/hist?limit=5000&sort=1&start=${start}`;
    const response = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 300 } });
    if (!response.ok) throw new Error('Bitfinex no respondió');
    const rows = await response.json() as number[][];
    if (!rows.length) break;
    all.push(...rows);
    start = rows.at(-1)![0] + duration;
    if (rows.length < 5000) break;
  }
  const candles = all.map((row) => ({ time: row[0], open: row[1], close: row[2], high: row[3], low: row[4], volume: row[5] }));
  const last = candles.at(-1)!;
  const previous = candles.at(-2)?.close ?? last.open;
  return { symbol: 'BTCUSD', name: 'Bitcoin / Dólar', exchange: 'Bitfinex', currency: 'USD', price: last.close, change: ((last.close - previous) / previous) * 100, candles };
}

async function yahoo(symbol: string, frame: keyof typeof FRAME, compact: boolean) {
  const config = FRAME[frame];
  const interval = compact ? '1m' : config.yahooInterval;
  const range = compact ? '1d' : config.yahooRange;
  const period = !compact && (frame === '1D' || frame === '1S')
    ? `period1=0&period2=${Math.floor(Date.now() / 1000)}`
    : `range=${range}`;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${period}&interval=${interval}&events=div%2Csplits`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 Mercado/1.0', accept: 'application/json' },
    ...(compact ? { cache: 'no-store' as const } : { next: { revalidate: 300 } }),
  });
  if (!response.ok) throw new Error('No pudimos obtener este activo');
  const json = await response.json() as any;
  const result = json.chart?.result?.[0];
  if (!result) throw new Error('Activo no disponible');
  const meta = result.meta;
  if (compact) return { symbol, name: meta.longName ?? meta.shortName ?? symbol, exchange: meta.fullExchangeName ?? meta.exchangeName, currency: meta.currency ?? 'USD', price: meta.regularMarketPrice, change: meta.regularMarketChangePercent ?? 0, candles: [] };
  const quote = result.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = (result.timestamp ?? []).flatMap((time: number, index: number) => {
    const open = quote.open?.[index], high = quote.high?.[index], low = quote.low?.[index], close = quote.close?.[index];
    return [open, high, low, close].every((value) => typeof value === 'number')
      ? [{ time: time * 1000, open, high, low, close, volume: quote.volume?.[index] ?? 0 }]
      : [];
  });
  const grouped = aggregate(candles, config.group);
  const current = meta.regularMarketPrice ?? grouped.at(-1)?.close ?? 0;
  const previous = meta.chartPreviousClose ?? grouped.at(-2)?.close ?? current;
  return {
    symbol,
    name: meta.longName ?? meta.shortName ?? symbol,
    exchange: meta.fullExchangeName ?? meta.exchangeName,
    currency: meta.currency ?? 'USD',
    price: current,
    change: meta.regularMarketChangePercent ?? (previous ? ((current - previous) / previous) * 100 : 0),
    candles: grouped,
  };
}

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get('symbol') ?? 'BTCUSD').trim().toUpperCase();
  const requestedFrame = request.nextUrl.searchParams.get('timeframe') ?? '1D';
  const frame = (requestedFrame in FRAME ? requestedFrame : '1D') as keyof typeof FRAME;
  const compact = request.nextUrl.searchParams.get('compact') === '1';
  if (!/^[A-Z0-9.^=-]{1,20}$/.test(symbol)) return NextResponse.json({ error: 'Símbolo no válido' }, { status: 400 });
  try {
    const data = symbol === 'BTCUSD' ? await bitfinex(frame, compact) : await yahoo(symbol, frame, compact);
    return NextResponse.json(data, { headers: { 'Cache-Control': compact ? 'no-store' : 'public, max-age=60, s-maxage=300' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Datos no disponibles' }, { status: 502 });
  }
}

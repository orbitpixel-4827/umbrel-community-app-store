import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();
  if (query.length < 1 || query.length > 80) return NextResponse.json({ results: [] });
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=30&newsCount=0&enableFuzzyQuery=true`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 Mercado/1.0', accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) throw new Error('Búsqueda no disponible');
    const data = await response.json() as any;
    const allowed = new Set(['EQUITY', 'ETF', 'INDEX']);
    const results = (data.quotes ?? [])
      .filter((item: any) => allowed.has(item.quoteType) && item.symbol && (item.longname || item.shortname))
      .map((item: any) => ({
        symbol: item.symbol,
        name: item.longname ?? item.shortname,
        exchange: item.exchDisp ?? item.exchange,
        category: item.quoteType === 'INDEX' ? 'Índice' : item.quoteType === 'ETF' ? 'ETF' : 'Acción',
      }));
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' } });
  } catch {
    return NextResponse.json({ results: [], error: 'Búsqueda no disponible' }, { status: 502 });
  }
}

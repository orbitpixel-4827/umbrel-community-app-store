import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const dataDir = process.env.MERCADO_DATA_DIR || '/data';
const stateFile = path.join(dataDir, 'workspace.json');

export async function GET() {
  try {
    const state = JSON.parse(await readFile(stateFile, 'utf8'));
    return NextResponse.json({ state }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return NextResponse.json({ state: null });
    return NextResponse.json({ error: 'No se pudo leer el espacio de trabajo' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const state = await request.json();
    if (!state || typeof state !== 'object' || Array.isArray(state)) return NextResponse.json({ error: 'Estado no válido' }, { status: 400 });
    await mkdir(dataDir, { recursive: true });
    const temporary = `${stateFile}.tmp`;
    await writeFile(temporary, JSON.stringify(state), 'utf8');
    await rename(temporary, stateFile);
    return NextResponse.json({ saved: true });
  } catch {
    return NextResponse.json({ error: 'No se pudo guardar el espacio de trabajo' }, { status: 500 });
  }
}

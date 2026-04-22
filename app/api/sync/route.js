import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

let syncState = { running: false, startedAt: null };

export async function GET() {
  return NextResponse.json(syncState);
}

export async function POST() {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return NextResponse.json({
      success: false,
      message: 'Sync não disponível em produção. Corre localmente: node scratch/sync_once.js'
    });
  }

  if (syncState.running) {
    return NextResponse.json({ success: false, message: 'Sync já em progresso...' });
  }

  syncState = { running: true, startedAt: new Date().toISOString() };

  try {
    // eval('require') esconde o require do analisador estático do Turbopack
    // eslint-disable-next-line no-eval
    const req = eval('require');
    const { execFile } = req('child_process');
    const { join } = req('path');
    const scriptPath = join(process.cwd(), 'scratch', 'sync_once.js');

    const child = execFile('node', [scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    });

    child.unref();

    child.on('exit', (code) => {
      syncState = { running: false, startedAt: null };
      console.log(`[SYNC] Terminou com código ${code}`);
    });

    child.on('error', (err) => {
      syncState = { running: false, startedAt: null };
      console.error('[SYNC] Erro:', err.message);
    });
  } catch (err) {
    syncState = { running: false, startedAt: null };
    console.error('[SYNC] Erro ao iniciar:', err.message);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: 'Sync iniciado! A recolher dados do Flashscore + SofaScore...'
  });
}

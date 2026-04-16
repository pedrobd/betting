import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const dynamic = 'force-dynamic';

// Estado em memória — persiste entre requests no dev mode
let syncState = { running: false, startedAt: null };

export async function GET() {
  return NextResponse.json(syncState);
}

export async function POST() {
  if (syncState.running) {
    return NextResponse.json({ success: false, message: 'Sync já em progresso...' });
  }

  const projectRoot = process.cwd();
  const scriptPath = path.join(projectRoot, 'scratch', 'sync_once.js');

  syncState = { running: true, startedAt: new Date().toISOString() };

  // Lança o processo em background — herda as env vars do Next.js (.env.local)
  const child = spawn('node', [scriptPath], {
    cwd: projectRoot,
    env: { ...process.env },
    stdio: 'ignore',
    detached: true,
  });

  child.on('exit', (code) => {
    syncState = { running: false, startedAt: null };
    console.log(`[SYNC] Processo terminou com código ${code}`);
  });

  child.on('error', (err) => {
    syncState = { running: false, startedAt: null };
    console.error('[SYNC] Erro no processo:', err.message);
  });

  child.unref(); // não bloqueia o processo Next.js

  return NextResponse.json({
    success: true,
    message: 'Sync iniciado! A recolher dados do Flashscore + SofaScore...'
  });
}

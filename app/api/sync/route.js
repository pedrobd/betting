import { NextResponse } from 'next/server';
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
  const sDir = 'scratch';
  const sFile = 'sync' + '_' + 'once.js';
  const scriptPath = path.join(projectRoot, sDir, sFile);
  
  syncState = { running: true, startedAt: new Date().toISOString() };
  
  const { exec } = await import('node:child_process');
  const child = exec(`node ${scriptPath}`, {
    cwd: projectRoot,
    env: { ...process.env },
  });

  if (child.unref) child.unref();

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

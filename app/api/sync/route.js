import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Estado em memória — persiste entre requests no mesmo processo Node
let syncState = { running: false, startedAt: null };

export async function GET() {
  return NextResponse.json(syncState);
}

export async function POST() {
  // Sync não funciona em Vercel/serverless — só em ambiente local com Node
  if (process.env.VERCEL) {
    return NextResponse.json({
      success: false,
      message: 'Sync manual não disponível em produção. Use o script local: node scratch/sync_once.js'
    });
  }

  if (syncState.running) {
    return NextResponse.json({ success: false, message: 'Sync já em progresso...' });
  }

  syncState = { running: true, startedAt: new Date().toISOString() };

  // Dynamic import mantém child_process fora do bundle do Vercel
  const childProcess = await import(/* webpackIgnore: true */ 'child_process');
  const nodePath = await import(/* webpackIgnore: true */ 'path');

  const projectRoot = process.cwd();
  const scriptPath = nodePath.default.join(projectRoot, 'scratch', 'sync_once.js');

  const child = childProcess.exec(`node --experimental-vm-modules "${scriptPath}"`, {
    cwd: projectRoot,
    env: { ...process.env },
  });

  child.unref();

  child.on('exit', (code) => {
    syncState = { running: false, startedAt: null };
    console.log(`[SYNC] Processo terminou com código ${code}`);
  });

  child.on('error', (err) => {
    syncState = { running: false, startedAt: null };
    console.error('[SYNC] Erro no processo:', err.message);
  });

  return NextResponse.json({
    success: true,
    message: 'Sync iniciado! A recolher dados do Flashscore + SofaScore...'
  });
}

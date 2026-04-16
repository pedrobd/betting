@echo off
:: BetMask Sync Automático — Headless (sem janela Chrome)
:: Corre via Task Scheduler de 2 em 2 horas
cd /d "c:\Users\Pedro\Documents\Meu\betting"
set CI=true
echo [%date% %time%] A iniciar BetMask Sync (headless)... >> sync_log.txt
node --env-file=.env.local scratch/sync_once.js >> sync_log.txt 2>&1
echo [%date% %time%] Sync concluido. >> sync_log.txt

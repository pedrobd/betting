/**
 * Testa o fix do SofaScore para confirmar que retorna dados reais.
 * Executar: node scratch/test_sofa_fix.js
 */
import { getTeamStats } from '../lib/sofascore.js';

const testTeams = [
    'Lanus (Arg)',
    'Always Ready (Bol)',
    'Strasbourg',
    'Mainz',
    'Aston Villa',
    'Bologna',
    'Atletico-MG (Bra)',
    'Juventud (Uru)',
    'Tigre (Arg)',
    'Macara (Ecu)',
];

console.log('🧪 Testando SofaScore Fix...\n');
console.log('─'.repeat(60));

for (const team of testTeams) {
    try {
        const stats = await getTeamStats(team);
        const formOk = stats.form && !stats.form.includes('?') && stats.form.length > 0;
        const status = formOk ? '✅' : (stats.form === '' ? '⚠️ ' : '❌');
        console.log(`${status} ${team.padEnd(25)} → Forma: "${stats.form || '(vazio)'}" | Pos: #${stats.pos}`);
    } catch (e) {
        console.log(`❌ ${team.padEnd(25)} → ERRO: ${e.message}`);
    }
    // Rate limit
    await new Promise(r => setTimeout(r, 800));
}

console.log('\n─'.repeat(60));
console.log('✅ = Dados reais | ⚠️  = Vazio (equipa não encontrada) | ❌ = Erro');

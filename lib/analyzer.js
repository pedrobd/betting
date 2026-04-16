// ─── Sentimento de Notícias ──────────────────────────────────────────────────

export function analyzeTextSentiment(text) {
  const textLower = text.toLowerCase();

  const redFlags = ["lesão", "baixa", "castigo", "ausência", "ausente", "crise", "desfalque", "dúvida", "derrota", "tensão", "pressão", "não joga", "lesionado", "fora do jogo"];
  const greenFlags = ["vitória", "motivação", "titular", "recuperado", "goleada", "reforço", "favorito", "invicto", "líder", "confiante"];

  let score = 0;
  let foundRed = [];
  let foundGreen = [];

  redFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) { score -= (count * 4); foundRed.push(word); }
  });

  greenFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) { score += (count * 2); foundGreen.push(word); }
  });

  if (textLower.includes("estrela") || textLower.includes("capitão") || textLower.includes("melhor marcador")) {
      if (foundRed.length > 0) score -= 10;
  }

  score = Math.max(-35, Math.min(25, score));

  let reasoning = [];
  if (score < -10) {
      reasoning.push(`Alerta: Notícias negativas confirmadas (${[...new Set(foundRed)].slice(0, 3).join(', ')}).`);
  } else if (score > 8) {
      reasoning.push(`Ambiente muito favorável nas notícias.`);
  } else {
      reasoning.push("Sem alertas críticos nas notícias.");
  }

  return { sentimentModifier: score, reasoning: reasoning.join(' ') };
}

// ─── Forma ───────────────────────────────────────────────────────────────────

export function calculateFormScore(form) {
  if (!form || form.includes('?') || form.trim() === '') return 50;
  let score = 0;
  let count = 0;
  for (let char of form) {
      if (char === 'W') { score += 20; count++; }
      else if (char === 'D') { score += 10; count++; }
      else if (char === 'L') { score += 0; count++; }
  }
  return count > 0 ? Math.round((score / (count * 20)) * 100) : 50;
}

// ─── Value Bet & Expected Value ───────────────────────────────────────────────

/**
 * Calcula Expected Value percentual.
 * EV > 0 = aposta com valor positivo (edge sobre a casa)
 * EV = (confidence% * odd) - 1  → ex: confidence=65%, odd=1.60 → EV = 0.65*1.60-1 = 0.04 = +4%
 *
 * @param {number} odd
 * @param {number} confidence - 0-100
 * @returns {number} EV em percentagem (ex: 4.5 significa +4.5%)
 */
export function calculateEV(odd, confidence) {
  if (!odd || odd <= 1 || !confidence) return -99;
  const ev = (confidence / 100) * parseFloat(odd) - 1;
  return parseFloat((ev * 100).toFixed(2)); // em %
}

/**
 * Determina se é uma Value Bet.
 * Critérios:
 * 1. Confidence do sistema > probabilidade implícita da odd + 5% (edge mínimo)
 * 2. EV > +3% (valor esperado positivo real)
 * 3. xG home > xG away (equipa favorita tem vantagem estrutural)
 *
 * @param {number} odd
 * @param {number} confidence
 * @param {number} homeXg
 * @param {number} awayXg
 * @returns {{ isValueBet: boolean, ev: number, edge: number }}
 */
export function detectValueBet(odd, confidence, homeXg = 0, awayXg = 0) {
  const impliedProb = (1 / parseFloat(odd)) * 100;
  const edge = confidence - impliedProb; // % de vantagem sobre a casa
  const ev = calculateEV(odd, confidence);

  const hasProbEdge = edge >= 5;       // confiança > odd implícita + 5%
  const hasPositiveEV = ev >= 3;        // EV mínimo de +3%
  const hasXgEdge = homeXg === 0 || homeXg > awayXg * 0.9; // xG neutro ou favorável

  const isValueBet = hasProbEdge && hasPositiveEV && hasXgEdge;

  return { isValueBet, ev, edge: parseFloat(edge.toFixed(1)) };
}

// ─── Confidence ───────────────────────────────────────────────────────────────

export function calculateConfidence(odd, homeForm, awayForm, sentimentModifier, homePos, awayPos, oddTrend, homeXg = 0, awayXg = 0) {
  let impliedProb = 50.0;
  if (odd && odd > 0) impliedProb = (1 / parseFloat(odd)) * 100;

  const homeScore = calculateFormScore(homeForm);
  const awayScore = calculateFormScore(awayForm);
  const formAdvantage = (homeScore - awayScore) / 10;

  // Bónus de posição (motivação)
  let motivationBonus = 0;
  if (homePos > 0 && awayPos > 0) {
      const gap = awayPos - homePos;
      if (gap > 5) motivationBonus = 3;
      if (gap > 10) motivationBonus = 6;
      if (gap < -5) motivationBonus = -4;
  }

  // Modificador xG (mais robusto que forma bruta)
  let xgBonus = 0;
  if (homeXg > 0 && awayXg > 0) {
      const xgDiff = homeXg - awayXg;
      if (xgDiff > 0.5) xgBonus = 4;
      else if (xgDiff > 0.2) xgBonus = 2;
      else if (xgDiff < -0.5) xgBonus = -5;
      else if (xgDiff < -0.2) xgBonus = -2;
  }

  // Tendência da odd
  let trendModifier = 0;
  if (oddTrend === 'dropping') trendModifier = 5;
  if (oddTrend === 'rising') trendModifier = -8;

  let finalConfidence = impliedProb + formAdvantage + motivationBonus + trendModifier + (sentimentModifier * 0.3) + xgBonus;
  finalConfidence = Math.max(5, Math.min(98, finalConfidence));

  return parseFloat(finalConfidence.toFixed(1));
}

// ─── Reasoning ───────────────────────────────────────────────────────────────

export function constructReasoning(odd, homeForm, awayForm, finalConfidence, sentimentReasoning, homePos, awayPos, oddTrend, homeXg = 0, awayXg = 0) {
  let reasons = [];

  if (odd < 1.40) reasons.push("Super Favorito.");
  else if (odd <= 1.70) reasons.push("Favorito sólido.");

  if (oddTrend === 'dropping') reasons.push("Odd a cair (Smart Money).");
  if (oddTrend === 'rising') reasons.push("Atenção: Odd a subir (Risco).");

  if (homePos > 0 && awayPos > 0) {
      if (homePos < 4) reasons.push("Equipa luta pelo título.");
      if (awayPos > 15) reasons.push("Oponente na zona de descida.");
  }

  if (homeForm && !homeForm.includes('?') && homeForm.startsWith('WW')) reasons.push("Momento de forma excelente.");
  if (homeForm && !homeForm.includes('?') && homeForm.startsWith('LL')) reasons.push("Equipa em má forma recente.");

  // xG insights
  if (homeXg > 0 && awayXg > 0) {
      if (homeXg > awayXg + 0.5) reasons.push(`xG favorável (${homeXg} vs ${awayXg}).`);
      else if (awayXg > homeXg + 0.5) reasons.push(`xG adverso (${homeXg} vs ${awayXg}).`);
  }

  reasons.push(sentimentReasoning);
  return reasons.join(' | ');
}

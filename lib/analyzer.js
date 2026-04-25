// ─── Modelo Poisson + Dixon-Coles ────────────────────────────────────────────

function poissonProb(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// Fator de correção Dixon-Coles: ajusta a probabilidade conjunta para resultados
// baixos (0-0, 1-0, 0-1, 1-1) onde o Poisson standard sobrestima/subestima.
// ρ ≈ -0.13 calibrado empiricamente (Dixon & Coles, 1997)
const DC_RHO = -0.13;

function dixonColesTau(i, j, lambdaH, lambdaA) {
  if (i === 0 && j === 0) return 1 - lambdaH * lambdaA * DC_RHO;
  if (i === 1 && j === 0) return 1 + lambdaA * DC_RHO;
  if (i === 0 && j === 1) return 1 + lambdaH * DC_RHO;
  if (i === 1 && j === 1) return 1 - DC_RHO;
  return 1;
}

const HOME_ADVANTAGE = 0.3;

/**
 * Probabilidades via Poisson com correção Dixon-Coles.
 * Renormaliza após a correção para garantir que a soma é 100%.
 */
export function calculatePoissonProbabilities(homeXg, awayXg) {
  if (!homeXg || !awayXg || homeXg <= 0 || awayXg <= 0) return null;

  const adjHomeXg = homeXg + HOME_ADVANTAGE;
  const adjAwayXg = Math.max(0.1, awayXg - HOME_ADVANTAGE * 0.5);

  let homeWin = 0, draw = 0, awayWin = 0, total = 0;
  const maxGoals = 9;

  for (let i = 0; i <= maxGoals; i++) {
    const pH = poissonProb(adjHomeXg, i);
    for (let j = 0; j <= maxGoals; j++) {
      const pA = poissonProb(adjAwayXg, j);
      const tau = dixonColesTau(i, j, adjHomeXg, adjAwayXg);
      const p = pH * pA * tau;
      if (i > j) homeWin += p;
      else if (i === j) draw += p;
      else awayWin += p;
      total += p;
    }
  }

  // Renormaliza — a correção DC altera ligeiramente a soma total
  if (total > 0) { homeWin /= total; draw /= total; awayWin /= total; }

  return {
    homeWin: parseFloat((homeWin * 100).toFixed(1)),
    draw: parseFloat((draw * 100).toFixed(1)),
    awayWin: parseFloat((awayWin * 100).toFixed(1)),
  };
}

// ─── Remoção de Margem do Bookmaker ──────────────────────────────────────────

/**
 * Remove a margem do bookmaker das odds brutas.
 * Devolve probabilidades "fair" (sem over-round) e a margem em %.
 * Requer os três resultados possíveis: vitória casa, empate, vitória fora.
 */
export function removeBkMargin(odd1, oddX, odd2) {
  if (!odd1 || !oddX || !odd2 || odd1 <= 1 || oddX <= 1 || odd2 <= 1) return null;
  const p1 = 1 / odd1;
  const pX = 1 / oddX;
  const p2 = 1 / odd2;
  const overround = p1 + pX + p2;
  return {
    fairHome: parseFloat(((p1 / overround) * 100).toFixed(2)),
    fairDraw: parseFloat(((pX / overround) * 100).toFixed(2)),
    fairAway: parseFloat(((p2 / overround) * 100).toFixed(2)),
    margin: parseFloat(((overround - 1) * 100).toFixed(1)),
  };
}

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
  const chars = form.split('');
  const n = chars.length;
  let score = 0, totalWeight = 0;
  chars.forEach((c, i) => {
    const weight = i + 1;
    const pts = c === 'W' ? 1 : c === 'D' ? 0.5 : 0;
    score += pts * weight;
    totalWeight += weight;
  });
  return totalWeight > 0 ? Math.round((score / totalWeight) * 100) : 50;
}

// ─── Value Bet & Expected Value ───────────────────────────────────────────────

/**
 * EV = (confiança% × odd_bruta) - 1
 * Usa a odd bruta propositalmente: queremos saber o retorno real ao apostar nessa odd.
 */
export function calculateEV(odd, confidence) {
  if (!odd || odd <= 1 || !confidence) return -99;
  const ev = (confidence / 100) * parseFloat(odd) - 1;
  return parseFloat((ev * 100).toFixed(2));
}

/**
 * Detecta Value Bet usando probabilidade fair (sem margem do bookmaker).
 * Requer oddDraw e oddAway para remover a margem com precisão.
 */
export function detectValueBet(odd, confidence, homeXg = 0, awayXg = 0, oddDraw = 0, oddAway = 0) {
  const fairProbs = removeBkMargin(odd, oddDraw, oddAway);
  const impliedProb = fairProbs ? fairProbs.fairHome : (1 / parseFloat(odd)) * 100;

  const edge = confidence - impliedProb;
  const ev = calculateEV(odd, confidence);

  const hasProbEdge = edge >= 5;
  const hasPositiveEV = ev >= 3;

  const poisson = calculatePoissonProbabilities(homeXg, awayXg);
  const hasXgEdge = poisson
    ? poisson.homeWin > impliedProb * 0.95
    : (homeXg === 0 || homeXg > awayXg * 0.9);

  const isValueBet = hasProbEdge && hasPositiveEV && hasXgEdge;

  return {
    isValueBet,
    ev,
    edge: parseFloat(edge.toFixed(1)),
    poisson,
    margin: fairProbs?.margin ?? null,
  };
}

// ─── Confidence ───────────────────────────────────────────────────────────────

/**
 * @param {number} oddDraw - odd empate (necessária para remover margem)
 * @param {number} oddAway - odd vitória fora (necessária para remover margem)
 */
export function calculateConfidence(odd, homeForm, awayForm, sentimentModifier, homePos, awayPos, oddTrend, homeXg = 0, awayXg = 0, h2h = [], homeVenueForm = '', awayVenueForm = '', oddDraw = 0, oddAway = 0) {
  const hasXg = homeXg > 0 && awayXg > 0;
  const homeFormLen = (homeVenueForm || homeForm || '').replace(/[^WDL]/g, '').length;
  const awayFormLen = (awayVenueForm || awayForm || '').replace(/[^WDL]/g, '').length;
  const hasEnoughForm = homeFormLen >= 3 && awayFormLen >= 3;
  const dataPenalty = (!hasXg ? -5 : 0) + (!hasEnoughForm ? -6 : 0);

  // Probabilidade implícita fair (sem margem do bookmaker quando possível)
  let impliedProb = 50.0;
  const fairProbs = removeBkMargin(odd, oddDraw, oddAway);
  if (fairProbs) {
    impliedProb = fairProbs.fairHome;
  } else if (odd && odd > 0) {
    impliedProb = (1 / parseFloat(odd)) * 100;
  }

  const homeFormScore = calculateFormScore(homeVenueForm || homeForm);
  const awayFormScore = calculateFormScore(awayVenueForm || awayForm);
  const formAdvantage = (homeFormScore - awayFormScore) / 10;

  let motivationBonus = 0;
  if (homePos > 0 && awayPos > 0) {
    const gap = awayPos - homePos;
    if (gap > 5) motivationBonus = 3;
    if (gap > 10) motivationBonus = 6;
    if (gap < -5) motivationBonus = -4;
  }

  // Poisson Dixon-Coles: mistura com probabilidade implícita quando há desacordo forte
  let xgBonus = 0;
  const poisson = calculatePoissonProbabilities(homeXg, awayXg);
  if (poisson) {
    const poissonEdge = poisson.homeWin - impliedProb;
    const disagreement = Math.abs(poissonEdge);
    if (disagreement > 15) {
      const blendWeight = Math.min(0.7, (disagreement - 15) / 40 + 0.3);
      impliedProb = impliedProb * (1 - blendWeight) + poisson.homeWin * blendWeight;
    }
    xgBonus = Math.max(-10, Math.min(8, poissonEdge * 0.3));
  } else if (homeXg > 0 && awayXg > 0) {
    const xgDiff = homeXg - awayXg;
    if (xgDiff > 0.5) xgBonus = 4;
    else if (xgDiff > 0.2) xgBonus = 2;
    else if (xgDiff < -0.5) xgBonus = -5;
    else if (xgDiff < -0.2) xgBonus = -2;
  }

  let trendModifier = 0;
  if (oddTrend === 'dropping') trendModifier = 5;
  if (oddTrend === 'rising') trendModifier = -8;

  let h2hBonus = 0;
  if (h2h && h2h.length >= 3) {
    const wins = h2h.filter(r => r.result === 'W').length;
    const rate = wins / h2h.length;
    if (rate >= 0.8) h2hBonus = 5;
    else if (rate >= 0.6) h2hBonus = 3;
    else if (rate <= 0.2) h2hBonus = -4;
    else if (rate <= 0.4) h2hBonus = -2;
  }

  let finalConfidence = impliedProb + formAdvantage + motivationBonus + trendModifier + (sentimentModifier * 0.3) + xgBonus + h2hBonus + dataPenalty;
  finalConfidence = Math.max(5, Math.min(98, finalConfidence));

  return parseFloat(finalConfidence.toFixed(1));
}

// ─── Reasoning ───────────────────────────────────────────────────────────────

export function constructReasoning(odd, homeForm, awayForm, finalConfidence, sentimentReasoning, homePos, awayPos, oddTrend, homeXg = 0, awayXg = 0, h2h = []) {
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

  if (homeXg > 0 && awayXg > 0) {
    const poisson = calculatePoissonProbabilities(homeXg, awayXg);
    if (poisson) {
      reasons.push(`Poisson DC: ${poisson.homeWin}% vitória / ${poisson.draw}% empate / ${poisson.awayWin}% derrota.`);
    }
    if (homeXg > awayXg + 0.5) reasons.push(`xG favorável (${homeXg} vs ${awayXg}).`);
    else if (awayXg > homeXg + 0.5) reasons.push(`xG adverso (${homeXg} vs ${awayXg}).`);
  }

  if (h2h && h2h.length >= 3) {
    const wins = h2h.filter(r => r.result === 'W').length;
    if (wins >= 4) reasons.push(`Domina H2H (${wins}/${h2h.length} vitórias directas).`);
    else if (wins <= 1) reasons.push(`H2H desfavorável (${wins}/${h2h.length} vitórias).`);
  }

  reasons.push(sentimentReasoning);
  return reasons.join(' | ');
}

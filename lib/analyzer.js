export function analyzeTextSentiment(text) {
  const textLower = text.toLowerCase();
  
  const redFlags = ["lesão", "baixa", "castigo", "ausência", "ausente", "crise", "desfalque", "dúvida", "derrota", "tensão", "pressão", "não joga", "lesionado", "fora do jogo"];
  const greenFlags = ["vitória", "motivação", "titular", "recuperado", "goleada", "reforço", "favorito", "invicto", "líder", "confiante"];

  let score = 0;
  let foundRed = [];
  let foundGreen = [];
  
  redFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) {
          score -= (count * 4);
          foundRed.push(word);
      }
  });

  greenFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) {
          score += (count * 2);
          foundGreen.push(word);
      }
  });

  // Player Absence Bonus/Penalty
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

  return {
      sentimentModifier: score,
      reasoning: reasoning.join(' ')
  };
}

export function calculateFormScore(form) {
  if (!form || form.includes('?')) return 50;
  let score = 0;
  for (let char of form) {
      if (char === 'W') score += 20;
      if (char === 'D') score += 10;
      if (char === 'L') score += 0;
  }
  return score;
}

export function calculateConfidence(odd, homeForm, awayForm, sentimentModifier, homePos, awayPos, oddTrend) {
  let impliedProb = 50.0;
  if (odd && odd > 0) {
      impliedProb = (1 / parseFloat(odd)) * 100;
  }

  const homeScore = calculateFormScore(homeForm);
  const awayScore = calculateFormScore(awayForm);
  const formAdvantage = (homeScore - awayScore) / 10; 

  // 1. Motivation Modifier (League Position)
  let motivationBonus = 0;
  if (homePos > 0 && awayPos > 0) {
      const gap = awayPos - homePos;
      if (gap > 5) motivationBonus = 3;
      if (gap > 10) motivationBonus = 6;
      if (gap < -5) motivationBonus = -4;
  }

  // 2. Trend Modifier (Dropping Odds)
  let trendModifier = 0;
  if (oddTrend === 'dropping') trendModifier = 5;
  if (oddTrend === 'rising') trendModifier = -8;

  // Cálculo: Base (100% da Odd) + Modificadores
  let finalConfidence = impliedProb + formAdvantage + motivationBonus + trendModifier + (sentimentModifier * 0.3);
  
  finalConfidence = Math.max(5, Math.min(98, finalConfidence));
  
  return parseFloat(finalConfidence.toFixed(1));
}

export function constructReasoning(odd, homeForm, awayForm, finalConfidence, sentimentReasoning, homePos, awayPos, oddTrend) {
  let reasons = [];
  
  if (odd < 1.40) reasons.push("Super Favorito.");
  else if (odd <= 1.70) reasons.push("Favorito sólido.");

  if (oddTrend === 'dropping') reasons.push("Odd a cair (Smart Money).");
  if (oddTrend === 'rising') reasons.push("Atenção: Odd a subir (Risco).");

  if (homePos > 0 && awayPos > 0) {
      if (homePos < 4) reasons.push("Equipa luta pelo título.");
      if (awayPos > 15) reasons.push("Oponente na zona de descida.");
  }

  if (homeForm && homeForm.startsWith('WW')) reasons.push("Momento de forma excelente.");
      
  reasons.push(sentimentReasoning);
  return reasons.join(' | ');
}

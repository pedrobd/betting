export function analyzeTextSentiment(text) {
  const textLower = text.toLowerCase();
  
  const redFlags = ["lesão", "baixa", "castigo", "ausência", "ausente", "crise", "desfalque", "dúvida", "derrota", "tensão", "pressão"];
  const greenFlags = ["vitória", "motivação", "titular", "recuperado", "goleada", "reforço", "favorito", "invicto", "líder"];

  let score = 0;
  let foundRed = [];
  let foundGreen = [];
  
  redFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) {
          score -= (count * 5);
          foundRed.push(word);
      }
  });

  greenFlags.forEach(word => {
      const count = (textLower.match(new RegExp(word, 'g')) || []).length;
      if (count > 0) {
          score += (count * 3);
          foundGreen.push(word);
      }
  });

  // Limits
  score = Math.max(-30, Math.min(20, score));
  
  let reasoning = [];
  if (score < 0) {
      reasoning.push(`Notícias com sinais de alarme (${[...new Set(foundRed)].join(', ')}).`);
  } else if (score > 5) {
      reasoning.push(`Momento positivo em notícias (${[...new Set(foundGreen)].join(', ')}).`);
  } else {
      reasoning.push("Análise de notícias sem red-flags.");
  }

  return {
      sentimentModifier: score,
      reasoning: reasoning.join(' ')
  };
}

export function calculateConfidence(odd, formWonPercentage, sentimentModifier) {
  let impliedProb = 50.0;
  if (odd && odd > 0) {
      impliedProb = (1 / parseFloat(odd)) * 100;
  }

  const baseConfidence = (impliedProb * 0.70) + (formWonPercentage * 0.30);
  let finalConfidence = baseConfidence + sentimentModifier;
  
  finalConfidence = Math.max(0, Math.min(100, finalConfidence));
  
  return parseFloat(finalConfidence.toFixed(1));
}

export function constructReasoning(odd, finalConfidence, sentimentReasoning) {
  let reasons = [];
  
  if (odd < 1.40) {
      reasons.push("Super Favorito no mercado.");
  } else if (odd <= 1.70) {
      reasons.push("Favorito sólido na equipa da casa.");
  }
      
  if (finalConfidence > 80.0) {
      reasons.push("Confiança global muito elevada.");
  } else if (finalConfidence < 50.0) {
      reasons.push("Cuidado: Fatores externos baixaram o potencial desta aposta.");
  }
      
  reasons.push(sentimentReasoning);
  return reasons.join(' | ');
}

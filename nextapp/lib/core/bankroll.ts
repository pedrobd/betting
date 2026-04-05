// ============================================================
// BankrollManager - Financial Risk Management Core
// Implements Kelly Criterion + Stop-Loss logic
// ============================================================

import { getBanca, updateSaldo } from "./database";
import type {
  BankrollState,
  KellyInput,
  KellyResult,
  StakeMethod,
} from "../types";

const STOP_LOSS_THRESHOLD = 0.05;  // 5% of opening day balance
const KELLY_FRACTION = 0.25;       // Fractional Kelly (conservative)
const UNIT_PERCENTAGE = 0.01;      // 1 unit = 1% of bankroll

// ============================================================
// Core Kelly Calculation
// f* = (p * (b - 1) - (1 - p)) / b
// ============================================================

export function calcularKelly(input: KellyInput): KellyResult {
  const { probability: p, odds: b } = input;

  if (p <= 0 || p >= 1) {
    return { fraction: 0, approved: false, reason: "Probabilidade inválida (deve ser 0 < p < 1)" };
  }
  if (b <= 1) {
    return { fraction: 0, approved: false, reason: "Odds inválidas (devem ser > 1.0)" };
  }

  const f = (p * (b - 1) - (1 - p)) / b;
  const fFracional = f * KELLY_FRACTION;

  if (f <= 0) {
    return {
      fraction: 0,
      approved: false,
      reason: `Kelly negativo (f*=${f.toFixed(4)}). Valor esperado negativo — aposta recusada.`,
    };
  }

  return {
    fraction: fFracional,
    approved: true,
  };
}

// ============================================================
// BankrollManager Class
// ============================================================

export class BankrollManager {
  private state: BankrollState | null = null;

  // Load current bankroll state from Supabase
  async load(): Promise<BankrollState> {
    const banca = await getBanca();

    const perda = banca.perda_diaria_atual;
    const limite = banca.saldo_inicio_dia * STOP_LOSS_THRESHOLD;

    this.state = {
      saldo: banca.saldo_atual,
      saldoInicioDia: banca.saldo_inicio_dia,
      perdaDiaria: perda,
      stopLossAtivo: perda >= limite,
      unidade: banca.saldo_atual * UNIT_PERCENTAGE,
    };

    return this.state;
  }

  // Get cached state (requires load() first)
  getState(): BankrollState {
    if (!this.state) throw new Error("BankrollManager não inicializado. Chama load() primeiro.");
    return this.state;
  }

  // ============================================================
  // Suggest stake based on method
  // ============================================================

  async sugerirStake(
    method: StakeMethod,
    kellyInput?: KellyInput
  ): Promise<{ valor: number; aprovado: boolean; motivo: string; metodo: StakeMethod }> {
    const state = await this.load();

    // ─── Stop-Loss Check ──────────────────────────────────
    if (state.stopLossAtivo) {
      const perdaPct = ((state.perdaDiaria / state.saldoInicioDia) * 100).toFixed(1);
      return {
        valor: 0,
        aprovado: false,
        motivo: `🛑 STOP-LOSS ATIVO: Perda diária de ${perdaPct}% (limite: 5%). Sem novas apostas hoje.`,
        metodo: method,
      };
    }

    // ─── Kelly Method ────────────────────────────────────
    if (method === "kelly") {
      if (!kellyInput) throw new Error("KellyInput é necessário para método Kelly.");

      const kelly = calcularKelly(kellyInput);

      if (!kelly.approved) {
        return {
          valor: 0,
          aprovado: false,
          motivo: kelly.reason ?? "Kelly recusado.",
          metodo: "kelly",
        };
      }

      const valor = parseFloat((state.saldo * kelly.fraction).toFixed(2));
      return {
        valor,
        aprovado: true,
        motivo: `Kelly Fracionado (${(KELLY_FRACTION * 100).toFixed(0)}%): f*=${kelly.fraction.toFixed(4)} → ${valor}€ de banca ${state.saldo}€`,
        metodo: "kelly",
      };
    }

    // ─── Units Method (default) ──────────────────────────
    const valor = parseFloat(state.unidade.toFixed(2));
    return {
      valor,
      aprovado: true,
      motivo: `1 Unidade (1% da banca): ${valor}€ de banca ${state.saldo}€`,
      metodo: "units",
    };
  }

  // ============================================================
  // Update bankroll after result
  // ============================================================

  async aplicarResultado(lucro_prejuizo: number): Promise<void> {
    const state = await this.load();
    const novoSaldo = parseFloat((state.saldo + lucro_prejuizo).toFixed(2));
    await updateSaldo(novoSaldo);
    this.state = null; // Invalidate cache
  }

  // ============================================================
  // Summary log (human-readable)
  // ============================================================

  async summary(): Promise<string> {
    const state = await this.load();
    const perdaPct = ((state.perdaDiaria / state.saldoInicioDia) * 100).toFixed(1);
    const stopStatus = state.stopLossAtivo ? "🔴 ATIVO" : "🟢 OK";

    return [
      `═══════════════════════════════`,
      `  BETANO ENGINE — BANCA REPORT`,
      `═══════════════════════════════`,
      `  Saldo Atual:      ${state.saldo.toFixed(2)}€`,
      `  Saldo Início Dia: ${state.saldoInicioDia.toFixed(2)}€`,
      `  Perda Diária:     ${state.perdaDiaria.toFixed(2)}€ (${perdaPct}%)`,
      `  Limite Stop-Loss: ${(state.saldoInicioDia * STOP_LOSS_THRESHOLD).toFixed(2)}€ (5%)`,
      `  Stop-Loss:        ${stopStatus}`,
      `  1 Unidade =       ${state.unidade.toFixed(2)}€`,
      `═══════════════════════════════`,
    ].join("\n");
  }
}

// ============================================================
// TelegramService - Alerts & Notifications
// Handles the communication with the user via Telegram Bot
// ============================================================

import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente para scripts offline
dotenv.config({ path: '.env.local' });

class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;

  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    this.chatId = process.env.TELEGRAM_CHAT_ID || null;

    if (token) {
      this.bot = new TelegramBot(token, { polling: false });
    } else {
      console.warn("[Telegram] ⚠️ Bot Token não configurado no .env.local");
    }
  }

  /**
   * Envia uma mensagem de texto simples ou com Markdown
   */
  async sendMessage(message: string): Promise<boolean> {
    if (!this.bot || !this.chatId) return false;
    try {
      await this.bot.sendMessage(this.chatId, message, { parse_mode: 'Markdown' });
      return true;
    } catch (error) {
      console.error("[Telegram] ❌ Erro ao enviar mensagem:", error);
      return false;
    }
  }

  /**
   * Notificação de nova previsão de alta confiança
   */
  async notifyForecast(forecast: { jogo: string, liga: string, probabilidade: number, market: string, odd: number }) {
    const confPcnt = (forecast.probabilidade * 100).toFixed(0);
    const msg = `
🔥 *NOVA PREVISÃO DETETADA (${confPcnt}%)*

⚽ *Jogo:* ${forecast.jogo}
🏆 *Liga:* ${forecast.liga}
🎯 *Mercado:* ${forecast.market}
📈 *Odd:* ${forecast.odd.toFixed(2)}x
🛡️ *Confiança:* ${confPcnt}%

_Analise o jogo no dashboard antes de entrar!_
    `.trim();
    
    return this.sendMessage(msg);
  }

  /**
   * Notificação de resultado de aposta
   */
  async notifyResult(bet: { jogo: string, resultado: 'win' | 'loss' | 'void', lucro: number, odd: number }) {
    const emoji = bet.resultado === 'win' ? '✅' : bet.resultado === 'loss' ? '❌' : '⚠️';
    const status = bet.resultado.toUpperCase();
    const moneyEmoji = bet.resultado === 'win' ? '💰' : '📉';

    const msg = `
${emoji} *APOSTA RESOLVIDA: ${status}*

⚽ *Evento:* ${bet.jogo}
📈 *Odd:* ${bet.odd.toFixed(2)}x
${moneyEmoji} *Resultado:* ${bet.lucro >= 0 ? '+' : ''}€${bet.lucro.toFixed(2)}

_A tua banca foi atualizada automaticamente._
    `.trim();

    return this.sendMessage(msg);
  }
}

export const telegramService = new TelegramService();

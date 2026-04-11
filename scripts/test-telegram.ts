import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { telegramService } from "../lib/core/telegram";

async function test() {
  console.log("📡 Testando ligação ao Telegram...");
  
  const success = await telegramService.sendMessage("🚀 *Betano Engine:* Ligação estabelecida com sucesso! Estás pronto para receber alertas de elite.");
  
  if (success) {
    console.log("✅ Mensagem enviada! Verifica o teu Telegram.");
  } else {
    console.log("❌ Falha ao enviar mensagem. Verifica o teu Token e Chat ID no .env.local.");
  }
}

test();

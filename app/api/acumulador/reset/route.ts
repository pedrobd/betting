import { NextResponse } from "next/server";
import { getCicloAtivo, fecharCiclo, criarCiclo } from "@/lib/core/database";

export async function POST() {
  try {
    const ciclo = await getCicloAtivo();
    
    // 1. Close current cycle if exists
    if (ciclo) {
      await fecharCiclo(ciclo.id, "perdido");
    }

    // 2. Start a fresh cycle at €5.00
    const novoCiclo = await criarCiclo(5.00);

    return NextResponse.json({ 
      success: true, 
      message: "Ciclo reiniciado com sucesso!",
      novoCiclo 
    });
  } catch (error: any) {
    console.error("[Reset API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao reiniciar ciclo: " + error.message },
      { status: 500 }
    );
  }
}

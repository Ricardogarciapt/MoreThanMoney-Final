import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { correrPercursos } from "@/lib/funis-motor"
import { bracosReais, motorLigado } from "@/lib/funis-bracos"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * O motor dos funis, uma passagem por minuto.
 *
 * É o que faz o mapa correr: pega em quem está pronto a avançar e anda com cada um até à próxima
 * espera ou ao fim.
 *
 * Está atrás de um interruptor (`site_settings.funis_motor_ligado`, desligado por omissão) porque
 * isto fala com pessoas reais. Diz sempre quantas pessoas ESTARIAM prontas — assim vê-se que o
 * motor está a ser travado, em vez de parecer que não há trabalho.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!(await motorLigado())) {
    return NextResponse.json({ ok: true, ligado: false, nota: "motor desligado — site_settings.funis_motor_ligado" })
  }

  const r = await correrPercursos(bracosReais)
  return NextResponse.json({ ok: true, ligado: true, ...r })
}

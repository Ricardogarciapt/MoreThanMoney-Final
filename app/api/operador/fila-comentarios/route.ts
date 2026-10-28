import { NextRequest, NextResponse } from "next/server"
import { isCronAuthorized } from "@/lib/cron-auth"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { lerFila } from "@/lib/instagram/fila-comentarios-servidor"
import { registarDoMac } from "@/lib/operador/servidor"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * A porta do agente no Mac, que publica os comentários da fila no Chrome com a sessão do
 * @morethanmoney.pt. Bearer CRON_SECRET. Este código não publica nada: dá a fila e regista o que
 * o Mac fez, para o dono ver no registo do operador.
 *
 * GET                                   → os prontos (o mesmo que o painel mostra)
 * POST { id, acao: "publicado"|"saltado", nota? } → grava e deixa linha no registo
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await lerFila(getSupabaseAdmin())) })
}

export async function POST(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const corpo = (await req.json().catch(() => ({}))) as { id?: string; acao?: string; nota?: string }
  if (!corpo.id || (corpo.acao !== "publicado" && corpo.acao !== "saltado")) {
    return NextResponse.json({ ok: false, erro: "precisa de id e acao publicado|saltado" }, { status: 400 })
  }
  try {
    await registarDoMac(getSupabaseAdmin(), corpo.id, corpo.acao, corpo.nota?.slice(0, 300))
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: e instanceof Error ? e.message : "erro" }, { status: 400 })
  }
}

/**
 * API admin — ENVIOS POR APROVAR (06/10).
 *
 * GET  → o que está `pendente` nas duas filas (aios_tasks `envio:*` e o setter do Instagram).
 * POST { acao: "aprovar" | "rejeitar", id, motivo? } → aprovar FAZ SAIR a mensagem.
 *
 * É o mesmo caminho que a API do agente usa (`aprovar_envio`), para as duas portas decidirem com
 * a mesma regra e a mesma transição condicional. Ver lib/envios-fila.ts.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-api-helpers"
import { aprovarEnvio, listarEnviosPendentes, rejeitarEnvio } from "@/lib/envios-fila"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  return NextResponse.json(await listarEnviosPendentes(100))
}

export async function POST(request: NextRequest) {
  const authCheck = await requireAdmin(request)
  if (authCheck) return authCheck
  let body: { acao?: string; id?: string; motivo?: string } = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, erro: "JSON inválido" }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ ok: false, erro: "falta id" }, { status: 400 })
  const quem = "admin:painel"
  const r =
    body.acao === "aprovar"
      ? await aprovarEnvio(String(body.id), quem)
      : body.acao === "rejeitar"
        ? await rejeitarEnvio(String(body.id), quem, body.motivo)
        : null
  if (!r) return NextResponse.json({ ok: false, erro: "acao tem de ser aprovar|rejeitar" }, { status: 400 })
  return NextResponse.json(r, { status: r.ok ? 200 : 409 })
}

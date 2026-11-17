import { NextRequest, NextResponse } from "next/server"
import { verifyAgentAccess } from "@/lib/agent-site-api"
import { agregar } from "@/lib/mentor/populacao"
import { correrPendentes, gerarLote, lerLote } from "@/lib/mentor/populacao-servidor"

/**
 * TESTE DE POPULAÇÃO DO MENTOR (ver `lib/mentor/populacao.ts`). Auth: admin ou AGENT_SITE_API_KEY.
 *  POST {acao:'gerar', lote, total?=1200}  → cria as personas (estado 'pendente').
 *  POST {acao:'correr', n?=5, voltas?=2}    → corre já n personas (o cron faz o resto de noite).
 *  GET ?lote=…                              → relatório agregado: língua certa, tom, empatia,
 *                                            utilidade, continuaria, por língua/perfil/emoção.
 *  GET ?lote=…&exemplos=1                   → + 10 conversas com pior e 10 com melhor nota.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  if ("error" in a) return NextResponse.json({ ok: false, erro: a.error }, { status: a.status })
  const lote = req.nextUrl.searchParams.get("lote")
  if (!lote) return NextResponse.json({ ok: false, erro: "lote em falta" }, { status: 400 })
  const linhas = await lerLote(lote)
  const feitas = linhas.filter((l) => l.estado === "feito")
  return NextResponse.json({ ok: true, lote, pendentes: linhas.length - feitas.length, ...agregar(feitas) })
}

export async function POST(req: NextRequest) {
  const a = await verifyAgentAccess(req)
  if ("error" in a) return NextResponse.json({ ok: false, erro: a.error }, { status: a.status })
  const b = (await req.json().catch(() => ({}))) as { acao?: string; lote?: string; total?: number; n?: number; voltas?: number }
  try {
    if (b.acao === "gerar") {
      if (!b.lote) return NextResponse.json({ ok: false, erro: "lote em falta" }, { status: 400 })
      const criadas = await gerarLote(b.lote, Math.min(1200, Math.max(1, Number(b.total) || 1200)))
      return NextResponse.json({ ok: true, criadas })
    }
    if (b.acao === "correr") {
      const r = await correrPendentes(Math.min(10, Math.max(1, Number(b.n) || 5)), Math.min(3, Math.max(1, Number(b.voltas) || 2)))
      return NextResponse.json({ ok: true, ...r })
    }
    return NextResponse.json({ ok: false, erro: "acao desconhecida" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, erro: (e as Error).message }, { status: 500 })
  }
}

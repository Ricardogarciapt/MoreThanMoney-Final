import { NextRequest, NextResponse } from 'next/server'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { ESPECIALISTAS, mensagemIndisponivel, perguntarAoAssistente } from '@/lib/marketing/assistente'
import type { MensagemIA } from '@/lib/ia/chamar'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** GET → os especialistas. POST { pedido, historico?, especialista? } → a resposta da equipa. */
export async function GET(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  return NextResponse.json({ especialistas: ESPECIALISTAS.map((e) => ({ id: e.id, nome: e.nome, papel: e.papel })) })
}

export async function POST(request: NextRequest) {
  const negado = (await exigirGestao(request, 'bo.gestao_comercial')).negado
  if (negado) return negado
  const b = (await request.json().catch(() => ({}))) as { pedido?: string; historico?: unknown; especialista?: string }
  const pedido = String(b.pedido ?? '').trim().slice(0, 4000)
  if (!pedido) return NextResponse.json({ error: 'Escreve o pedido.' }, { status: 400 })
  const historico = (Array.isArray(b.historico) ? b.historico : [])
    .filter((m): m is MensagemIA => !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
    .slice(-8)
  try {
    return NextResponse.json(await perguntarAoAssistente(pedido, { historico, especialista: b.especialista }))
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }
}

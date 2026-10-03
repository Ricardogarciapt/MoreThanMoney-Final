import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { normalizarE164 } from '@/lib/whatsapp-envio'
import { lerConversas, lerHistorico } from '@/lib/whatsapp/conversas'
import {
  janelaDe, oQuePodeEscrever, ordenarConversas, podeMudarPara,
  ROTULO_ESTADO, type EstadoConversa,
} from '@/lib/whatsapp/crm'

export const dynamic = 'force-dynamic'

/**
 * O CRM DE WHATSAPP — a lista de trabalho do dia e o que se faz a cada conversa.
 *
 * ═══ PORQUE É QUE O GET JÁ DEVOLVE A JANELA E A ORDEM ══════════════════════════════════════
 *
 * Porque a ordem do dia e «o que posso escrever a esta pessoa» são DECISÕES, não formatação. Se o
 * ecrã as calculasse por sua conta, haveria duas versões da regra das 24 horas — a do servidor, que
 * manda no envio, e a do browser, que manda no que o botão parece permitir. Discordariam no caso
 * difícil, que é precisamente a conversa que está a fechar.
 *
 * As decisões vivem em `lib/whatsapp/crm.ts`, puras e cobertas por `crm.check.ts`. Aqui só se lê a
 * base, aplicam-se, e devolve-se já resolvido.
 *
 * ═══ O ENVIO NÃO VIVE AQUI ═════════════════════════════════════════════════════════════════
 *
 * Responder faz-se pelo `POST /api/admin/whatsapp`, que entrega a `enviarWhatsApp` — o único
 * caminho por onde sai uma mensagem desta casa. Uma segunda porta de envio neste ficheiro seria a
 * porta que deixa passar o que a primeira travava.
 */
export async function GET(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const telefone = request.nextUrl.searchParams.get('telefone')
  const agora = new Date()

  // Uma conversa em particular: a lista já mostra o resto, aqui interessa o histórico.
  if (telefone) {
    const { e164 } = normalizarE164(telefone)
    if (!e164) return NextResponse.json({ ok: false, erro: 'numero_invalido' }, { status: 400 })
    const conversas = await lerConversas(500)
    const c = conversas.find((x) => x.telefone === e164) ?? null
    return NextResponse.json({
      ok: true,
      conversa: c
        ? { ...c, janela: janelaDe(c, agora), pode: oQuePodeEscrever(c, agora), rotulo: ROTULO_ESTADO[c.estado] }
        : null,
      historico: await lerHistorico(e164),
    })
  }

  const conversas = ordenarConversas(await lerConversas(200), agora).map((c) => ({
    ...c,
    janela: janelaDe(c, agora),
    pode: oQuePodeEscrever(c, agora),
    rotulo: ROTULO_ESTADO[c.estado],
  }))

  /**
   * Os números do topo do ecrã. São contados sobre a MESMA lista que se devolve, e não por
   * consultas à parte: um resumo que conta outra coisa que a lista é um resumo que vai discordar
   * dela à frente de quem a está a ler.
   */
  const resumo = {
    total: conversas.length,
    porResponder: conversas.filter((c) => Number(c.por_responder ?? 0) > 0).length,
    aFechar: conversas.filter((c) => c.janela.aFechar && Number(c.por_responder ?? 0) > 0).length,
    novas: conversas.filter((c) => c.estado === 'novo').length,
  }

  return NextResponse.json({ ok: true, resumo, conversas })
}

/**
 * As acções: mudar estado, atribuir a alguém, escrever uma nota, ligar a um negócio.
 *
 * A mudança de estado é VALIDADA — `podeMudarPara` recusa o salto que quase sempre é um clique
 * errado (um «perdido» que aparece «ganho» sem passar por conversa nenhuma). Recusar com o motivo
 * escrito é melhor do que aceitar e sujar o histórico de vendas.
 */
export async function POST(request: NextRequest) {
  const negado = await requireAdmin(request)
  if (negado) return negado

  const body = (await request.json().catch(() => ({}))) as {
    telefone?: string
    estado?: EstadoConversa
    responsavel?: string | null
    nome?: string | null
    notas?: string | null
    negocio_id?: string | null
  }

  const { e164 } = normalizarE164(String(body.telefone ?? ''))
  if (!e164) return NextResponse.json({ ok: false, erro: 'numero_invalido' }, { status: 400 })

  const db = getSupabaseAdmin()
  const { data: atual } = await db.from('whatsapp_conversas').select('id, estado').eq('telefone', e164).maybeSingle()
  if (!atual?.id) return NextResponse.json({ ok: false, erro: 'conversa_inexistente' }, { status: 404 })

  const mudanca: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.estado) {
    const de = atual.estado as EstadoConversa
    if (!podeMudarPara(de, body.estado)) {
      return NextResponse.json({
        ok: false,
        erro: 'transicao_invalida',
        porque: `Não se passa de «${ROTULO_ESTADO[de]}» para «${ROTULO_ESTADO[body.estado]}» directamente.`,
      }, { status: 422 })
    }
    mudanca.estado = body.estado
  }
  // `undefined` é «não mexas»; `null` é «limpa». São coisas diferentes e o ecrã precisa das duas —
  // tirar o responsável a uma conversa tem de ser possível sem a apagar.
  if (body.responsavel !== undefined) mudanca.responsavel = body.responsavel
  if (body.nome !== undefined) mudanca.nome = body.nome
  if (body.notas !== undefined) mudanca.notas = body.notas
  if (body.negocio_id !== undefined) mudanca.negocio_id = body.negocio_id

  const { error } = await db.from('whatsapp_conversas').update(mudanca).eq('id', atual.id)
  if (error) return NextResponse.json({ ok: false, erro: 'nao_gravou', porque: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { papelMtmFunded } from '@/lib/mtmfunded/acesso'
import { chamarIA, mensagemIndisponivel, type MensagemIA } from '@/lib/ia/chamar'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * APOIO DO TORNEIO — independente do assistente do site.
 *
 * Não reaproveita o /aimtm de propósito. O assistente dos membros conhece os sinais, os
 * scanners, os planos e a área de membro; um participante de torneio não tem acesso a nada
 * disso, e um assistente que lhe fale de coisas que ele não pode abrir é pior do que
 * assistente nenhum — ensina-o a pedir o que lhe vai ser negado.
 *
 * Este sabe do torneio, das regras da conta e do MetaTrader. Quando lhe perguntam o resto,
 * diz que não é a sua área em vez de inventar.
 */

const CONTEXTO = `És o apoio do Trading Tournament da More Than Money.

O QUE SABES E PODES EXPLICAR
· O torneio: inscrição, calendário, conta de avaliação, classificação, prémios, certificados.
· As regras da conta: perda diária, perda máxima, dias mínimos, consistência. Tudo medido
  sobre EQUITY — as posições abertas contam. Quebrar uma regra congela a conta na posição em
  que estava; não há segunda conta.
· MetaTrader 5: entrar com login/servidor, abrir e fechar posições, stop loss, take profit,
  ler o histórico.
· Gestão de risco: dimensionar a posição, o que é drawdown, porque é que arriscar demais
  acaba com a conta antes do talento aparecer.

O QUE NÃO É A TUA ÁREA
· Sinais, scanners (fora o GoldKiller), alertas MTM, Tap to Trade, planos de subscrição,
  faturação, MTM Auto. Nada disso faz parte da inscrição no torneio.
· Quando perguntarem, diz que não é a tua área e encaminha para a equipa — não descrevas
  funcionalidades que a pessoa não pode abrir.

O QUE NUNCA FAZES
· Não dás conselho de investimento, não dizes o que comprar ou vender, não prometes
  resultados. És apoio de uma competição, não um gestor.
· Não inventas números do torneio. Se não souberes a posição ou o resultado de alguém, diz
  para consultar a classificação no painel.

Responde em português de Portugal, por tu, curto e directo. Sem emojis a mais.`

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: auth } = await db.auth.getUser(token)
  if (!auth?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const { data: perfil } = await db
    .from('profiles')
    .select('user_type, member_category, subscription_plan, is_active')
    .eq('id', auth.user.id)
    .maybeSingle()

  // Visitante não fala com o apoio: seria uma porta aberta a um modelo pago.
  if (papelMtmFunded(perfil) === 'visitante') {
    return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const mensagem = String(body?.mensagem ?? '').trim().slice(0, 2000)
  if (!mensagem) return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 })

  const historico: MensagemIA[] = Array.isArray(body?.historico)
    ? (body.historico as Array<{ role: string; content: string }>)
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-8) // memória curta: chega para o fio da conversa, e não enche o pedido
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 2000) }))
    : []

  // Porta única da IA (Groq → Gemini → Ollama → OpenAI → Anthropic): grátis primeiro, rápido.
  try {
    const r = await chamarIA({
      tarefa: 'mtmfunded-apoio',
      sistema: CONTEXTO,
      mensagens: [...historico, { role: 'user', content: mensagem }],
      maxTokens: 900,
      preferencia: 'rapido',
    })
    const resposta = r.texto.trim()
    return NextResponse.json({ resposta: resposta || 'Não consegui responder a isso.' })
  } catch (e) {
    return NextResponse.json({ error: mensagemIndisponivel(e) }, { status: 503 })
  }
}

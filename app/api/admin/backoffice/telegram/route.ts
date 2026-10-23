import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { exigirGestao } from '@/lib/backoffice-sessao'
import { classificarDialogos, lerDialogos, resumoDoMapa } from '@/lib/prospecao/dialogos'
import { agregarRotas, estadoDoPulso, NOME_RELAY, RELAYS_CONHECIDOS, servicoDoRelay, type LinhaRelayLog } from '@/lib/telegram/painel-logica'

export const dynamic = 'force-dynamic'

/**
 * GESTÃO → TELEGRAM: os serviços MTProto da VPS vistos do backoffice, sem chave nenhuma na VPS.
 *   · relays: o pulso que eles mandam a /api/telegram/relay-pulso (servicos_pulso `telegram:*`)
 *   · rotas: o que o relay-post registou em telegram_relay_log (fonte→destino, 30 dias)
 *   · grupos: o mapa do mtm-dialogos cruzado com onde o bot está (lib/prospecao/dialogos.ts)
 */
export async function GET(request: NextRequest) {
  const g = await exigirGestao(request, 'bo.dono')
  if (g.negado) return g.negado
  const db = getSupabaseAdmin()
  const agora = Date.now()
  const desde30d = new Date(agora - 30 * 86_400_000).toISOString()

  const [pulsos, log, descobertos, dialogos] = await Promise.all([
    db.from('servicos_pulso').select('servico, host, versao, estado, em').like('servico', 'telegram:%'),
    db.from('telegram_relay_log').select('source_chat_id, target_chat_id, status, created_at, error').gte('created_at', desde30d).order('created_at', { ascending: false }).limit(5000),
    db.from('mtmcopy_telegram_discovered').select('chat_id, title, last_message_at').limit(2000),
    lerDialogos(300),
  ])

  const porServico = new Map((pulsos.data ?? []).map((p) => [p.servico as string, p]))
  const relays = RELAYS_CONHECIDOS.map((relay) => {
    const p = porServico.get(servicoDoRelay(relay))
    return {
      relay,
      nome: NOME_RELAY[relay] ?? relay,
      estado: estadoDoPulso(p?.em as string | undefined, agora),
      em: (p?.em as string | undefined) ?? null,
      versao: (p?.versao as string | undefined) ?? null,
      rotas: ((p?.estado as { rotas?: unknown[] } | null)?.rotas ?? []) as unknown[],
      erro: ((p?.estado as { erro?: string | null } | null)?.erro ?? null) as string | null,
    }
  })

  const titulos = new Map<string, string>()
  for (const d of descobertos.data ?? []) if (d.title) titulos.set(String(d.chat_id), String(d.title))
  if (dialogos.ok) for (const d of dialogos.dialogos) if (!titulos.has(d.chatId)) titulos.set(d.chatId, d.titulo)
  const rotas = agregarRotas((log.data ?? []) as LinhaRelayLog[], titulos, agora)

  let grupos: { ok: true; resumo: ReturnType<typeof resumoDoMapa>; lista: unknown[] } | { ok: false; motivo: string }
  if (dialogos.ok) {
    const presenca = (descobertos.data ?? []).map((d) => ({ chatId: String(d.chat_id), ultimaMensagemIso: (d.last_message_at as string | null) ?? null }))
    const cl = classificarDialogos(dialogos.dialogos, presenca, agora)
    grupos = { ok: true, resumo: resumoDoMapa(cl), lista: cl.slice(0, 60) }
  } else {
    grupos = { ok: false, motivo: dialogos.motivo }
  }

  return NextResponse.json({
    relays,
    rotas,
    grupos,
    erros: [pulsos.error?.message, log.error?.message, descobertos.error?.message].filter(Boolean),
  })
}

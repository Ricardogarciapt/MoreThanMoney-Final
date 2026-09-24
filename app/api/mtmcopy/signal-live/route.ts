import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { stopJaBatido, vereditoDaJanela, type CodigoDaJanela } from '@/lib/mtmcopy/t2t-janela-regra'

/**
 * Resultado ao vivo dos sinais que estão a correr — pips e percentagem, por mensagem do chat.
 *
 * Devolve o que o MOTOR já calculou (`mtmcopy_signal_tracking.live_*`), não cotações: as contas
 * fazem-se uma vez no servidor em vez de uma vez por app aberta. Não precisa de sessão porque
 * não devolve nada do utilizador — é o desempenho público de um sinal público.
 *
 * E devolve também o VEREDITO da janela de aceitação (`janela`), que antes cada ecrã calculava
 * por sua conta — com réguas e frases diferentes. É a mesma resposta que o /sinais da MTM Auto
 * lê, por isso as duas superfícies dizem o mesmo do mesmo sinal, à letra.
 *
 * Já não filtra por `status = 'active'`: um sinal fechado precisa de veredito («Este sinal já
 * fechou.») tanto como um a correr. Os NÚMEROS ao vivo é que continuam a ser só dos que correm —
 * mostrar o flutuante de uma trade que acabou seria mostrar um preço que já não existe.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const ids = (request.nextUrl.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200)

  let q = supabase
    .from('mtmcopy_signal_tracking')
    .select(
      'chat_message_id, status, live_pips, live_pct, peak_pips, exits_done, entry_hit_at, closed_at, sl, entry, symbol, outcome_label, created_at',
    )
  if (ids.length) q = q.in('chat_message_id', ids)

  const { data, error } = await q.limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const live: Record<
    string,
    {
      pips: number | null
      pct: number | null
      peak: number | null
      exits: number
      entrou: boolean
      slBatido: boolean
      estado: string
      desfecho: string | null
      janela: { aceitavel: boolean; motivo: string | null; code: CodigoDaJanela | null }
    }
  > = {}
  for (const r of data ?? []) {
    const aCorrer = String(r.status ?? 'active') === 'active'
    live[r.chat_message_id as string] = {
      // Flutuante só de quem está a correr — ver o cabeçalho.
      pips: aCorrer ? (r.live_pips as number | null) : null,
      pct: aCorrer ? (r.live_pct as number | null) : null,
      peak: r.peak_pips as number | null,
      exits: (r.exits_done as number) ?? 0,
      // A entrada já foi tocada — quem aceitar agora entra a outro preço com o stop do início.
      // É o que fecha a janela de aceitação, mesmo quando ainda não houve parcial nenhum.
      entrou: Boolean(r.entry_hit_at),
      /**
       * O stop já foi tocado? A conta é a de `lib/mtmcopy/t2t-janela-regra` — a mesma que o ecrã
       * e o mtm-auto usam. Estava aqui escrita à mão (e com o comentário duplicado), e uma cópia
       * a mais é uma cópia que um dia deixa de bater certo com as outras.
       */
      slBatido: stopJaBatido(r),
      estado: String(r.status ?? 'active'),
      desfecho: (r.outcome_label as string | null) ?? null,
      janela: vereditoDaJanela({
        created_at: String(r.created_at),
        status: r.status as string | null,
        entry_hit_at: r.entry_hit_at as string | null,
        exits_done: r.exits_done as number | null,
        closed_at: r.closed_at as string | null,
        live_pips: r.live_pips as number | null,
        entry: r.entry as number | null,
        sl: r.sl as number | null,
        symbol: r.symbol as string | null,
      }),
    }
  }
  return NextResponse.json({ live })
}

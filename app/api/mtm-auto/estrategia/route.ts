import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PRESETS, preset } from '@/lib/risk-presets'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

/**
 * O retrato de uma estratégia: como correu, e quanto o cliente quer arriscar nela.
 *
 * A lista de estratégias dizia só "A seguir" — e "seguir" uma fonte sem saber se ela ganha é uma
 * escolha às cegas. Aqui estão os números dela: quantos sinais deu, quantos acertou, onde é que
 * saiu. Vêm de `mtmcopy_signal_tracking`, a mesma tabela que alimenta o desfecho que aparece no
 * chat — não de uma contagem à parte que um dia discordaria.
 *
 * ── O que NÃO se mexe aqui ────────────────────────────────────────────────────────────────────
 * O motor da estratégia: trailing stop, trailing profit, parciais na fonte, gestão em tempo real.
 * Isso é do provedor, é igual para toda a gente que a segue, e administra-se no /admin (ou no
 * admin do MTM Auto). O que o cliente decide é quanto ARRISCA nela — e é só isso que esta rota
 * escreve.
 */

interface Desempenho {
  sinais: number
  fechados: number
  ganhos: number
  perdas: number
  breakeven: number
  winrate: number | null
  pips: number
  alvos: { alvo: string; acertos: number }[]
}

async function desempenho(fonte: string, dias: number): Promise<Desempenho> {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  const { data } = await db
    .from('mtmcopy_signal_tracking')
    .select('status, result_pips, exits_done')
    .eq('channel_slug', fonte)
    .gte('created_at', desde)
    .limit(2000)

  const linhas = data ?? []
  // Um sinal que ainda corre não tem desfecho — contá-lo como perda seria dizer que perdeu uma
  // trade que ainda pode ganhar.
  const fechados = linhas.filter((l) => l.result_pips != null)
  const ganhos = fechados.filter((l) => Number(l.result_pips) > 0).length
  const perdas = fechados.filter((l) => Number(l.result_pips) < 0).length
  const breakeven = fechados.filter((l) => Number(l.result_pips) === 0).length

  return {
    sinais: linhas.length,
    fechados: fechados.length,
    ganhos,
    perdas,
    breakeven,
    // Sem trades fechadas não se inventa uma taxa de acerto.
    winrate: fechados.length ? Math.round((ganhos / fechados.length) * 1000) / 10 : null,
    pips: Math.round(fechados.reduce((a, l) => a + Number(l.result_pips ?? 0), 0)),
    alvos: [1, 2, 3].map((n) => ({
      alvo: `TP${n}`,
      acertos: linhas.filter((l) => Number(l.exits_done ?? 0) >= n).length,
    })),
  }
}

export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const fonte = String(request.nextUrl.searchParams.get('fonte') ?? '').trim()
  if (!fonte) return NextResponse.json({ error: 'fonte obrigatória' }, { status: 400 })
  const dias = Math.min(365, Math.max(7, Number(request.nextUrl.searchParams.get('dias')) || 90))

  const db = getSupabaseAdmin()
  const [dados, { data: contas }] = await Promise.all([
    desempenho(fonte, dias),
    db
      .from('mtmcopy_connections')
      .select('id, account_label, t2t_source_risk, t2t_lot_value, lot_value, max_risk_percent')
      .eq('user_id', userId!)
      .neq('mt5_status', 'disconnected'),
  ])

  return NextResponse.json({
    ok: true,
    fonte,
    dias,
    desempenho: dados,
    presets: PRESETS.map((p) => ({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao,
      riscoPct: p.riscoPct,
      riscoMaxPct: p.riscoMaxPct,
    })),
    // O risco desta fonte em cada conta — e o da conta ao lado, para se ver do que se está a sair.
    contas: (contas ?? []).map((c) => {
      const mapa = (c.t2t_source_risk as Record<string, { preset?: string; riscoPct?: number; riscoMaxPct?: number }> | null) ?? {}
      const desta = mapa[fonte]
      return {
        id: c.id as string,
        rotulo: (c.account_label as string) ?? 'Conta',
        proprio: desta != null,
        preset: desta?.preset ?? null,
        riscoPct: desta?.riscoPct ?? null,
        riscoMaxPct: desta?.riscoMaxPct ?? null,
        riscoDaConta: Number(c.t2t_lot_value ?? c.lot_value ?? 1),
        tetoDaConta: Number(c.max_risk_percent ?? 2),
      }
    }),
  })
}

export async function PATCH(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const corpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const fonte = String(corpo.fonte ?? '').trim()
  const contaId = String(corpo.contaId ?? '').trim()
  if (!fonte || !contaId) {
    return NextResponse.json({ error: 'fonte e contaId obrigatórios' }, { status: 400 })
  }

  const db = getSupabaseAdmin()
  const { data: minha } = await db
    .from('mtmcopy_connections')
    .select('id, t2t_source_risk')
    .eq('id', contaId)
    // Sem isto, o id de outra pessoa no corpo do pedido chegava para lhe mudar o risco.
    .eq('user_id', userId!)
    .maybeSingle()
  if (!minha) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const mapa = { ...((minha.t2t_source_risk as Record<string, unknown>) ?? {}) }

  // "Voltar ao risco da conta" apaga a entrada em vez de escrever os mesmos números: assim, mudar
  // o risco da conta volta a valer para esta fonte, que é o que "voltar ao da conta" quer dizer.
  if (corpo.limpar === true) {
    delete mapa[fonte]
  } else {
    const escolhido = preset(String(corpo.preset ?? ''))
    const risco = escolhido ? escolhido.riscoPct : Number(corpo.riscoPct)
    const teto = escolhido ? escolhido.riscoMaxPct : Number(corpo.riscoMaxPct)
    if (!Number.isFinite(risco) || risco <= 0) {
      return NextResponse.json({ error: 'Risco inválido' }, { status: 400 })
    }
    mapa[fonte] = {
      preset: escolhido?.id ?? 'personalizado',
      riscoPct: Math.min(5, Math.max(0.1, Number(risco))),
      // O teto nunca abaixo do risco: um teto mais baixo bloqueia todas as ordens em silêncio.
      riscoMaxPct: Math.min(5, Math.max(Number(risco), Number.isFinite(teto) ? Number(teto) : Number(risco))),
    }
  }

  const { error } = await db
    .from('mtmcopy_connections')
    .update({ t2t_source_risk: mapa, updated_at: new Date().toISOString() })
    .eq('id', contaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, fonte, risco: mapa[fonte] ?? null })
}

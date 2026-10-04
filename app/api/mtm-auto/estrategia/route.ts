import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PRESETS, preset } from '@/lib/risk-presets'
import { chavesDaFonte } from '@/lib/mtmauto/chaves-de-fonte'
import { desempenhoDoCatalogo, lerCatalogoMtmAuto, SEM_HISTORICO } from '@/lib/mtmauto/desempenho-do-catalogo'

export const dynamic = 'force-dynamic'
// Ler o histórico da conta provider na corretora demora — e é o que dá os números verdadeiros.
export const maxDuration = 40

/**
 * O retrato de uma estratégia — e são DUAS coisas diferentes.
 *
 * ── Estratégias MTM Auto (`?providerId=`) ─────────────────────────────────────────────────────
 * Os números são EXACTAMENTE os da app MTM Auto (`/api/auto/providers`, lido com o token do
 * cliente) — taxa de acerto, trades, fator de lucro e a curva em pips. Nada se recalcula deste
 * lado: duas contas da mesma estratégia acabam sempre a discordar. Sem histórico medido lá,
 * aqui diz-se «Sem histórico suficiente».
 *
 * ── Fontes Tap to Trade (`?fonte=`) ───────────────────────────────────────────────────────────
 * NÃO executam em conta nenhuma — só dão sinais. Perguntar-lhes "quanto ganhaste" não faz
 * sentido, porque não ganharam nada: quem ganha ou perde é a conta de quem os aceita, e isso
 * está no separador Histórico. O que se mede aqui é o que o sinal FEZ: quantos saíram, quantos
 * chegaram a estar em lucro e a que alvos chegaram.
 *
 * Contar-lhes "perdas" seria pior do que inútil. O desfecho por sinal é tudo-ou-nada: um sinal
 * que chega ao primeiro alvo, dá parcial e volta ao stop com o resto conta como perda inteira —
 * e quem o seguiu ficou com lucro.
 *
 * ── O que NÃO se mexe aqui ────────────────────────────────────────────────────────────────────
 * O motor: trailing stop, trailing profit, parciais na fonte. Isso é do provedor, é igual para
 * toda a gente que a segue, e administra-se no /admin (ou no admin do MTM Auto). O que o cliente
 * decide é quanto ARRISCA — e é só isso que esta rota escreve.
 */

/**
 * Fontes de ideias sem conta provider (foi o caso das antigas Forex Swings e PrimeVerse, que saíram a
 * 04/10/2026): não se inventam números para elas, mostram-se os alvos que os sinais atingiram, que é um facto.
 */
interface Desempenho {
  /** De onde vieram os números: a conta que produz a estratégia, ou os sinais dela. */
  origem: 'provider' | 'sinais'
  contaProvider: string | null
  sinais: number
  fechados: number
  ganhos: number
  perdas: number
  breakeven: number
  winrate: number | null
  /**
   * Fator de lucro: o que os ganhos somam a dividir pelo que as perdas somam.
   *
   * Aqui NÃO vai o resultado em dinheiro. A conta é nossa, não do cliente, e "+88,91" diz-lhe o
   * tamanho dela — quanto lá está e quanto rende — que é informação da casa, não da estratégia.
   * O fator de lucro responde à mesma pergunta ("compensa?") sem dizer de quanto se está a falar:
   * 2,0 significa que por cada euro perdido se ganharam dois, tenha a conta 300 ou 300 000.
   */
  fatorLucro: number | null
  pips: number | null
  esteveEmLucro: number
  alvos: { alvo: string; acertos: number }[]
  medicaoFiavel: boolean
  porqueNaoFiavel: string | null
}

/**
 * Uma fonte de sinais: o que ela PRODUZIU.
 *
 * Sem conta de execução, não há ganhos nem perdas para contar — o que há são sinais, e o que
 * deles se pode dizer com verdade é quantos saíram, quantos estiveram em lucro e a que alvos
 * chegaram.
 */
async function desempenhoDosSinais(fonte: string, dias: number): Promise<Desempenho> {
  const db = getSupabaseAdmin()
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()

  /**
   * `source_key`, não `channel_slug`.
   *
   * A tabela tem as duas colunas e elas parecem a mesma coisa: `source_key` diz QUEM produziu o
   * sinal (`premium`, `sensei`), `channel_slug` diz ONDE foi publicado (`premium-ideas`,
   * `sensei-scanner`). Nenhum valor de uma existe na outra. Este ecrã recebe a chave de quem
   * produziu — é o que o T2T usa em todo o lado — e procurá-la na coluna do canal devolvia zero
   * linhas para TODAS as fontes. O retrato aparecia inteiro, com todos os números a zeros, e
   * não havia nada que denunciasse a diferença entre «não produziu nada» e «perguntei mal».
   */
  const { data } = await db
    .from('mtmcopy_signal_tracking')
    .select('status, result_pips, exits_done, peak_pips')
    .in('source_key', chavesDaFonte(fonte))
    .gte('created_at', desde)
    .limit(2000)

  const linhas = data ?? []
  const fechados = linhas.filter((l) => l.result_pips != null)

  return {
    origem: 'sinais',
    contaProvider: null,
    sinais: linhas.length,
    fechados: fechados.length,
    // Sem execução não há ganhos nem perdas para contar. Zeros aqui não são "não ganhou" — são
    // "a pergunta não se aplica", e é por isso que o ecrã não os mostra.
    ganhos: 0,
    perdas: 0,
    breakeven: 0,
    winrate: null,
    fatorLucro: null,
    pips: null,
    esteveEmLucro: linhas.filter((l) => Number(l.peak_pips ?? 0) > 0).length,
    alvos: [1, 2, 3].map((n) => ({
      alvo: `TP${n}`,
      acertos: linhas.filter((l) => Number(l.exits_done ?? 0) >= n).length,
    })),
    // O desfecho por sinal é tudo-ou-nada e não conta as parciais — por isso não se publica
    // taxa de acerto nenhuma a partir daqui.
    medicaoFiavel: false,
    porqueNaoFiavel:
      'Esta fonte dá sinais, não executa em conta nenhuma — quem ganha ou perde é a tua conta ao aceitá-los, e isso está no separador Histórico. Aqui mede-se o que o sinal fez: quantos saíram, quantos estiveram em lucro e a que alvos chegaram.',
  }
}

export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const fonte = String(request.nextUrl.searchParams.get('fonte') ?? '').trim()
  const providerId = String(request.nextUrl.searchParams.get('providerId') ?? '').trim()
  if (!fonte && !providerId) {
    return NextResponse.json({ error: 'fonte ou providerId obrigatório' }, { status: 400 })
  }
  const dias = Math.min(365, Math.max(7, Number(request.nextUrl.searchParams.get('dias')) || 90))

  const db = getSupabaseAdmin()

  // ── Estratégia MTM Auto: os MESMOS números que a app MTM Auto mostra ─────────────────────────
  // Não se recalcula nada aqui. Recalcular deste lado (com outro mapa de contas e outra fórmula)
  // é o que fazia a mesma estratégia dizer 71% na MTM Auto e 35% na MTM System — ver
  // lib/mtmauto/desempenho-do-catalogo.ts.
  if (providerId) {
    const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    const catalogo = await lerCatalogoMtmAuto(token)
    if (!catalogo) {
      // Não se conseguiu ler é diferente de não ter feito nada: `ok: false` e o ecrã diz isso.
      return NextResponse.json(
        { ok: false, providerId, error: 'Não deu para ler os números desta estratégia agora. Volta daqui a pouco.' },
        { status: 502 },
      )
    }
    const linha = catalogo.find((p) => String(p.id) === providerId)
    const desempenho = linha
      ? desempenhoDoCatalogo(linha)
      : {
          ...desempenhoDoCatalogo({ id: providerId }),
          porqueNaoFiavel: `${SEM_HISTORICO}: esta estratégia não está no teu catálogo MTM Auto.`,
        }
    return NextResponse.json({
      ok: true,
      providerId,
      dias,
      desempenho,
      // O risco por estratégia é do Tap to Trade — uma estratégia MTM Auto configura-se na app
      // MTM Auto, onde se paga por ela.
      contas: [],
      presets: [],
    })
  }

  // ── Fonte Tap to Trade: o que os sinais dela fizeram ────────────────────────────────────────
  const [dados, { data: contas }] = await Promise.all([
    desempenhoDosSinais(fonte, dias),
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

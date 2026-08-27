import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { PRESETS, preset } from '@/lib/risk-presets'
import { lerHistorico } from '@/lib/mtmcopy/metaapi'
import {
  CANONICAL_AURUMFLOW_ACCOUNT_ID,
  CANONICAL_PREMIUM_ACCOUNT_ID,
  SENSEI_PROVIDER_ACCOUNT_ID,
} from '@/lib/mtmcopy/provider-constants'

export const dynamic = 'force-dynamic'
// Ler o histórico da conta provider na corretora demora — e é o que dá os números verdadeiros.
export const maxDuration = 40

/**
 * O retrato de uma estratégia — e são DUAS coisas diferentes.
 *
 * ── Estratégias MTM Auto (`?providerId=`) ─────────────────────────────────────────────────────
 * Têm conta de execução própria. Os números são os dela: fechos reais na corretora, com as
 * parciais como aconteceram. É a pergunta "esta estratégia ganha dinheiro?" e a resposta é o
 * dinheiro.
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
 * A conta PROVIDER de cada estratégia.
 *
 * Estes números são os da conta que produz a estratégia — dinheiro real, com as parciais como
 * aconteceram. Não são os do cliente: esses estão no separador Histórico, que soma as contas
 * dele. Misturar os dois respondia à pergunta errada — quem abre uma estratégia quer saber se
 * ELA ganha, não como lhe correu a ele a segui-la meio mês.
 *
 * Antes lia-se `mtmcopy_signal_tracking`, que mede cada sinal como uma trade única,
 * tudo-ou-nada: um sinal que chega ao primeiro alvo, tira parcial e volta ao stop com o resto
 * contava como PERDA inteira. Dava 9% de acerto no Premium — um número que não é o de ninguém.
 *
 * Fontes de ideias (Forex Swings, PrimeVerse) não têm conta provider: não se inventam números
 * para elas, mostram-se os alvos que os sinais atingiram, que é um facto.
 */
/** A conta de execução de cada estratégia MTM Auto que não a tem guardada na tabela. */
const CONTA_POR_FONTE_MTM: Record<string, string> = {
  premium: CANONICAL_PREMIUM_ACCOUNT_ID,
  sensei: SENSEI_PROVIDER_ACCOUNT_ID,
  aurum: CANONICAL_AURUMFLOW_ACCOUNT_ID,
}

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
  resultado: number | null
  pips: number | null
  esteveEmLucro: number
  alvos: { alvo: string; acertos: number }[]
  medicaoFiavel: boolean
  porqueNaoFiavel: string | null
}

/** O que a conta provider fez mesmo: fechos reais, na corretora. */
async function desempenhoDoProvider(contaId: string, nome: string, dias: number): Promise<Desempenho | null> {
  const deals = await lerHistorico(contaId, new Date(Date.now() - dias * 86_400_000))
  // `null` = não se conseguiu ler. Devolver zeros seria dizer que a estratégia não fez nada.
  if (!deals) return null

  const fechos = deals
    .filter((d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT')
    .filter((d) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL')
    .map((d) => Math.round((Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0)) * 100) / 100)

  const ganhos = fechos.filter((v) => v > 0).length
  const perdas = fechos.filter((v) => v < 0).length
  const breakeven = fechos.filter((v) => v === 0).length

  return {
    origem: 'provider',
    contaProvider: nome,
    sinais: fechos.length,
    fechados: fechos.length,
    ganhos,
    perdas,
    breakeven,
    winrate: fechos.length ? Math.round((ganhos / fechos.length) * 1000) / 10 : null,
    resultado: Math.round(fechos.reduce((a, b) => a + b, 0) * 100) / 100,
    // Os pips não se leem de um fecho — vêm do preço, e a conta não os guarda.
    pips: null,
    esteveEmLucro: ganhos,
    alvos: [],
    medicaoFiavel: true,
    porqueNaoFiavel: null,
  }
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

  const { data } = await db
    .from('mtmcopy_signal_tracking')
    .select('status, result_pips, exits_done, peak_pips')
    .eq('channel_slug', fonte)
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
    resultado: null,
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

  // ── Estratégia MTM Auto: os números da conta que a executa ──────────────────────────────────
  if (providerId) {
    const { data: prov } = await db
      .from('mtmauto_providers')
      .select('nome, metaapi_account_id, fonte_mtm')
      .eq('id', providerId)
      .maybeSingle()

    const conta =
      (prov?.metaapi_account_id as string | null) ??
      CONTA_POR_FONTE_MTM[String(prov?.fonte_mtm ?? '')] ??
      null

    const dados = conta
      ? await desempenhoDoProvider(conta, String(prov?.nome ?? 'Estratégia'), dias)
      : null

    return NextResponse.json({
      ok: true,
      providerId,
      dias,
      desempenho:
        dados ??
        {
          origem: 'provider' as const,
          contaProvider: (prov?.nome as string) ?? null,
          sinais: 0,
          fechados: 0,
          ganhos: 0,
          perdas: 0,
          breakeven: 0,
          winrate: null,
          resultado: null,
          pips: null,
          esteveEmLucro: 0,
          alvos: [],
          medicaoFiavel: false,
          // Não se conseguiu ler é diferente de não ter feito nada, e dizer zeros seria a pior
          // das duas mentiras: parece uma estratégia parada.
          porqueNaoFiavel: conta
            ? 'Não deu para ler a conta desta estratégia na corretora agora. Volta daqui a pouco.'
            : 'Esta estratégia ainda não tem conta de execução ligada.',
        },
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

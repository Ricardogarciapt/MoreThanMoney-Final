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
const CONTA_DA_FONTE: Record<string, { conta: string; nome: string }> = {
  'premium-ideas': { conta: CANONICAL_PREMIUM_ACCOUNT_ID, nome: 'MTM Premium' },
  'sensei-scanner': { conta: SENSEI_PROVIDER_ACCOUNT_ID, nome: 'MTM Auto Sensei' },
  'golden-moves': { conta: CANONICAL_AURUMFLOW_ACCOUNT_ID, nome: 'MTM Auto Aurum Flow' },
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

/** Para as fontes sem conta provider: o que os sinais atingiram. */
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
    ganhos: fechados.filter((l) => Number(l.result_pips) > 0).length,
    perdas: fechados.filter((l) => Number(l.result_pips) < 0).length,
    breakeven: fechados.filter((l) => Number(l.result_pips) === 0).length,
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
      'Esta fonte não tem conta de execução própria, por isso o que se mede são os sinais dela — quantos saíram e a que alvos chegaram. A taxa de acerto sairia de um cálculo tudo-ou-nada que conta como perda um sinal que já tinha dado parcial.',
  }
}

export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const fonte = String(request.nextUrl.searchParams.get('fonte') ?? '').trim()
  if (!fonte) return NextResponse.json({ error: 'fonte obrigatória' }, { status: 400 })
  const dias = Math.min(365, Math.max(7, Number(request.nextUrl.searchParams.get('dias')) || 90))

  const db = getSupabaseAdmin()
  const provider = CONTA_DA_FONTE[fonte]
  const [dados, { data: contas }] = await Promise.all([
    // A conta provider manda. Se não se conseguir ler, cai-se nos sinais em vez de mostrar zeros
    // — mas fica dito de onde vieram os números.
    provider
      ? desempenhoDoProvider(provider.conta, provider.nome, dias).then((r) => r ?? desempenhoDosSinais(fonte, dias))
      : desempenhoDosSinais(fonte, dias),
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

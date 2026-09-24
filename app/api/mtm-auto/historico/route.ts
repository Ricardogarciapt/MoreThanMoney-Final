import { NextRequest, NextResponse } from 'next/server'
import { autorizarMtmAuto } from '@/lib/mtm-auto-bridge'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerHistorico } from '@/lib/mtmcopy/metaapi'
import { contasDoUtilizador } from '@/lib/mtm-auto-bridge'
import { lerInfoContaCache } from '@/lib/mtmcopy/metaapi-cache'
import { recebeT2T } from '@/lib/mtmcopy/alvo-t2t'
import {
  agruparParciais,
  entradaMaisAntiga,
  raizesPorConfirmar,
  type ParteFechada,
} from '@/lib/mtmfunded/historico-parciais'

export const dynamic = 'force-dynamic'
// Ler o histórico fechado de várias contas na MetaAPI demora — e é isso que dá a curva de cada
// uma. Cortar aos 30 s devolvia a lista sem resultados, que é o mesmo que não a devolver.
export const maxDuration = 60

const MTM_AUTO = process.env.MTM_AUTO_BASE_URL?.trim() || 'https://mtm-auto.vercel.app'

interface Linha {
  quando: string
  origem: 'MTM Auto' | 'Tap to Trade' | 'MTM Copy'
  conta: string | null
  symbol: string
  direction: string | null
  estado: string
  resultado: number | null
  pips: number | null
  /**
   * Esta linha é uma TRADE terminada, e por isso conta para a taxa de acerto?
   *
   * Uma saída parcial com o resto ainda aberto já mexeu no saldo — entra no dinheiro e na curva —
   * mas ainda não ganhou nem perdeu nada: contá-la como trade dava um ganho hoje e uma perda
   * amanhã pela mesma posição. É a convenção de `lib/mtmfunded/simulado/estatisticas.ts`, e é por
   * isso que este ecrã dizia 3 trades onde o WebTrader e as Estatísticas diziam 1.
   *
   * Omitido (undefined) = conta, que é o caso de tudo o que vem da corretora.
   */
  contaParaTaxa?: boolean
}

/**
 * O histórico do cliente — de TODAS as contas dele, não de uma.
 *
 * Quem tem conta no MTM Auto, uma conta de Tap to Trade e ainda uma ligação de MTM Copy tinha o
 * mesmo mês repartido por três sítios e nenhum deles respondia a "como é que correu". Aqui as
 * três entram na mesma lista e na mesma curva, com a origem escrita ao lado de cada linha —
 * somar sem dizer de onde vem seria juntar coisas que se gerem de maneiras diferentes.
 *
 * A curva é acumulada por ordem cronológica, como na app MTM Auto: é a leitura que mostra se o
 * mês está a subir, e não apenas quanto deu no fim.
 */
export async function GET(request: NextRequest) {
  const { erro, userId } = await autorizarMtmAuto(request)
  if (erro) return erro

  const dias = Math.min(365, Math.max(1, Number(request.nextUrl.searchParams.get('dias')) || 30))
  const desde = new Date(Date.now() - dias * 86_400_000).toISOString()
  const db = getSupabaseAdmin()
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')

  const linhas: Linha[] = []

  // ── MTM Auto: o histórico que a própria app calcula (mesmos números, mesma origem) ──────────
  try {
    const r = await fetch(`${MTM_AUTO}/api/auto/history?dias=${dias}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    })
    if (r.ok) {
      const j = (await r.json()) as { linhas?: Record<string, unknown>[] }
      for (const l of j.linhas ?? []) {
        linhas.push({
          quando: String(l.quando ?? l.created_at ?? ''),
          origem: 'MTM Auto',
          conta: (l.conta as string) ?? null,
          symbol: String(l.symbol ?? ''),
          direction: (l.direction as string) ?? null,
          estado: String(l.estado ?? ''),
          resultado: l.resultado != null ? Number(l.resultado) : null,
          pips: l.resultadoPips != null ? Number(l.resultadoPips) : l.pips != null ? Number(l.pips) : null,
        })
      }
    }
  } catch {
    /* sem MTM Auto, mostram-se as outras origens */
  }

  // ── As contas do cliente no site (Tap to Trade e MTM Copy) ─────────────────────────────────
  const { data: minhas } = await db
    .from('mtmcopy_connections')
    .select('metaapi_account_id, account_label, mt5_login_last4, copy_method, purpose, t2t_enabled, mt5_status')
    .eq('user_id', userId!)
    .neq('mt5_status', 'disconnected')

  // A MESMA conta MT5 pode estar ligada nos dois sítios. Contá-la aqui outra vez duplicava
  // cada trade e inflava o resultado do mês — o erro mais caro que este ecrã podia ter.
  const { data: contasDoAuto } = await db
    .from('mtmauto_accounts')
    .select('metaapi_account_id')
    .eq('user_id', userId!)
  const jaContadas = new Set((contasDoAuto ?? []).map((c) => String(c.metaapi_account_id)))

  const contas = (minhas ?? []).filter(
    (c) => c.metaapi_account_id && !jaContadas.has(String(c.metaapi_account_id)),
  )
  const contaDe = new Map(
    contas.map((c) => [
      String(c.metaapi_account_id),
      String(c.account_label ?? `Conta ****${c.mt5_login_last4 ?? '?'}`),
    ]),
  )

  /**
   * O RESULTADO destas contas vem da corretora, não da nossa tabela.
   *
   * `mtmcopy_auto_positions` guarda o que abrimos e em que estado ficou — não guarda quanto deu,
   * porque quem fecha a posição é o mercado. Sem ir buscar o fecho real, as linhas de Tap to
   * Trade e de MTM Copy chegavam todas com resultado nulo e NUNCA desenhavam curva: o gráfico
   * prometia "uma linha por conta" e mostrava só a do MTM Auto.
   *
   * O comentário da ordem diz de quem foi a trade — o nosso sistema escreve "T2T-…" no que abre
   * pelo Tap to Trade — e é assim que a mesma conta pode aparecer nas duas origens sem misturar.
   */
  const desdeData = new Date(Date.now() - dias * 86_400_000)
  const fechos = await Promise.all(
    // Um cliente tem duas ou três contas; o teto de 6 é só para o caso patológico não estourar
    // o tempo da rota e deixar toda a gente sem histórico.
    contas.slice(0, 6).map(async (c) => {
      const deals = await lerHistorico(String(c.metaapi_account_id), desdeData)
      if (!deals) return [] // null = não se conseguiu ler; [] = leu e não havia nada
      const rotulo = contaDe.get(String(c.metaapi_account_id)) ?? 'Conta'
      const t2tPorDefeito = recebeT2T(c)
      return deals
        // Só os fechos: a abertura não tem resultado, e contá-la duplicava cada trade.
        .filter((d) => d.entryType === 'DEAL_ENTRY_OUT' || d.entryType === 'DEAL_ENTRY_INOUT')
        .filter((d) => d.type === 'DEAL_TYPE_BUY' || d.type === 'DEAL_TYPE_SELL')
        .map((d): Linha => {
          const comentario = String(d.comment ?? '')
          const doT2T = /^t2t[-_ ]/i.test(comentario)
          return {
            quando: new Date(d.time ?? Date.now()).toISOString(),
            origem: doT2T || t2tPorDefeito ? 'Tap to Trade' : 'MTM Copy',
            conta: rotulo,
            symbol: String(d.symbol ?? ''),
            // O fecho é a operação inversa da entrada: um fecho a VENDER fechou uma COMPRA.
            direction: d.type === 'DEAL_TYPE_SELL' ? 'buy' : 'sell',
            estado: 'fechada',
            resultado:
              Math.round((Number(d.profit ?? 0) + Number(d.commission ?? 0) + Number(d.swap ?? 0)) * 100) / 100,
            pips: null,
          }
        })
    }),
  )
  for (const lote of fechos) linhas.push(...lote)

  // ── Contas MTM Funded no MTM Auto (plataforma 'mtmfunded', migração 070) ───────────────────
  //
  // Negoceiam no nosso motor, não numa corretora: o resultado lê-se das posições simuladas.
  // UMA TRADE = a raiz mais as filhas dos parciais — ver `lib/mtmfunded/historico-parciais.ts`,
  // que explica porque é que este ecrã dizia 3 trades onde o Diário dizia 1.
  const { data: doFunded } = await db
    .from('mtmauto_accounts').select('rotulo, funded_account_id')
    .eq('user_id', userId!).eq('plataforma', 'mtmfunded').not('funded_account_id', 'is', null)
  let entradaFunded: string | null = null
  let houveFunded = false
  if (doFunded?.length) {
    const rotuloDe = new Map(doFunded.map((c) => [String(c.funded_account_id), String(c.rotulo ?? 'MTM Funded')]))
    const { data: fechadas } = await db
      .from('funded_positions')
      .select('id, mae_id, account_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, aberta_em, fechada_em')
      .in('account_id', [...rotuloDe.keys()]).eq('estado', 'fechada').gte('fechada_em', desde)
      .order('fechada_em', { ascending: false }).limit(2000)
    const partes = (fechadas ?? []) as unknown as ParteFechada[]
    houveFunded = partes.length > 0

    // A mãe de um parcial pode ter fechado FORA da janela, ou ainda estar aberta: nesse caso não
    // vem no lote acima. Sem esta pergunta, um parcial de uma posição ainda viva passava por
    // trade terminada só porque a mãe não estava à vista.
    const { conhecidas, emFalta } = raizesPorConfirmar(partes)
    if (emFalta.length) {
      const { data: maes } = await db
        .from('funded_positions').select('id, estado, aberta_em').in('id', emFalta)
      for (const m of maes ?? []) {
        if (String(m.estado) === 'fechada') conhecidas.add(String(m.id))
        const t = m.aberta_em ? String(m.aberta_em) : null
        if (t && (!entradaFunded || t < entradaFunded)) entradaFunded = t
      }
    }

    const { pipSizeForSymbol } = await import('@/lib/mtmcopy/trade-outcome')
    const trades = agruparParciais(partes, conhecidas, pipSizeForSymbol)
    const maisAntiga = entradaMaisAntiga(trades)
    if (maisAntiga && (!entradaFunded || maisAntiga < entradaFunded)) entradaFunded = maisAntiga

    for (const tr of trades) {
      linhas.push({
        quando: tr.quando,
        origem: 'MTM Auto',
        conta: rotuloDe.get(tr.accountId) ?? 'MTM Funded',
        symbol: tr.symbol,
        direction: tr.direcao,
        // Um parcial com o resto aberto não é uma trade fechada, e chamar-lhe «fechada» mandava o
        // cliente procurar no WebTrader uma posição que ainda lá está.
        estado: tr.terminada ? 'fechada' : 'parcial',
        resultado: tr.resultado,
        pips: tr.pips,
        contaParaTaxa: tr.terminada,
      })
    }
  }

  // ── E o que ainda está aberto ou por abrir: sem resultado, mas com estado ───────────────────
  const { data: t2t } = await db
    .from('mtmcopy_auto_positions')
    .select('symbol, direction, status, created_at, account_id')
    .gte('created_at', desde)
    .limit(500)

  for (const p of t2t ?? []) {
    const conta = contaDe.get(String(p.account_id))
    if (!conta) continue
    // Fechadas já entraram acima, com o resultado real da corretora.
    if (String(p.status) === 'closed') continue
    linhas.push({
      quando: String(p.created_at),
      origem: 'Tap to Trade',
      conta,
      symbol: String(p.symbol ?? ''),
      direction: (p.direction as string) ?? null,
      estado: String(p.status ?? ''),
      resultado: null,
      pips: null,
    })
  }

  linhas.sort((a, b) => b.quando.localeCompare(a.quando))

  // ── As curvas: uma POR CONTA, acumuladas do mais antigo para o mais recente ─────────────────
  //
  // Uma linha só, com tudo somado, esconde o que interessa: duas contas podem estar a puxar em
  // sentidos opostos e a soma dá quase zero, como se nada acontecesse. Uma linha por conta
  // mostra qual está a subir e qual está a arrastar o mês.
  const comResultado = [...linhas].filter((l) => l.resultado != null).sort((a, b) => a.quando.localeCompare(b.quando))

  const porConta = new Map<string, { quando: string; valor: number }[]>()
  const acumuladoDe = new Map<string, number>()
  let acumulado = 0
  const serie = comResultado.map((l) => {
    acumulado += Number(l.resultado ?? 0)
    const chave = l.conta ?? l.origem
    const anterior = acumuladoDe.get(chave) ?? 0
    const novo = Math.round((anterior + Number(l.resultado ?? 0)) * 100) / 100
    acumuladoDe.set(chave, novo)
    porConta.set(chave, [...(porConta.get(chave) ?? []), { quando: l.quando, valor: novo }])
    return { quando: l.quando, valor: Math.round(acumulado * 100) / 100 }
  })

  /**
   * A percentagem precisa de saber de QUE base se partiu.
   *
   * "+91,20" não diz nada sem o tamanho da conta: numa conta de 300 € é um mês muito bom, numa
   * de 30 000 € é ruído. A base é o saldo de hoje menos o que se ganhou na janela — é o saldo
   * com que se entrou nela.
   */
  const saldoPorConta = new Map<string, number>()
  try {
    for (const c of await contasDoUtilizador(userId!, true)) {
      if (c.saldo != null) saldoPorConta.set(String(c.rotulo ?? ''), c.saldo)
    }
  } catch {
    /* sem saldos mostra-se só o valor — a percentagem fica indisponível, não errada */
  }
  await Promise.all(
    contas.slice(0, 6).map(async (c) => {
      const token = process.env.METAAPI_TOKEN
      if (!token) return
      try {
        // Cache de 45 s (partilhada com contasDoUtilizador acima): a mesma conta era lida duas
        // vezes em cada abertura do histórico.
        const info = (await lerInfoContaCache(String(c.metaapi_account_id), { regiao: 'new-york', timeoutMs: 8000 })) as
          | { balance?: number }
          | null
        if (!info) return
        const rotulo = contaDe.get(String(c.metaapi_account_id))
        if (rotulo && info.balance != null) saldoPorConta.set(rotulo, info.balance)
      } catch {
        /* idem */
      }
    }),
  )

  const curvas = [...porConta.entries()]
    // Uma conta com um único ponto não desenha uma linha — desenha um ponto, e polui a legenda.
    .filter(([, pontos]) => pontos.length > 1)
    .map(([conta, pontos]) => {
      const total = pontos[pontos.length - 1]?.valor ?? 0
      const saldo = saldoPorConta.get(conta) ?? null
      // Base = saldo de hoje menos o que se ganhou na janela. Uma base <= 0 não dá percentagem
      // nenhuma que signifique alguma coisa, e inventar uma seria pior do que não a mostrar.
      const base = saldo != null ? saldo - total : null
      return {
        conta,
        origem: linhas.find((l) => (l.conta ?? l.origem) === conta)?.origem ?? 'MTM Auto',
        pontos: pontos.map((p) => ({
          ...p,
          pct: base && base > 0 ? Math.round((p.valor / base) * 10000) / 100 : null,
        })),
        total,
        base,
        totalPct: base && base > 0 ? Math.round((total / base) * 10000) / 100 : null,
      }
    })
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))

  // A taxa de acerto conta TRADES TERMINADAS, não saídas. Um parcial com o resto aberto já entrou
  // na curva (é dinheiro realizado) mas não é uma trade ganha — ainda não acabou.
  const terminadas = comResultado.filter((l) => l.contaParaTaxa !== false)
  const fechadas = terminadas.length
  const ganhas = terminadas.filter((l) => Number(l.resultado ?? 0) > 0).length

  /**
   * A ressalva do preço viciado — a MESMA de `lib/pips-proof.ts`, não uma cópia.
   *
   * As contas MTM Funded negoceiam no nosso motor `sim`, que até 24/09 preenchia as entradas
   * melhor do que o mercado dava. Tudo o que abriu antes de `FRONTEIRA_VIES_PRECO` está
   * inflacionado. Não se reescreve o passado: assinala-se, e quem lê desconta.
   *
   * Só aparece quando há linhas dessas na janela — as trades que vêm da corretora (MetaAPI)
   * nunca passaram por este motor, e uma ressalva que também aparece onde não se aplica ensina o
   * leitor a saltá-la. Some sozinha quando a janela deixar de apanhar o período.
   */
  const { notaViesPrecoDesdeEntrada, NOTA_VIES_ATE_DDMM } = await import('@/lib/pips-proof')
  const notaVies = houveFunded ? notaViesPrecoDesdeEntrada(entradaFunded) : null

  return NextResponse.json({
    ok: true,
    dias,
    notaVies,
    // A data sozinha, para o ecrã poder dizer a ressalva na língua do cliente sem a reescrever.
    notaViesAte: notaVies ? NOTA_VIES_ATE_DDMM : null,
    linhas: linhas.slice(0, 300),
    serie,
    curvas,
    resumo: {
      total: linhas.length,
      fechadas,
      resultado: Math.round(acumulado * 100) / 100,
      // A percentagem do conjunto: soma dos ganhos a dividir pela soma das bases. Fazer a média
      // das percentagens dava o mesmo peso a uma conta de 300 € e a uma de 30 000 €.
      resultadoPct: (() => {
        const bases = [...porConta.keys()]
          .map((c) => {
            const t = acumuladoDe.get(c) ?? 0
            const saldo = saldoPorConta.get(c)
            return saldo != null ? saldo - t : null
          })
          .filter((b): b is number => b != null && b > 0)
        const soma = bases.reduce((a, b) => a + b, 0)
        return soma > 0 ? Math.round((acumulado / soma) * 10000) / 100 : null
      })(),
      // Sem trades fechadas não se inventa uma taxa de acerto.
      winrate: fechadas ? Math.round((ganhas / fechadas) * 100) : null,
      porOrigem: ['MTM Auto', 'Tap to Trade', 'MTM Copy'].map((o) => ({
        origem: o,
        trades: linhas.filter((l) => l.origem === o).length,
      })),
    },
  })
}

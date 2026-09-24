/**
 * SINAL → MESTRE SIM — GoldKiller e Sensei (webhook TradingView) e o Premium (relay-post, via
 * lib/mestres/servidor/premium.ts) passam a abrir na conta SIMULADA da
 * casa que é a mestre da estratégia (mestres_estrategias.conta_mestre_id) e nas contas simuladas que a
 * seguem, com a gestão da estratégia (`sinais_config` → lib/mtmfunded/estrategias-sinais: BE, trailing,
 * parciais em PREÇO gravados na posição; o motor simulado do VPS executa-os ao nosso preço). É o mesmo
 * cano de Edge/King/Wolf (executar.ts), que já nasceram assim.
 *
 * `sinal_modo`:
 *  · desligado → nada (o caminho de sempre: ordem na mestre MT5 + espelho provider para a SIM)
 *  · sombra    → grava em `mestres_sinais` o que abriria (conta, lote, gestão) sem abrir nada
 *  · live      → abre na SIM e devolve `substituiMt5=true`: o webhook deixa de mandar a ordem para a
 *                mestre MT5 (senão o espelho provider traria a mesma trade uma segunda vez para a SIM).
 *
 * Chamado DENTRO dos portões do webhook (canExecuteProvider: interruptor por activo, gate de
 * qualidade, score, stops sãos). Nunca lança.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { abrirSinalNaConta, type ResultadoAbrir } from '@/lib/mtmfunded/estrategias-sinais/abrir'
import { chaveDoSinal, configDoProvider, gestaoDoSinal, impressaoDoTrade, loteParaConta } from '@/lib/mtmfunded/estrategias-sinais/calculo'
import { lerConfigGlobal, lerEstrategiaMestre, type ModoEstrategia } from '../tipos'
import { COMENTARIO_PREMIUM, SLUG_PREMIUM } from '../premium'

export interface AlvoDaFonte {
  slug: string
  comentario: string
  /**
   * Premium: `mtmauto_providers.ativo` do premium-ouro está FALSE de propósito (o dono desligou o MTM Auto
   * Premium a 17/09 — ligá-lo punha o mtm-auto e o espelho das seguidoras a executar pela conta MT5).
   * Aqui o interruptor é só `mestres_estrategias.sinal_modo` (+ kill-switch).
   */
  ignoraProviderAtivo?: boolean
  /**
   * Premium: o SME numera cada setup (1., 2., 3.…) e cada um é uma trade — a chave é o id EXACTO da
   * mensagem, e a regra «não abrir sem a anterior em BE + parcial» é decidida antes (lib/mestres/premium).
   */
  permitirDuplicado?: boolean
  /** prefixo da referência na chave do sinal ('tv' = registo do webhook; 'tg' = mensagem Telegram) */
  prefixo?: string
}

export const ESTRATEGIA_DO_WEBHOOK: Record<string, AlvoDaFonte> = {
  goldkiller: { slug: 'Goldkiller', comentario: 'MTM Auto GoldKiller' },
  sensei: { slug: 'sensei', comentario: 'MTM Auto Sensei' },
  /**
   * MTM Scanner (24/09, pedido do dono: «as entradas de mtm scanner devem ser passadas para a conta
   * que criaste de 10k mas apenas as que tiverem todas as confirmações»). A mestre é a conta 77696002
   * («Mestre · MTM Auto Scanner»); o filtro das confirmações está em lib/mtmcopy/scanner-confirmacoes
   * e é aplicado no webhook ANTES de chegar aqui. O scanner continua a NÃO executar em contas MT5 —
   * `canExecuteProvider` exclui-o de propósito desde 18/08, e isso não muda.
   */
  mtmscanner: { slug: 'mtm-scanner', comentario: 'MTM Auto Scanner' },
  // Premium (relay-post → processador → lib/mestres/servidor/premium.ts), não o webhook TradingView.
  premium: { slug: SLUG_PREMIUM, comentario: COMENTARIO_PREMIUM, ignoraProviderAtivo: true, permitirDuplicado: true, prefixo: 'tg' },
}

const cacheConfig = new Map<string, { linha: Record<string, unknown> | null; global: unknown; em: number }>()

export interface SinalWebhook {
  fonte: string
  symbol: string
  direcao: 'buy' | 'sell'
  entrada: number | null
  sl: number | null
  tps: number[]
  /** id do registo do webhook (tradingview_signals) — chave de idempotência */
  externalRef: string
  /**
   * Premium: entra a MERCADO com os níveis absolutos do trader (`entrada=null` → nada se re-ancora) e a
   * referência (1.º valor da zona) serve só para o registo e para a gestão calculada em sombra.
   */
  entradaReferencia?: number | null
}

export interface ResultadoSinalMestre {
  modo: ModoEstrategia
  substituiMt5: boolean
  estrategia?: string
  contas?: ResultadoAbrir[]
  motivo?: string
}

export async function encaminharSinalParaMestre(s: SinalWebhook): Promise<ResultadoSinalMestre> {
  const alvo = ESTRATEGIA_DO_WEBHOOK[s.fonte]
  if (!alvo) return { modo: 'desligado', substituiMt5: false }
  try {
    const db = getSupabaseAdmin()
    // Cache de 5 s: isto corre no caminho quente do webhook, antes da ordem na mestre MT5.
    const c = cacheConfig.get(alvo.slug)
    const lido = c && Date.now() - c.em < 5_000 ? c : await (async () => {
      const [{ data: linha, error }, { data: cfgGlobal }] = await Promise.all([
        db.from('mestres_estrategias').select('*').ilike('slug', alvo.slug).maybeSingle(),
        db.from('site_settings').select('value').eq('key', 'mestres_motor').maybeSingle(),
      ])
      const v = { linha: error ? null : (linha as Record<string, unknown> | null), global: cfgGlobal?.value ?? null, em: Date.now() }
      cacheConfig.set(alvo.slug, v)
      return v
    })()
    if (!lido.linha) return { modo: 'desligado', substituiMt5: false }
    const est = lerEstrategiaMestre(lido.linha)
    if (est.sinalModo === 'desligado') return { modo: 'desligado', substituiMt5: false }
    const global = lerConfigGlobal(lido.global)
    const substituiMt5 = est.sinalModo === 'live'
    if (global.kill) return { modo: est.sinalModo, substituiMt5, estrategia: est.slug, motivo: 'kill-switch: nada abre' }

    const { data: prov } = await db.from('mtmauto_providers').select('*').eq('id', est.providerId).maybeSingle()
    if (!prov || prov.apagado_em || (prov.ativo !== true && !alvo.ignoraProviderAtivo)) return { modo: est.sinalModo, substituiMt5, estrategia: est.slug, motivo: 'estratégia inactiva' }
    const cfg = { ...configDoProvider(prov as Record<string, unknown>), ...(alvo.permitirDuplicado ? { permitirDuplicado: true } : {}) }
    const ref = s.entradaReferencia ?? s.entrada
    // Sem referência (webhook sem registo, mensagem sem id) a chave cai nos níveis + hora — nunca numa
    // chave fixa `tv:` que juntava sinais diferentes.
    const chave = chaveDoSinal({ fonte: est.slug, msgId: s.externalRef && s.externalRef !== '0' ? `${alvo.prefixo ?? 'tv'}:${s.externalRef}` : null, symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl })
    const impressao = impressaoDoTrade({ symbol: s.symbol, direcao: s.direcao, entrada: ref })

    const contas = new Set<string>([est.contaMestreId])
    const { data: seguidoras } = await db.from('mtm_trading_accounts').select('id')
      .eq('motor', 'sim').eq('estado', 'ativa').ilike('segue_estrategia', est.slug).limit(2000)
    for (const c of seguidoras ?? []) contas.add(String(c.id))

    if (est.sinalModo === 'sombra') {
      // O que abriria na mestre: lote e gestão calculados como no live, sem tocar em posições.
      const { data: mestre } = await db.from('mtm_trading_accounts').select('sim_saldo, saldo_inicial').eq('id', est.contaMestreId).maybeSingle()
      const { data: simb } = await db.from('funded_symbols').select('*').eq('symbol', s.symbol.toUpperCase()).maybeSingle()
      const saldo = Number(mestre?.sim_saldo ?? mestre?.saldo_inicial ?? 0)
      const volume = simb ? loteParaConta(saldo, cfg, simb as never) : null
      const gestao = simb && volume && ref ? gestaoDoSinal({ simbolo: simb as never, direcao: s.direcao, precoExecucao: ref, volume, sl: s.sl, tps: s.tps, cfg }) : null
      await db.from('mestres_sinais').upsert({
        estrategia: est.slug, chave, modo: 'sombra', symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl, tps: s.tps,
        resultado: { contas: contas.size, mestre: est.contaMestreId, volumeMestre: volume, gestao: gestao?.gestao ?? null, tpFinal: gestao?.tpFinal ?? null },
      }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
      return { modo: 'sombra', substituiMt5: false, estrategia: est.slug }
    }

    const ids = [...contas]
    const resultados: ResultadoAbrir[] = []
    for (let i = 0; i < ids.length; i += 10) {
      resultados.push(...(await Promise.all(ids.slice(i, i + 10).map((accountId) => abrirSinalNaConta({
        accountId, estrategia: est.slug, chave, impressao, fonte: est.slug, comentario: alvo.comentario,
        symbol: s.symbol, direcao: s.direcao, entrada: s.entrada, sl: s.sl, tps: s.tps, cfg,
      })))))
    }
    await db.from('mestres_sinais').upsert({
      estrategia: est.slug, chave, modo: 'live', symbol: s.symbol, direcao: s.direcao, entrada: ref, sl: s.sl, tps: s.tps,
      resultado: { contas: resultados.map((r) => ({ conta: r.accountId, estado: r.estado, volume: r.volume ?? null, motivo: r.motivo ?? null })) },
    }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
    return { modo: 'live', substituiMt5: true, estrategia: est.slug, contas: resultados }
  } catch (e) {
    // Falhar aqui nunca pode deixar o sinal sem execução: em erro o webhook segue pelo caminho MT5.
    return { modo: 'desligado', substituiMt5: false, motivo: `erro: ${e instanceof Error ? e.message : String(e)}` }
  }
}

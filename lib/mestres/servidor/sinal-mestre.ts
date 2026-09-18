/**
 * SINAL → MESTRE SIM — GoldKiller e Sensei (webhook TradingView) passam a abrir na conta SIMULADA da
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

export const ESTRATEGIA_DO_WEBHOOK: Record<string, { slug: string; comentario: string }> = {
  goldkiller: { slug: 'Goldkiller', comentario: 'MTM Auto GoldKiller' },
  sensei: { slug: 'sensei', comentario: 'MTM Auto Sensei' },
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
    if (!prov || prov.ativo !== true || prov.apagado_em) return { modo: est.sinalModo, substituiMt5, estrategia: est.slug, motivo: 'estratégia inactiva' }
    const cfg = configDoProvider(prov as Record<string, unknown>)
    const chave = chaveDoSinal({ fonte: est.slug, msgId: `tv:${s.externalRef}`, symbol: s.symbol, direcao: s.direcao, entrada: s.entrada, sl: s.sl })
    const impressao = impressaoDoTrade({ symbol: s.symbol, direcao: s.direcao, entrada: s.entrada })

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
      const gestao = simb && volume && s.entrada ? gestaoDoSinal({ simbolo: simb as never, direcao: s.direcao, precoExecucao: s.entrada, volume, sl: s.sl, tps: s.tps, cfg }) : null
      await db.from('mestres_sinais').upsert({
        estrategia: est.slug, chave, modo: 'sombra', symbol: s.symbol, direcao: s.direcao, entrada: s.entrada, sl: s.sl, tps: s.tps,
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
      estrategia: est.slug, chave, modo: 'live', symbol: s.symbol, direcao: s.direcao, entrada: s.entrada, sl: s.sl, tps: s.tps,
      resultado: { contas: resultados.map((r) => ({ conta: r.accountId, estado: r.estado, volume: r.volume ?? null, motivo: r.motivo ?? null })) },
    }, { onConflict: 'estrategia,chave,modo', ignoreDuplicates: true })
    return { modo: 'live', substituiMt5: true, estrategia: est.slug, contas: resultados }
  } catch (e) {
    // Falhar aqui nunca pode deixar o sinal sem execução: em erro o webhook segue pelo caminho MT5.
    return { modo: 'desligado', substituiMt5: false, motivo: `erro: ${e instanceof Error ? e.message : String(e)}` }
  }
}

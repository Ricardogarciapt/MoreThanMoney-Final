/**
 * MTM Auto Edge / King / Wolf — os sinais de UM trader do PrimeVerse abertos na conta da casa da
 * estratégia (a mestre, mtmauto_providers.funded_account_id) e em todas as contas simuladas que a
 * seguem (mtm_trading_accounts.segue_estrategia = slug). Cada conta abre ao nosso preço com a
 * mesma gestão, por isso a seguidora faz o mesmo que a mestre sem ter de a ler.
 *
 * Contas REAIS (MT4/MT5/TradeLocker) copiam a mestre por rotas de cópia (078/083) em SOMBRA — ver
 * ./rotas.ts. O cadeado global do live mantém-se.
 *
 * Chamado pelo webhook /api/telegram/primeverse-exec (pv-relay). Nunca lança.
 *
 * Interruptor: a estratégia só executa com `mtmauto_providers.ativo = true` (nasce desligada, 092).
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { abrirSinalNaConta, aplicarNasPontes, type PonteViva, type ResultadoAbrir } from './abrir'
import {
  accaoDoSeguimento, chaveDoSinal, configDoProvider, estrategiaDoTrader, impressaoDoTrade,
} from './calculo'

export type KindPrimeverse = 'setup' | 'entry_hit' | 'cancel' | 'close' | 'tp_hit' | 'sl_be' | 'sl_hit'

export interface SinalPrimeverse {
  kind: KindPrimeverse
  trader: string
  symbol: string
  direction: 'buy' | 'sell'
  entry: number | null
  sl: number | null
  tps: number[]
  /** id da mensagem do SETUP no canal (relay novo manda `setup_msg_id`) */
  setupMsgId?: string | number | null
}

export interface ResultadoEstrategia {
  estrategia: string
  accao: string
  skipped?: string
  contas?: ResultadoAbrir[]
  fechadas?: number
  be?: number
  erros?: string[]
}

export async function encaminharPrimeverseParaEstrategia(s: SinalPrimeverse): Promise<ResultadoEstrategia | null> {
  const est = estrategiaDoTrader(s.trader)
  if (!est) return null
  try {
    const db = getSupabaseAdmin()
    const { data: prov } = await db.from('mtmauto_providers').select('*').ilike('slug', est.slug).limit(1).maybeSingle()
    if (!prov) return { estrategia: est.slug, accao: s.kind, skipped: 'estrategia_por_criar (092)' }
    if (prov.ativo !== true || prov.apagado_em) return { estrategia: est.slug, accao: s.kind, skipped: prov.apagado_em ? 'estrategia_apagada' : 'estrategia_desligada' }
    const cfg = configDoProvider(prov as Record<string, unknown>)

    if (s.kind === 'setup' || s.kind === 'tp_hit' || s.kind === 'sl_hit') {
      // setup: ainda não há preço na entrada · tp/sl: o motor fecha pelo NOSSO preço
      return { estrategia: est.slug, accao: s.kind, skipped: 'sem_accao' }
    }

    if (s.kind === 'entry_hit') {
      const contas = new Set<string>()
      if (prov.funded_account_id) contas.add(String(prov.funded_account_id))
      const { data: seguidoras } = await db.from('mtm_trading_accounts').select('id')
        .eq('motor', 'sim').eq('estado', 'ativa').ilike('segue_estrategia', est.slug).limit(2000)
      for (const c of seguidoras ?? []) contas.add(String(c.id))
      if (!contas.size) return { estrategia: est.slug, accao: 'entry_hit', skipped: 'sem_contas' }

      const chave = chaveDoSinal({ fonte: est.slug, msgId: s.setupMsgId, symbol: s.symbol, direcao: s.direction, entrada: s.entry, sl: s.sl })
      const impressao = impressaoDoTrade({ symbol: s.symbol, direcao: s.direction, entrada: s.entry })
      const resultados: ResultadoAbrir[] = []
      // Em lotes de 10: mestre e seguidoras abrem no mesmo segundo, sem esgotar ligações à base.
      const ids = [...contas]
      for (let i = 0; i < ids.length; i += 10) {
        resultados.push(...(await Promise.all(ids.slice(i, i + 10).map((accountId) => abrirSinalNaConta({
          accountId, estrategia: est.slug, chave, impressao, fonte: est.slug, comentario: est.comentario,
          symbol: s.symbol, direcao: s.direction, entrada: s.entry, sl: s.sl, tps: s.tps, cfg,
        })))))
      }
      return { estrategia: est.slug, accao: 'entry_hit', contas: resultados }
    }

    // seguimentos: close / cancel / sl_be
    const accao = accaoDoSeguimento(s.kind)
    if (accao === 'nada') return { estrategia: est.slug, accao: s.kind, skipped: 'sem_accao' }
    // Um cancelamento é sempre seguido (a entrada falhou); fechos e BE do trader só com seguirFechosDaFonte.
    if (accao !== 'cancelar' && !cfg.seguirFechosDaFonte) return { estrategia: est.slug, accao, skipped: 'gestao_so_do_motor' }
    let q = db.from('funded_sinal_posicoes').select('id, account_id, funded_position_id, estado')
      .eq('estrategia', est.slug).in('estado', ['a_abrir', 'aberta'])
      .gte('created_at', new Date(Date.now() - 72 * 3600_000).toISOString())
    if (s.setupMsgId != null && String(s.setupMsgId).trim()) {
      q = q.eq('chave', chaveDoSinal({ fonte: est.slug, msgId: s.setupMsgId, symbol: s.symbol, direcao: s.direction, entrada: null, sl: null }))
    } else {
      q = q.eq('symbol', s.symbol).eq('direcao', s.direction)
    }
    const { data: pontes } = await q.order('created_at', { ascending: false }).limit(2000)
    let alvo = (pontes ?? []) as PonteViva[]
    if (!(s.setupMsgId != null && String(s.setupMsgId).trim()) && alvo.length) {
      // Sem id do setup: só o sinal MAIS RECENTE deste par/direcção (a chave agrupa mestre+seguidoras).
      const { data: maisRecente } = await db.from('funded_sinal_posicoes').select('chave')
        .eq('id', alvo[0].id).maybeSingle()
      const chaveRecente = maisRecente?.chave
      if (chaveRecente) {
        const { data: doSinal } = await db.from('funded_sinal_posicoes').select('id, account_id, funded_position_id, estado')
          .eq('estrategia', est.slug).eq('chave', chaveRecente).in('estado', ['a_abrir', 'aberta']).limit(2000)
        alvo = (doSinal ?? []) as PonteViva[]
      }
    }
    if (!alvo.length) return { estrategia: est.slug, accao, skipped: 'sem_posicoes' }
    const r = await aplicarNasPontes(alvo, accao)
    return { estrategia: est.slug, accao, ...r }
  } catch (e) {
    return { estrategia: est.slug, accao: s.kind, skipped: `erro: ${e instanceof Error ? e.message : String(e)}` }
  }
}

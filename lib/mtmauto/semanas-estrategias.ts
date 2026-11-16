/**
 * AS SEMANAS DE CADA ESTRATÉGIA — em pips, medidas na conta-mestre que os clientes copiam.
 *
 * Um número só, para duas coisas (pedido do Ricardo, 16/11/2026):
 *
 *  1. O FLYER «Resultados da Semana» passa a mostrar TODAS as estratégias em uso no MTM Auto, e
 *     não só as quatro fontes fixas de Agosto. Lê o que este módulo guardou.
 *  2. A REGRA DO ARQUIVO: uma estratégia com TRÊS semanas seguidas negativas em pips vai para
 *     arquivo — sai dos catálogos e das estatísticas do MTM Auto e do MTM System, a cópia pára e
 *     o admin é avisado. O histórico fica (é o `arquivada_em` da migração 227, não o apagar).
 *
 * ── De onde vêm os pips ───────────────────────────────────────────────────────────────────────
 * Da CONTA-MESTRE da estratégia (`mtmauto_providers.funded_account_id`, motor `sim`): desde 23/09 é
 * ela que abre cada sinal, e é dela que o motor de cópia replica para os clientes. Uma trade é a
 * posição com os parciais pesados pelo volume (`agruparParciais`, a regra do Histórico e do
 * Diário). Ficam de fora as linhas `fora_estatisticas = 'anulada_erro'` (migração 228).
 *
 * Índices e cripto medem-se em PONTOS (`pipSizeForSymbol` = 1): somam-se à parte, como no flyer.
 * Para a regra conta o sinal da semana (pips + pontos): cada estratégia negoceia uma classe só.
 *
 * ── A semana ──────────────────────────────────────────────────────────────────────────────────
 * Segunda 00:00 UTC → segunda seguinte. Fica FECHADA ao sábado 00:00 UTC (o forex fechou na
 * sexta). Uma semana sem trades não é negativa — e quebra a sequência: uma estratégia parada não
 * se arquiva por estar parada, arquiva-se por perder.
 *
 * As funções puras estão em cima (o teste chama-as com números à mão); a base fica em baixo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { agruparParciais, raizesPorConfirmar, type ParteFechada } from '@/lib/mtmfunded/historico-parciais'
import { pipSizeForSymbol } from '@/lib/mtmcopy/trade-outcome'

export const CHAVE_SEMANAS = 'estrategias_semanas'
/** Quantas semanas seguidas negativas mandam a estratégia para arquivo. */
export const SEMANAS_NEGATIVAS_PARA_ARQUIVO = 3
/** Quantas semanas se guardam (o flyer de uma semana passada também tem de se poder refazer). */
export const SEMANAS_GUARDADAS = 12

const DIA = 86_400_000

export interface Semana {
  /** Segunda-feira 00:00 UTC, `YYYY-MM-DD`. */
  inicio: string
  trades: number
  ganhas: number
  perdas: number
  /** Pips (forex, ouro, prata). */
  pips: number
  /** Pontos (índices, cripto). */
  pontos: number
  /** Melhor trade em pips (não em pontos), e o símbolo dela. */
  melhorPips: number
  melhorSimbolo: string | null
  fechada: boolean
}

export interface SemanasDaEstrategia {
  slug: string
  nome: string
  ativo: boolean
  arquivada: boolean
  semanas: Semana[]
}

export interface RetratoSemanal {
  /** Quando foi medido. */
  em: string
  estrategias: SemanasDaEstrategia[]
}

/** Segunda-feira 00:00 UTC da semana que contém `d`. */
export function segundaDe(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dow = x.getUTCDay()
  x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1))
  return x
}

/** As últimas `n` segundas, da mais antiga para a da semana corrente. */
export function segundasAte(agora: Date, n: number): Date[] {
  const ultima = segundaDe(agora).getTime()
  return Array.from({ length: n }, (_, i) => new Date(ultima - (n - 1 - i) * 7 * DIA))
}

/** A semana fecha ao sábado 00:00 UTC. */
export function semanaFechada(inicio: Date, agora: Date): boolean {
  return agora.getTime() >= inicio.getTime() + 5 * DIA
}

export interface TradeMedida {
  quando: string
  symbol: string
  pips: number | null
  resultado: number
  terminada: boolean
}

/** Distribui as trades pelas semanas. Um parcial (posição ainda viva) entra nos pips, não nas contagens. */
export function porSemana(trades: TradeMedida[], segundas: Date[], agora: Date): Semana[] {
  const semanas: Semana[] = segundas.map((s) => ({
    inicio: s.toISOString().slice(0, 10), trades: 0, ganhas: 0, perdas: 0, pips: 0, pontos: 0,
    melhorPips: 0, melhorSimbolo: null, fechada: semanaFechada(s, agora),
  }))
  for (const t of trades) {
    const q = Date.parse(t.quando)
    if (!Number.isFinite(q)) continue
    const i = segundas.findIndex((s) => q >= s.getTime() && q < s.getTime() + 7 * DIA)
    if (i < 0) continue
    const w = semanas[i]!
    if (t.pips != null && Number.isFinite(t.pips)) {
      const emPontos = pipSizeForSymbol(t.symbol) === 1
      if (emPontos) w.pontos = Math.round((w.pontos + t.pips) * 10) / 10
      else {
        w.pips = Math.round((w.pips + t.pips) * 10) / 10
        if (t.terminada && t.pips > w.melhorPips) {
          w.melhorPips = Math.round(t.pips * 10) / 10
          w.melhorSimbolo = t.symbol
        }
      }
    }
    if (t.terminada) {
      w.trades += 1
      const v = t.pips ?? t.resultado
      if (v > 0) w.ganhas += 1
      else if (v < 0) w.perdas += 1
    }
  }
  return semanas
}

/**
 * A REGRA DO ARQUIVO: as últimas N semanas FECHADAS, todas com trades e todas negativas.
 * Devolve as semanas que a justificam (para o aviso dizer porquê), ou null.
 */
export function semanasParaArquivo(semanas: Semana[], n = SEMANAS_NEGATIVAS_PARA_ARQUIVO): Semana[] | null {
  const fechadas = semanas.filter((s) => s.fechada)
  if (fechadas.length < n) return null
  const ultimas = fechadas.slice(-n)
  const negativas = ultimas.every((s) => s.trades > 0 && s.pips + s.pontos < 0)
  return negativas ? ultimas : null
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Base de dados.
// ─────────────────────────────────────────────────────────────────────────────────────────────

interface Provider {
  id: string
  slug: string
  nome: string
  ativo: boolean
  arquivada_em: string | null
  funded_account_id: string | null
}

/** Mede as semanas de todas as estratégias com conta-mestre (vivas, paradas e arquivadas). */
export async function medirSemanas(db: SupabaseClient, agora = new Date(), n = SEMANAS_GUARDADAS): Promise<RetratoSemanal> {
  const { data: provs, error } = await db
    .from('mtmauto_providers')
    .select('id, slug, nome, ativo, arquivada_em, funded_account_id')
    .is('apagado_em', null)
    .not('funded_account_id', 'is', null)
  if (error) throw new Error(`mtmauto_providers: ${error.message}`)
  const segundas = segundasAte(agora, n)
  const desde = segundas[0]!.toISOString()

  const estrategias: SemanasDaEstrategia[] = []
  for (const p of (provs ?? []) as Provider[]) {
    const partes: ParteFechada[] = []
    for (let de = 0; de < 20_000; de += 1000) {
      const { data, error: e } = await db
        .from('funded_positions')
        .select('id, mae_id, account_id, symbol, direcao, volume, preco_entrada, preco_fecho, pnl, comissao, swap, aberta_em, fechada_em')
        .eq('account_id', p.funded_account_id!)
        .eq('estado', 'fechada')
        .gte('fechada_em', desde)
        .or('fora_estatisticas.is.null,fora_estatisticas.neq.anulada_erro')
        .order('fechada_em')
        .range(de, de + 999)
      if (e) throw new Error(`funded_positions (${p.slug}): ${e.message}`)
      partes.push(...((data ?? []) as unknown as ParteFechada[]))
      if ((data ?? []).length < 1000) break
    }
    const { conhecidas, emFalta } = raizesPorConfirmar(partes)
    for (let i = 0; i < emFalta.length; i += 300) {
      const { data: maes } = await db.from('funded_positions').select('id, estado').in('id', emFalta.slice(i, i + 300))
      for (const m of maes ?? []) if (String(m.estado) === 'fechada') conhecidas.add(String(m.id))
    }
    const trades = agruparParciais(partes, conhecidas, pipSizeForSymbol).map((t) => ({
      quando: t.quando, symbol: t.symbol, pips: t.pips, resultado: t.resultado, terminada: t.terminada,
    }))
    estrategias.push({
      slug: p.slug,
      nome: p.nome ?? p.slug,
      ativo: p.ativo === true,
      arquivada: !!p.arquivada_em,
      semanas: porSemana(trades, segundas, agora),
    })
  }
  return { em: agora.toISOString(), estrategias }
}

export async function guardarSemanas(db: SupabaseClient, r: RetratoSemanal): Promise<void> {
  const { error } = await db.from('site_settings').upsert(
    {
      key: CHAVE_SEMANAS,
      value: r,
      description: 'Pips por semana de cada estratégia MTM Auto (conta-mestre). Escrito pelo cron estrategias-semanas; lido pelo flyer semanal e pela regra do arquivo.',
      updated_at: new Date().toISOString(),
      updated_by: 'cron:estrategias-semanas',
    },
    { onConflict: 'key' },
  )
  if (error) throw new Error(`site_settings: ${error.message}`)
}

export async function lerSemanas(db: SupabaseClient): Promise<RetratoSemanal | null> {
  const { data } = await db.from('site_settings').select('value').eq('key', CHAVE_SEMANAS).maybeSingle()
  const v = (data as { value?: unknown } | null)?.value
  const r = typeof v === 'string' ? (JSON.parse(v) as RetratoSemanal) : (v as RetratoSemanal | undefined)
  return r && Array.isArray(r.estrategias) ? r : null
}

/**
 * ARQUIVAR por desempenho — o mesmo que «arquivar» (227) e, além disso, PARAR a cópia.
 *
 * Arquivar só tirava a estratégia dos catálogos; quem a seguia continuava a copiá-la. Aqui a
 * regra é a do dono: a estratégia que perde três semanas seguidas deixa de ser copiada. O que se
 * desliga é exactamente o que o «apagar parando» desliga (`estrategia-escrita.ts`), sem apagar:
 * seguidores MTM Auto, contas MTM Funded que a seguem, rotas do motor de cópia e sinais abertos.
 * O histórico, a mestre e o chat ficam — o chat sai da lista porque a estratégia sai do catálogo.
 */
export async function arquivarPorDesempenho(
  db: SupabaseClient,
  p: { id: string; slug: string },
  motivo: string,
): Promise<{ ok: boolean; erro?: string }> {
  const agora = new Date().toISOString()
  const { error: e1 } = await db.from('mtmauto_providers')
    .update({ arquivada_em: agora, ativo: false, espelhar: false, updated_at: agora })
    .eq('id', p.id).is('arquivada_em', null)
  if (e1) return { ok: false, erro: e1.message }
  const erros: string[] = []
  const passos = await Promise.all([
    db.from('mtmauto_subscriptions').update({ ativo: false, auto_aceitar: false }).eq('provider_id', p.id).eq('ativo', true),
    db.from('mtm_trading_accounts').update({ segue_estrategia: null }).eq('segue_estrategia', p.slug),
    db.from('copia_rotas').update({ ativa: false, pausada_motivo: `arquivada: ${motivo}`.slice(0, 200) }).eq('origem_ref', `prov:${p.id}`).eq('ativa', true),
    db.from('mtmauto_signals').update({ estado: 'closed', updated_at: agora }).eq('provider_id', p.id).in('estado', ['pending', 'active']),
    // A mestre continua a negociar e a publicar no chat dela (`sinal_modo` fica): é assim que se
    // vê se a estratégia recupera. Deixa de copiar para clientes e de servir o Tap to Trade.
    db.from('mestres_estrategias').update({ modo: 'sombra', t2t_modo: 'sombra', updated_at: agora }).eq('provider_id', p.id),
  ])
  for (const r of passos) if (r.error) erros.push(r.error.message)
  return erros.length ? { ok: false, erro: erros.join(' · ') } : { ok: true }
}

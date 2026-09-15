/**
 * `fontePosicoesStreaming` — posições e preços das contas do motor a partir da fotografia que o
 * serviço de streaming do VPS escreve em `metaapi_snapshot` (ver metaapi-snapshot-regras.ts).
 *
 * Só para as contas em `PREMIUM_STREAMING_CONTAS` (vazio = desligado, tudo como antes). Para essas:
 * fotografia fresca (≤3 s) E sincronizada → usa-a; senão cai no RPC EXACTAMENTE como hoje
 * (`readOpenPositions` / `getMarketPrice`). Qualquer erro a ler a fotografia = RPC.
 *
 * Sombra: de 30 em 30 s por conta, lê também por RPC e grava as diferenças em
 * `metaapi_snapshot_sombra`. Não influencia nada — é só para verificar antes de alargar.
 */
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMarketPrice, precoRest, readOpenPositions, type MetaApiPosition } from './metaapi'
import { rankedBrokerSymbols } from './symbol-resolver'
import {
  amostraSombraDevida,
  contasStreaming,
  PRECO_MONITOR_MAX_IDADE_MS,
  precoDoSnapshotParaMonitor,
  decidirFonte,
  diferencasSombra,
  posicaoParaSnapshot,
  precoDoSnapshot,
  SOMBRA_INTERVALO_MS,
  type DecisaoFonte,
  type MetaApiSnapshot,
  type PosicaoSnapshot,
} from './metaapi-snapshot-regras'

export function contaEmStreaming(accountId: string): boolean {
  return contasStreaming(process.env.PREMIUM_STREAMING_CONTAS).includes(accountId)
}

async function lerSnapshot(accountId: string): Promise<MetaApiSnapshot | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from('metaapi_snapshot')
      .select('account_id, posicoes, precos, sincronizado, em')
      .eq('account_id', accountId)
      .maybeSingle()
    if (error || !data) return null
    return {
      account_id: String(data.account_id),
      posicoes: Array.isArray(data.posicoes) ? (data.posicoes as PosicaoSnapshot[]) : [],
      precos: data.precos && typeof data.precos === 'object' ? (data.precos as MetaApiSnapshot['precos']) : {},
      sincronizado: data.sincronizado === true,
      em: String(data.em),
    }
  } catch {
    return null
  }
}

export interface LeituraPosicoes {
  /** null = não consegui ler (mesma semântica do readOpenPositions). */
  posicoes: MetaApiPosition[] | null
  decisao: DecisaoFonte
  /** Presente só quando a fonte usada foi a fotografia. */
  snapshot: MetaApiSnapshot | null
}

/**
 * Posições da conta: fotografia quando é de confiança, RPC caso contrário.
 * Contas fora da lista → RPC directo, sem sequer ler a tabela.
 */
export async function lerPosicoesMotor(accountId: string, agoraMs = Date.now()): Promise<LeituraPosicoes> {
  if (!contaEmStreaming(accountId)) {
    return { posicoes: await readOpenPositions(accountId), decisao: { fonte: 'rpc', motivo: 'fora da lista' }, snapshot: null }
  }
  const snap = await lerSnapshot(accountId)
  const decisao = decidirFonte(snap, agoraMs)
  if (decisao.fonte === 'snapshot' && snap) {
    return { posicoes: snap.posicoes as MetaApiPosition[], decisao, snapshot: snap }
  }
  return { posicoes: await readOpenPositions(accountId), decisao, snapshot: null }
}

/**
 * Preço ao vivo para o trailing: da fotografia (símbolo da própria posição) quando há tick
 * recente; senão o preço dos monitores (`precoParaMonitor`: fotografia <5 s → REST current-price),
 * nunca o RPC com getSymbols.
 */
export async function precoMotor(
  accountId: string,
  canonicalSymbol: string,
  simboloDaPosicao: string,
  snapshot: MetaApiSnapshot | null,
): Promise<number | null> {
  if (snapshot) {
    const p = precoDoSnapshot(snapshot, simboloDaPosicao)
    if (p != null && p > 0) return p
  }
  return precoParaMonitor(accountId, canonicalSymbol)
}

// Uma leitura da fotografia por conta por segundo por instância chega (vários símbolos na mesma passagem).
const snapshotRecente = new Map<string, { snap: MetaApiSnapshot | null; lidoEm: number }>()

/**
 * Preço (mid) para os MONITORES de fundo (T2T, signal-tracker, trailing), pela ordem mais barata:
 *  1. contas em streaming: a fotografia do VPS, se tiver <5 s e o tick do símbolo — 0 créditos;
 *  2. REST `current-price` (50 créditos), com o símbolo da corretora da lista partilhada.
 * Nunca pede getSymbols só para um preço. null = sem preço (quem chama já sabe saltar).
 */
export async function precoParaMonitor(accountId: string, canonicalSymbol: string, agoraMs = Date.now()): Promise<number | null> {
  if (contaEmStreaming(accountId)) {
    let e = snapshotRecente.get(accountId)
    if (!e || agoraMs - e.lidoEm > 1_000) {
      e = { snap: await lerSnapshot(accountId), lidoEm: agoraMs }
      snapshotRecente.set(accountId, e)
    }
    const snap = e.snap
    if (snap) {
      const chave = rankedBrokerSymbols(canonicalSymbol, Object.keys(snap.precos ?? {}))[0]
      const p = chave ? precoDoSnapshotParaMonitor(snap, chave, agoraMs, PRECO_MONITOR_MAX_IDADE_MS) : null
      if (p != null && p > 0) return p
    }
  }
  return precoRest(accountId, canonicalSymbol)
}

// ── sombra ─────────────────────────────────────────────────────────────────────

const ultimaSombra = new Map<string, number>()

/**
 * Compara a fotografia com uma leitura RPC da mesma conta, no máximo 1× por 30 s (memória da
 * instância + última linha gravada, porque há várias instâncias serverless). Nunca lança.
 */
export async function sombraSnapshot(
  accountId: string,
  snapshot: MetaApiSnapshot,
  simbolos: Array<{ canonico: string; corretora: string }>,
  agoraMs = Date.now(),
): Promise<void> {
  try {
    if (!amostraSombraDevida(ultimaSombra.get(accountId), agoraMs)) return
    ultimaSombra.set(accountId, agoraMs)
    const admin = getSupabaseAdmin()
    const { data: ultima } = await admin
      .from('metaapi_snapshot_sombra')
      .select('em')
      .eq('account_id', accountId)
      .order('em', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (ultima?.em && !amostraSombraDevida(Date.parse(String(ultima.em)), agoraMs, SOMBRA_INTERVALO_MS - 2_000)) return

    const rpc = await readOpenPositions(accountId)
    if (rpc == null) return // RPC ilegível: não há com que comparar
    const rpcPos = rpc.map((p) => posicaoParaSnapshot(p as unknown as Record<string, unknown>)).filter((p): p is PosicaoSnapshot => !!p)
    const vistos = new Set<string>()
    const precos = []
    for (const s of simbolos) {
      if (vistos.has(s.corretora)) continue
      vistos.add(s.corretora)
      precos.push({
        symbol: s.canonico,
        snapshot: precoDoSnapshot(snapshot, s.corretora),
        rpc: await getMarketPrice(accountId, s.canonico),
      })
    }
    const r = diferencasSombra(snapshot.posicoes, rpcPos, precos)
    const idadeMs = agoraMs - Date.parse(snapshot.em)
    if (!r.iguais) console.warn(`[snapshot-sombra] ${accountId.slice(0, 8)} DIFERE (${idadeMs} ms):`, r.diferencas.join(' · '))
    await admin.from('metaapi_snapshot_sombra').insert({
      account_id: accountId,
      snapshot_em: snapshot.em,
      idade_ms: Number.isFinite(idadeMs) ? idadeMs : null,
      iguais: r.iguais,
      diferencas: r.diferencas,
      contagem_snapshot: r.contagem.snapshot,
      contagem_rpc: r.contagem.rpc,
      preco_delta_pips: r.precoDeltaPips,
    })
  } catch (e) {
    console.warn('[snapshot-sombra] falhou:', e instanceof Error ? e.message : String(e))
  }
}

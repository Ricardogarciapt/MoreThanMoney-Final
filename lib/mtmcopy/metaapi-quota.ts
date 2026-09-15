/**
 * TRAVÃO DE QUOTA da MetaApi — as ORDENS dos clientes nunca perdem para as leituras de fundo.
 *
 * A MetaApi conta «cpu credits» por janelas de 6 h, por API e por APLICAÇÃO (o nosso token, a
 * multiplicar pelo número de contas). A 2026-09-15 10:45 UTC o balde do `getSymbols` esgotou e o
 * sinal Premium falhou na mestre e em 3 subscritores — gasto por monitores que leem de segundo a
 * segundo.
 *
 * Regra:
 *  - Quando se vê um erro de quota em QUALQUER chamada, regista-se um bloqueio para a conta e
 *    para '*' (global, porque a quota é do token), na memória e na tabela
 *    `metaapi_simbolos_cache` (para as outras instâncias).
 *  - Leituras feitas DENTRO de `emSegundoPlano(...)` (monitores) perguntam
 *    `leituraDeFundoBloqueada` e, se sim, SALTAM (devolvem «não consegui ler», nunca lançam).
 *  - Ordens, fechos, modificações e o dimensionamento de ordens nunca consultam este travão.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { loja, SEM_TABELA } from './metaapi-loja'

export const CONTA_GLOBAL = '*'
const MIN_BLOQUEIO_MS = 60_000
const MAX_BLOQUEIO_MS = 60 * 60_000
/** Duração quando o erro não traz a hora recomendada. */
export function bloqueioPadraoMs(): number {
  const min = Number(process.env.METAAPI_QUOTA_BLOQUEIO_MIN)
  return Number.isFinite(min) && min > 0 ? min * 60_000 : 10 * 60_000
}
/** Cada instância relê os bloqueios da tabela no máximo a este ritmo por conta. */
export const RELER_BLOQUEIOS_MS = 15_000

// ── regras puras ────────────────────────────────────────────────────────────────────────────────

function textoDoErro(err: unknown): string {
  if (err == null) return ''
  if (typeof err === 'string') return err
  const e = err as { message?: unknown; name?: unknown }
  return `${String(e.name ?? '')} ${String(e.message ?? '')}`
}

/** É um erro de quota/limite de pedidos da MetaApi? */
export function ehErroDeQuota(err: unknown): boolean {
  if (!err) return false
  const e = err as { status?: unknown; statusCode?: unknown; name?: unknown }
  if (e.status === 429 || e.statusCode === 429) return true
  if (String(e.name ?? '') === 'TooManyRequestsError') return true
  return /cpu credits|too ?many ?requests|rate ?limit|TooManyRequests/i.test(textoDoErro(err))
}

/** A API que estourou, se a mensagem a disser (ex.: «ws:getSymbols»). */
export function apiDoErro(err: unknown): string | null {
  const m = textoDoErro(err).match(/((?:ws|rest|http)s?:[A-Za-z_]+)\s+API allows/i)
  return m ? m[1] : null
}

/** Até quando bloquear: a hora recomendada pela MetaApi (limitada), senão o padrão. */
export function bloqueioAteDoErro(err: unknown, agoraMs: number, padraoMs = bloqueioPadraoMs()): number {
  const meta = (err as { metadata?: { recommendedRetryTime?: unknown } } | null)?.metadata
  const rec = meta?.recommendedRetryTime
  const t = rec instanceof Date ? rec.getTime() : rec != null ? Date.parse(String(rec)) : NaN
  const dur = Number.isFinite(t) ? t - agoraMs : padraoMs
  return agoraMs + Math.min(MAX_BLOQUEIO_MS, Math.max(MIN_BLOQUEIO_MS, dur))
}

// ── contexto «segundo plano» ────────────────────────────────────────────────────────────────────

const contexto = new AsyncLocalStorage<{ fundo: true }>()

/** Corre `fn` como trabalho de FUNDO: as leituras lá dentro respeitam o travão de quota. */
export function emSegundoPlano<T>(fn: () => Promise<T>): Promise<T> {
  return contexto.run({ fundo: true }, fn)
}

export function ehSegundoPlano(): boolean {
  return contexto.getStore()?.fundo === true
}

// ── estado ──────────────────────────────────────────────────────────────────────────────────────

const bloqueiosLocais = new Map<string, number>()
const bloqueiosLidos = new Map<string, { ate: number | null; lidoEm: number }>()
let ultimaEscrita = 0

/**
 * Regista um erro de quota visto nesta instância. Nunca lança. Devolve true se era de quota.
 * Escreve na tabela no máximo 1×/30 s por instância (um erro repete-se em rajada).
 */
export async function registarErroQuota(accountId: string | null | undefined, err: unknown, agoraMs = Date.now()): Promise<boolean> {
  if (!ehErroDeQuota(err)) return false
  const ate = bloqueioAteDoErro(err, agoraMs)
  const ids = [CONTA_GLOBAL, ...(accountId ? [accountId] : [])]
  for (const id of ids) bloqueiosLocais.set(id, Math.max(bloqueiosLocais.get(id) ?? 0, ate))
  if (agoraMs - ultimaEscrita < 30_000) return true
  ultimaEscrita = agoraMs
  const motivo = textoDoErro(err).trim()
  console.warn(`[metaapi-quota] quota esgotada (${apiDoErro(err) ?? '?'}) — leituras de fundo em pausa até ${new Date(ate).toISOString()}:`, motivo.slice(0, 200))
  try {
    await loja().bloquear(ids, ate, apiDoErro(err), motivo)
  } catch (e) {
    console.warn('[metaapi-quota] não gravou o bloqueio:', e instanceof Error ? e.message : String(e))
  }
  return true
}

/**
 * As leituras de FUNDO desta conta devem saltar agora? Memória primeiro; a tabela é relida no
 * máximo de 15 em 15 s por instância (uma query às linhas da conta e '*'). Falha a ler = não bloqueia.
 */
export async function leituraDeFundoBloqueada(accountId: string, agoraMs = Date.now()): Promise<boolean> {
  const ids = [CONTA_GLOBAL, accountId]
  if (ids.some((id) => (bloqueiosLocais.get(id) ?? 0) > agoraMs)) return true
  const chave = accountId
  const lido = bloqueiosLidos.get(chave)
  if (lido && agoraMs - lido.lidoEm < RELER_BLOQUEIOS_MS) return lido.ate != null && lido.ate > agoraMs
  let ate: number | null = null
  try {
    const m = await loja().lerBloqueios(ids)
    if (m !== SEM_TABELA) {
      for (const id of ids) {
        const t = m.get(id)
        if (t != null && t > agoraMs) ate = Math.max(ate ?? 0, t)
      }
    }
  } catch {
    ate = null
  }
  bloqueiosLidos.set(chave, { ate, lidoEm: agoraMs })
  return ate != null && ate > agoraMs
}

/** Há bloqueio conhecido NESTA instância (sem ir à base)? Para decidir não pedir getSymbols. */
export function bloqueioLocalAtivo(accountId: string, agoraMs = Date.now()): boolean {
  return [CONTA_GLOBAL, accountId].some((id) => (bloqueiosLocais.get(id) ?? 0) > agoraMs)
}

/** Só para testes. */
export function __limparQuota(): void {
  bloqueiosLocais.clear()
  bloqueiosLidos.clear()
  ultimaEscrita = 0
}

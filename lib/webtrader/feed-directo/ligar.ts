"use client"

/**
 * A PORTA DO FEED DIRECTO NO BROWSER: pede a credencial curta ao servidor e constrói o feed certo.
 * O módulo da MetaApi (com o SDK de 6,8 MB) só se carrega quando a conta é MT — uma conta
 * TradeLocker nunca o descarrega.
 */
import { authHeaders } from '@/lib/auth-token'
import { lerSessoesTL } from '@/components/webtrader/api-corretoras'
import type { CredenciaisFeed, FeedConta } from './tipos'

export class ErroFeed extends Error {
  constructor(readonly status: number, msg: string, readonly code: string | null = null) { super(msg); this.name = 'ErroFeed' }
}

/** POST /api/webtrader/feed-directo/token — 403 quando a conta não é do utilizador. */
export async function pedirCredenciais(ref: string): Promise<CredenciaisFeed> {
  const extra: Record<string, string> = { 'Content-Type': 'application/json' }
  if (ref.startsWith('tradelocker:sessao:')) {
    const s = lerSessoesTL()[ref]
    if (s) extra['x-webtrader-tl'] = s.token
  }
  const r = await fetch('/api/webtrader/feed-directo/token', { method: 'POST', credentials: 'include', cache: 'no-store', headers: await authHeaders(extra), body: JSON.stringify({ ref }) })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroFeed(r.status, d?.error || `erro ${r.status}`, d?.code ?? null)
  return d as CredenciaisFeed
}

export async function criarFeed(c: CredenciaisFeed, opcoes: { preferencias?: Record<string, string> } = {}): Promise<FeedConta> {
  if (c.plataforma === 'metaapi') return (await import('./metaapi')).criarFeedMetaApi(c, opcoes)
  return (await import('./tradelocker')).criarFeedTradeLocker(c, opcoes)
}

/** Preferências de símbolo guardadas por conta («para XAUUSD lê GOLD»), no browser. */
const CHAVE_PREF = (ref: string) => `webtrader_feed_mapa:${ref}`
export function lerPreferenciasSimbolos(ref: string): Record<string, string> {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_PREF(ref)) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}
export function guardarPreferenciaSimbolo(ref: string, canonico: string, simboloCorretora: string): void {
  try { localStorage.setItem(CHAVE_PREF(ref), JSON.stringify({ ...lerPreferenciasSimbolos(ref), [canonico.toUpperCase()]: simboloCorretora })) } catch { /* modo privado */ }
}

/** Batimento de 60 s: quem está a ler que conta e por que caminho. Nunca trava nada. */
export async function pulsar(ref: string, fonte: 'conta' | 'mtm', estado: string): Promise<void> {
  try {
    await fetch('/api/webtrader/feed-directo/pulso', { method: 'POST', credentials: 'include', cache: 'no-store', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ ref, fonte, estado }), keepalive: true })
  } catch { /* o batimento é informativo */ }
}

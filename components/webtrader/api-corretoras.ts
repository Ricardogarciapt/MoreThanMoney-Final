"use client"

import { authHeaders } from "@/lib/auth-token"
import type { PlataformaWT } from "@/lib/webtrader/corretoras/tipos"

/**
 * CLIENTE DAS CONTAS REAIS DO WEBTRADER (TradeLocker e MT5) — só fala com /api/webtrader/….
 *
 * Sessões TradeLocker abertas no WebTrader: o token cifrado (sem password) fica no sessionStorage
 * do separador e viaja no cabeçalho `x-webtrader-tl`. Fechar o separador = sair.
 */

export interface ContaReal {
  ref: string
  plataforma: PlataformaWT
  rotulo: string | null
  login: string | null
  servidor: string | null
  demo: boolean
  real: boolean
  bloqueada: string | null
  origem: "ligador" | "webtrader" | "sessao"
  versao?: "mt4" | "mt5"
}

export interface SessaoTL { ref: string; token: string; expira: string; login: string; servidor: string; demo: boolean; rotulo?: string | null }

const CHAVE_TL = "webtrader_tl_sessoes"

export function lerSessoesTL(): Record<string, SessaoTL> {
  try {
    const raw = JSON.parse(sessionStorage.getItem(CHAVE_TL) || "{}") as Record<string, SessaoTL>
    return Object.fromEntries(Object.entries(raw).filter(([, s]) => new Date(s.expira).getTime() > Date.now()))
  } catch {
    return {}
  }
}
export function guardarSessaoTL(s: SessaoTL) {
  try {
    const todas = lerSessoesTL()
    todas[s.ref] = s
    sessionStorage.setItem(CHAVE_TL, JSON.stringify(todas))
  } catch { /* modo privado */ }
}
export function apagarSessaoTL(ref: string) {
  try {
    const todas = lerSessoesTL()
    delete todas[ref]
    sessionStorage.setItem(CHAVE_TL, JSON.stringify(todas))
  } catch { /* nada */ }
}

export const plataformaDaRef = (ref: string): PlataformaWT | null => {
  const p = ref.split(":")[0]
  return p === "tradelocker" || p === "mt5" || p === "mtmfunded" ? p : null
}
/** Refs de contas reais têm «:»; as contas MTM Funded do seletor são o uuid simples. */
export const ehRefReal = (id: string | null | undefined) => Boolean(id && /^(tradelocker|mt5):/.test(id))

export class ErroWT extends Error {
  constructor(public status: number, mensagem: string, public dados: Record<string, unknown> = {}) { super(mensagem) }
}

export async function pedirWT<T = any>(
  plataforma: PlataformaWT,
  acao: string,
  opcoes: { conta?: string; metodo?: "GET" | "POST" | "DELETE"; corpo?: Record<string, unknown>; query?: Record<string, string | number> } = {},
): Promise<T> {
  const extra: Record<string, string> = {}
  if (opcoes.corpo) extra["Content-Type"] = "application/json"
  if (opcoes.conta?.startsWith("tradelocker:sessao:")) {
    const s = lerSessoesTL()[opcoes.conta]
    if (s) extra["x-webtrader-tl"] = s.token
  }
  const qs = new URLSearchParams()
  if (opcoes.conta && (opcoes.metodo ?? "GET") === "GET") qs.set("conta", opcoes.conta)
  for (const [k, v] of Object.entries(opcoes.query ?? {})) qs.set(k, String(v))
  const url = `/api/webtrader/${plataforma}/${acao}${qs.toString() ? `?${qs}` : ""}`
  const res = await fetch(url, {
    method: opcoes.metodo ?? "GET",
    credentials: "include",
    cache: "no-store",
    headers: await authHeaders(extra),
    body: opcoes.corpo ? JSON.stringify({ ...(opcoes.conta ? { conta: opcoes.conta } : {}), ...opcoes.corpo }) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErroWT(res.status, data?.error || `erro ${res.status}`, data)
  return data as T
}

export async function listarContasReais(): Promise<{ contas: ContaReal[]; compraPermitida: boolean }> {
  const res = await fetch("/api/webtrader/contas", { credentials: "include", cache: "no-store", headers: await authHeaders() })
  const d = await res.json().catch(() => ({}))
  if (res.status === 401) return { contas: [], compraPermitida: d?.compraPermitida !== false }
  if (!res.ok) throw new ErroWT(res.status, d?.error || "não foi possível ler as contas")
  return { contas: d.contas ?? [], compraPermitida: d.compraPermitida !== false }
}

export const NOME_PLATAFORMA: Record<PlataformaWT, string> = { mtmfunded: "MTM Funded", tradelocker: "TradeLocker", mt5: "MT5" }
export const COR_PLATAFORMA: Record<PlataformaWT, string> = { mtmfunded: "#D2A63C", tradelocker: "#38bdf8", mt5: "#a78bfa" }

"use client"

import { authHeaders } from "@/lib/auth-token"
import { armazemDeSessoes } from "@/lib/webtrader/sessoes-separador"
import type { Simbolo } from "@/lib/mtmfunded/simulado/matematica"

/**
 * O CLIENTE DO WEBTRADER — todas as chamadas passam por aqui.
 *
 * Duas credenciais podem viajar juntas: a sessão MTM (Bearer — dentro das apps nativas não há
 * cookie, e sem o cabeçalho o servidor respondia 401 e o ecrã ficava vazio) e a sessão da CONTA
 * (`x-conta-sessao`), quando se entrou com login+password. O servidor decide qual vale.
 */

/** `sessoes` = tradeSessions da corretora (hora do servidor dela), só quando se pede `specs=1`. */
export type SimboloFicha = Simbolo & { nome?: string; horario?: string; sessoes?: Record<string, Array<{ from: string; to: string }>> | null }
export interface PrecoVivo { symbol: string; bid: number; ask: number; em: string; fresco: boolean }

export interface ContaResumo {
  id: string
  tipo: string
  estado: string
  mt5_login: string | null
  servidor: string | null
  saldo_inicial: number | null
  alavancagem: number | null
  sim_saldo: number | null
  sim_equity: number | null
  etiqueta: string
  /** 113 — a etiqueta do dono (à parte de `etiqueta`, que aqui é a fase F1/F2/Funded/Torneio). */
  etiquetaDoDono?: string | null
  estadoCurto: string
  /** lib/mtmfunded/aviso-conta.ts — calculado no servidor. */
  aviso?: string
  programa?: { nome: string } | null
  /** A conta segue uma estratégia do MTM Auto (migração 070). */
  segueEstrategia?: { slug: string; nome: string } | null
}

export interface SessaoConta { accountId: string; token: string; modo: "master" | "investor"; expira: string; login: string; etiqueta?: string; estadoCurto?: string; aviso?: string }

const CHAVE_SESSOES = "mtmfunded_sessoes"

// O armazém é o mesmo das sessões TradeLocker (lib/webtrader/sessoes-separador.ts).
const sessoesFunded = armazemDeSessoes<SessaoConta>(CHAVE_SESSOES, (s) => s.accountId)
export const lerSessoes = sessoesFunded.ler
export const guardarSessao = sessoesFunded.guardar
export const apagarSessao = sessoesFunded.apagar

/** Servidor único das contas simuladas (o que o trader escreve no campo «Servidor»). */
export const SERVIDOR_FUNDED = "MTM Funded"

/**
 * Entrar numa conta com login + password (master negoceia, investor só vê) — o mesmo caminho no
 * WebTrader e no painel «Negociar» dos scanners. Devolve a sessão pronta a guardar.
 */
export async function entrarComCredenciais(login: string, password: string): Promise<SessaoConta> {
  const r = await fetch("/api/mtmfunded/simulado/entrar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login, password, servidor: SERVIDOR_FUNDED }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d.error || "não foi possível entrar")
  // Lê a conta com o token para mostrar etiqueta/estado no seletor.
  const info = await fetch("/api/mtmfunded/simulado/entrar", { headers: { Authorization: `Bearer ${d.token}` } }).then((x) => x.json()).catch(() => null)
  return {
    accountId: info?.conta?.id, token: d.token, modo: d.modo, expira: d.expira, login: login.replace(/\D/g, ""),
    etiqueta: info?.conta?.etiqueta, estadoCurto: info?.conta?.estadoCurto, aviso: info?.conta?.aviso,
  }
}

export class ErroApi extends Error {
  constructor(public status: number, mensagem: string) { super(mensagem) }
}

export async function pedir<T = any>(url: string, init: RequestInit = {}, accountId?: string | null): Promise<T> {
  const extra: Record<string, string> = {}
  if (init.body && typeof init.body === "string") extra["Content-Type"] = "application/json"
  if (accountId) {
    const s = lerSessoes()[accountId]
    if (s) extra["x-conta-sessao"] = s.token
  }
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { ...(await authHeaders(extra)), ...((init.headers as Record<string, string>) ?? {}) },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ErroApi(res.status, data?.error || `erro ${res.status}`)
  return data as T
}

/**
 * Grava a ETIQUETA de uma conta (113) — o nome próprio que o dono lhe dá.
 *
 * `ref` é a referência do seletor: `mtmfunded:<id>` nas MTM Funded, `mt5:site:<id>` /
 * `tradelocker:auto:<id>`… nas reais. Uma rota só, as quatro tabelas. `''` apaga a etiqueta.
 * O servidor volta a normalizar (40 caracteres, sem `<>`) e devolve o que ficou gravado.
 */
export function gravarEtiqueta(ref: string, etiqueta: string): Promise<{ ok: true; etiqueta: string | null }> {
  return pedir("/api/contas/etiqueta", { method: "PATCH", body: JSON.stringify({ ref, etiqueta }) })
}

export function ordem(accao: string, corpo: Record<string, unknown>, accountId: string) {
  return pedir("/api/mtmfunded/simulado/ordens", { method: "POST", body: JSON.stringify({ accao, ...corpo }) }, accountId)
}

// ── formatação ──
export const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const px = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits)

export const COR_ESTADO: Record<string, string> = {
  Active: "#34d399", Breached: "#f87171", Pause: "#fbbf24", Closed: "#a1a1aa", Pending: "#60a5fa",
}

/** Símbolo para o widget do TradingView (só visualização). */
const TV_INDICES: Record<string, string> = {
  US30: "OANDA:US30USD", NAS100: "OANDA:NAS100USD", US500: "OANDA:SPX500USD", GER40: "OANDA:DE30EUR",
  UK100: "OANDA:UK100GBP", JPN225: "OANDA:JP225USD", USOUSD: "TVC:USOIL", UKOUSD: "TVC:UKOIL",
}
export function tvSymbolDe(s: { symbol: string; classe?: string }): string {
  if (TV_INDICES[s.symbol]) return TV_INDICES[s.symbol]
  if (s.classe === "cripto" && s.symbol.endsWith("USD")) return `BINANCE:${s.symbol.slice(0, -3)}USDT`
  if (s.classe === "forex" || s.classe === "metal") return `OANDA:${s.symbol}`
  return s.symbol
}

export const NOME_CLASSE: Record<string, string> = {
  forex: "Forex", metal: "Metais", indice: "Índices", cripto: "Cripto", energia: "Energia", acao: "Ações", etf: "ETFs", commodity: "Commodities", obrigacao: "Obrigações",
}

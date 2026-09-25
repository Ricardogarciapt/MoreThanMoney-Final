"use client"

import { authHeaders } from "@/lib/auth-token"
import { armazemDeSessoes } from "@/lib/webtrader/sessoes-separador"
import type { Simbolo } from "@/lib/mtmfunded/simulado/matematica"
import { COR_DO_ESTADO } from "@/lib/mtmfunded/etiquetas"
import type { FiltroContas } from "@/lib/webtrader/filtro-contas"

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
  // Lê a conta com o token para mostrar etiqueta/estado no seletor. Sem o id da conta não há sessão
  // (antes guardava-se na chave «undefined» e o ecrã entrava numa conta sem id).
  const info = await fetch("/api/mtmfunded/simulado/entrar", { headers: { Authorization: `Bearer ${d.token}` } })
    .then((x) => (x.ok ? x.json() : null)).catch(() => null)
  if (!info?.conta?.id) throw new Error("Entrou, mas não foi possível ler a conta — tenta outra vez.")
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

/**
 * A ORDEM das contas no seletor (o que a pessoa arrastou) e a FAVORITA (a que abre primeiro).
 * Guardadas na conta MTM, não no dispositivo — ver app/api/contas/ordem/route.ts.
 */
export function lerOrdemContas(): Promise<{ ordem: string[]; favorita: string | null; filtroContas?: FiltroContas; ocultas?: string[] }> {
  return pedir("/api/contas/ordem")
}

/** As contas escondidas no modo organizar do seletor — ficam na conta, não no dispositivo. */
export function gravarContasOcultas(ocultas: string[]): Promise<{ ok: true; ocultas: string[] }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ ocultas }) })
}

/** O filtro do seletor («As minhas» / «Mestres» / «Todas») — fica na conta, não no dispositivo. */
export function gravarFiltroContas(filtroContas: FiltroContas): Promise<{ ok: true; filtroContas: FiltroContas }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ filtroContas }) })
}

export function gravarOrdemContas(ordem: string[]): Promise<{ ok: true; ordem: string[] }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ ordem }) })
}

/**
 * As preferências do WebTrader desta pessoa, lidas UMA vez por página (o provedor do um-clique
 * monta-se por conta; três contas abertas não são três pedidos iguais).
 */
let prefsEmCurso: Promise<{ umCliqueAceite: string | null; umClique: Record<string, boolean> } | null> | null = null
export function lerPreferenciasUmClique() {
  if (!prefsEmCurso) {
    prefsEmCurso = pedir<{ umCliqueAceite: string | null; umClique: Record<string, boolean> }>("/api/contas/ordem")
      .catch(() => null)
    // Uma preferência muda raramente: 30 s de memória chegam para não repetir o pedido ao trocar de conta.
    setTimeout(() => { prefsEmCurso = null }, 30_000)
  }
  return prefsEmCurso
}

/** Negociação num clique: o aviso aceite (uma vez por pessoa) e o interruptor por conta. */
export function gravarUmCliqueAceite(): Promise<{ ok: true }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ umCliqueAceite: true }) })
}

export function gravarUmClique(conta: string, ligado: boolean): Promise<{ ok: true }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ umClique: { conta, ligado } }) })
}

/** `ref` = `mtmfunded:<id>`; `null` desmarca a que estiver marcada. */
export function gravarContaFavorita(ref: string | null): Promise<{ ok: true; favorita: string | null }> {
  return pedir("/api/contas/ordem", { method: "PATCH", body: JSON.stringify({ favorita: ref }) })
}

export function ordem(accao: string, corpo: Record<string, unknown>, accountId: string) {
  return pedir("/api/mtmfunded/simulado/ordens", { method: "POST", body: JSON.stringify({ accao, ...corpo }) }, accountId)
}

// ── formatação ──
export const usd = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? "—" : `${n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export const px = (n: number | null | undefined, digits = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits)

/**
 * A COR DE UM ESTADO DE CONTA — uma tabela só.
 *
 * Os cinco estados MTM Funded vêm de lib/mtmfunded/etiquetas (`COR_DO_ESTADO`); esta tabela era uma
 * cópia byte a byte deles, e duas tabelas com a mesma verdade acabam sempre por divergir.
 *
 * Os outros três não são estados MTM Funded: o seletor do WebTrader (lib/webtrader/seletor.ts)
 * põe «Bloqueada», «Demo» e «Real» no mesmo campo para as contas de corretora. As cores deles
 * estavam escritas à mão no meio do JSX (#fb7185 para «Real», que não existe em tabela nenhuma) —
 * ficam aqui, ao lado das outras, para se verem todas de uma vez.
 */
export const COR_ESTADO: Record<string, string> = {
  ...COR_DO_ESTADO,
  Bloqueada: "#a1a1aa", Demo: "#60a5fa", Real: "#fb7185",
}

/** A cor de um estado; o que não se conhece fica cinzento, em vez de fingir que é «Closed». */
export const corDoEstado = (e: string | null | undefined) => COR_ESTADO[String(e ?? "")] ?? "#a1a1aa"

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

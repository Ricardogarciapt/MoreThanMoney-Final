/**
 * VELAS — FUNÇÕES PURAS partilhadas pelo cliente (armazém de velas do gráfico) e pelas verificações.
 *
 * Sem React, sem browser, sem servidor: só listas de velas. É aqui que vive a regra de agregar um
 * timeframe menor num maior (M5 → M15/H1…) para o gráfico mostrar LOGO o timeframe novo enquanto o
 * verdadeiro chega, a de colar duas janelas por tempo e a do formato compacto da rota.
 */

import { DERIVACAO, TF_NATIVOS, TF_SEG_GRAFICO, inicioCalendario } from "./timeframes"

export interface VelaC { t: number; o: number; h: number; l: number; c: number; v?: number }

// Os 16 timeframes do gráfico (05/10/2026) vêm de lib/webtrader/timeframes.ts — a mesma tabela que
// a rota de velas usa, para o browser e o servidor nunca discordarem do tamanho de uma vela.
export const TF_SEGUNDOS: Record<string, number> = TF_SEG_GRAFICO
// Deriva-se só a partir dos NATIVOS (os que a rota devolve de verdade): uma vela derivada de outra
// derivada acumula o erro da vela aberta.
const ORDEM: readonly string[] = TF_NATIVOS

/**
 * De que timeframes em cache se pode derivar `tf`, pela ordem de preferência: o maior que divide
 * (menos velas a agregar, vela aberta mais parecida). D1 não se deriva de intradiário: a vela diária
 * da corretora fecha à hora dela, não à meia-noite UTC — melhor esperar pela verdadeira.
 */
export function fontesDerivacao(tf: string): string[] {
  const alvo = TF_SEGUNDOS[tf]
  if (!alvo || tf === "D1") return []
  // W1 e MN são de calendário (segunda / dia 1): só se derivam do D1, nunca por divisão de segundos.
  if (DERIVACAO[tf]?.calendario) return ["D1"]
  return ORDEM.filter((x) => TF_SEGUNDOS[x] < alvo && alvo % TF_SEGUNDOS[x] === 0).reverse()
}

/** Agrega velas (ordenadas por tempo) em velas de `seg` segundos, alinhadas à época UTC como a MetaApi. */
export function agregarVelas(velas: VelaC[], seg: number): VelaC[] {
  const out: VelaC[] = []
  let atual: VelaC | null = null
  for (const v of velas) {
    const t = Math.floor(v.t / seg) * seg
    if (!atual || atual.t !== t) {
      if (atual) out.push(atual)
      atual = { t, o: v.o, h: v.h, l: v.l, c: v.c, v: Number(v.v) || 0 }
    } else {
      if (v.h > atual.h) atual.h = v.h
      if (v.l < atual.l) atual.l = v.l
      atual.c = v.c
      atual.v = (atual.v ?? 0) + (Number(v.v) || 0)
    }
  }
  if (atual) out.push(atual)
  return out
}

/** Agrega no timeframe `tf`: calendário para W1/MN (segunda / dia 1, UTC), segundos para o resto. */
export function agregarVelasTf(velas: VelaC[], tf: string): VelaC[] {
  const cal = DERIVACAO[tf]?.calendario
  if (!cal) return agregarVelas(velas, TF_SEGUNDOS[tf] ?? 300)
  const out: VelaC[] = []
  let atual: VelaC | null = null
  for (const v of velas) {
    const t = inicioCalendario(v.t, cal)
    if (!atual || atual.t !== t) {
      if (atual) out.push(atual)
      atual = { t, o: v.o, h: v.h, l: v.l, c: v.c, v: Number(v.v) || 0 }
    } else {
      if (v.h > atual.h) atual.h = v.h
      if (v.l < atual.l) atual.l = v.l
      atual.c = v.c
      atual.v = (atual.v ?? 0) + (Number(v.v) || 0)
    }
  }
  if (atual) out.push(atual)
  return out
}

/**
 * Junta duas listas por tempo: a `nova` ganha a partir da sua primeira vela (é mais fresca); o que
 * a `antiga` tem ANTES disso fica. Ambas ordenadas. Não corta (quem chama decide o limite).
 */
export function colar(antiga: VelaC[], nova: VelaC[]): VelaC[] {
  if (!nova.length) return antiga
  if (!antiga.length) return nova
  const primeiraNova = nova[0].t
  // antiga está ordenada: corta-se pela pesquisa binária em vez de filtrar 3000 velas.
  let lo = 0, hi = antiga.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (antiga[m].t < primeiraNova) lo = m + 1; else hi = m }
  return lo === 0 ? nova : antiga.slice(0, lo).concat(nova)
}

/** Histórico mais antigo (`antes`, de um pedido com `ate`) acrescentado por baixo do que já há. */
export function acrescentarAntigas(atual: VelaC[], antes: VelaC[]): VelaC[] {
  if (!antes.length) return atual
  if (!atual.length) return antes
  const primeira = atual[0].t
  const novas = antes.filter((v) => v.t < primeira)
  return novas.length ? novas.concat(atual) : atual
}

/** Formato compacto da rota (`?f=a`): colunas em vez de 3000 objetos — metade dos bytes. */
export interface VelasColunas { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v: number[] }

export function paraColunas(velas: VelaC[]): VelasColunas {
  const n = velas.length
  const r: VelasColunas = { t: new Array(n), o: new Array(n), h: new Array(n), l: new Array(n), c: new Array(n), v: new Array(n) }
  for (let i = 0; i < n; i++) {
    const x = velas[i]
    r.t[i] = x.t; r.o[i] = x.o; r.h[i] = x.h; r.l[i] = x.l; r.c[i] = x.c; r.v[i] = Number(x.v) || 0
  }
  return r
}

export function deColunas(col: Partial<VelasColunas> | null | undefined): VelaC[] {
  const t = col?.t
  if (!Array.isArray(t)) return []
  const out: VelaC[] = new Array(t.length)
  for (let i = 0; i < t.length; i++) out[i] = { t: t[i], o: col!.o![i], h: col!.h![i], l: col!.l![i], c: col!.c![i], v: col!.v?.[i] ?? 0 }
  return out
}

// ─── URLs e pré-carga do HTML (lib/webtrader/pre-carga-inline.ts) ───

export const URL_VELAS = (symbol: string, tf: string, limite: number, ate?: number) =>
  `/api/mtmfunded/simulado/velas?symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limite}${ate ? `&ate=${ate}` : ''}&f=a`
export const URL_FICHAS = (csv: string) => `/api/mtmfunded/simulado/precos?symbols=${encodeURIComponent(csv)}&specs=1`


/** Apanha (uma vez) a promessa que o script do HTML deixou para este URL. */
export function tirarPreCarga<T>(url: string): Promise<T> | null {
  if (typeof window === 'undefined') return null
  const pre = (window as unknown as { __mtmPre?: Record<string, Promise<unknown>> }).__mtmPre
  const p = pre?.[url]
  if (!p) return null
  delete pre![url]
  return p as Promise<T>
}

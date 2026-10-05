"use client"

import {
  type VelaC, TF_SEGUNDOS, URL_VELAS, acrescentarAntigas, agregarVelasTf, colar, deColunas, fontesDerivacao, tirarPreCarga,
} from "@/lib/webtrader/velas"

/**
 * ARMAZÉM DE VELAS DO CLIENTE — o que faz o gráfico abrir e mudar de timeframe «como o TradingView».
 *
 * Antes (2026-09) cada troca de timeframe ou símbolo limpava o gráfico, mostrava o círculo e ia à
 * rede (0,6–1,7 s por troca). Agora cada símbolo+timeframe vive aqui:
 *  · MEMÓRIA (LRU por separador, 24 séries): voltar a um timeframe/símbolo já visto é instantâneo;
 *  · DISCO (IndexedDB, try/catch em tudo): reabrir o WebTrader amanhã desenha logo o que se viu
 *    ontem, e a rede só acrescenta as velas que faltam por cima;
 *  · DERIVAÇÃO: sem H1 em cache mas com M5, o H1 agrega-se do M5 e aparece logo, enquanto o
 *    verdadeiro chega (lib/webtrader/velas.ts — `fontesDerivacao`/`agregarVelas`);
 *  · a VELA VIVA que o gráfico forma com os preços ao vivo escreve-se aqui também, por isso voltar a
 *    um timeframe não mostra a última vela parada no momento em que se saiu.
 *
 * Rede: um pedido por série de cada vez (pedidos iguais em curso partilham a promessa), no formato
 * compacto da rota (`f=a`, colunas). A rota tem cache na CDN e nunca toca na base por pedido.
 * A MetaApi só é chamada pelo servidor, que tem a sua própria cache — o cliente pedir mais vezes não
 * gasta créditos, só a CDN.
 */

export interface SerieVelas {
  velas: VelaC[]
  /** Quando se juntou a janela recente pela última vez (ms). */
  recenteEm: number
  /** Maior janela «até agora» já recebida (300, 3000…). */
  janela: number
  /** O pedido para trás voltou vazio: não há mais histórico. */
  inicio: boolean
}

const MAX_SERIES = 24
const MAX_VELAS_SERIE = 8000
const MAX_VELAS_DISCO = 3000
/** A janela recente em memória serve sem ir à rede durante isto (o preço ao vivo trata do resto). */
export const FRESCO_MS = 15_000

const memoria = new Map<string, SerieVelas>()
const emCurso = new Map<string, Promise<SerieVelas>>()

/**
 * FONTE DIRECTA (feed da conta, lib/webtrader/feed-directo). Quando o WebTrader de uma conta real
 * tem o feed ligado, as velas dos símbolos que a corretora dá vêm DELA — da ligação da conta à
 * corretora, puxadas pelo browser — e não da rota do servidor. A série fica guardada à parte
 * (`conta:<ref>|XAUUSD:M5`): as velas da corretora do cliente e as do feed MTM nunca se misturam,
 * nem em memória nem no disco. O gráfico não sabe de nada disto: pede por símbolo+timeframe como
 * sempre e é a `chave` que o leva à série certa.
 */
export interface FonteVelasDirecta {
  /** `conta:<ref>` — prefixo das séries desta fonte. */
  chave: string
  cobre: (symbol: string) => boolean
  /** `ate` em segundos (época) = velas mais antigas do que isso. */
  pedir: (symbol: string, tf: string, limite: number, ate?: number) => Promise<VelaC[]>
}
let fonteDirecta: FonteVelasDirecta | null = null
export function definirFonteVelas(f: FonteVelasDirecta | null) { fonteDirecta = f }
export function fonteVelasActiva(symbol: string): string | null { return fonteDirecta && fonteDirecta.cobre(symbol) ? fonteDirecta.chave : null }

const chave = (symbol: string, tf: string) => { const f = fonteVelasActiva(symbol); return f ? `${f}|${symbol}:${tf}` : `${symbol}:${tf}` }

function guardar(k: string, s: SerieVelas) {
  if (s.velas.length > MAX_VELAS_SERIE) s = { ...s, velas: s.velas.slice(-MAX_VELAS_SERIE), inicio: false }
  memoria.delete(k)
  memoria.set(k, s)
  while (memoria.size > MAX_SERIES) memoria.delete(memoria.keys().next().value as string)
  agendarDisco(k)
}

export function lerMemoria(symbol: string, tf: string): SerieVelas | null {
  const s = memoria.get(chave(symbol, tf))
  return s && s.velas.length ? s : null
}

export const fresco = (s: SerieVelas | null | undefined) => Boolean(s && Date.now() - s.recenteEm < FRESCO_MS)

/**
 * O timeframe pedido agregado de um menor que já esteja em memória (M5 → H1). Só se tiver velas
 * que cheguem para parecer um gráfico (≥ 40); é um marcador de lugar até chegar o verdadeiro.
 */
export function lerDerivado(symbol: string, tf: string): VelaC[] | null {
  const seg = TF_SEGUNDOS[tf]
  if (!seg) return null
  for (const origem of fontesDerivacao(tf)) {
    const s = lerMemoria(symbol, origem)
    if (!s) continue
    const agregadas = agregarVelasTf(s.velas, tf)
    if (agregadas.length >= 40) return agregadas
  }
  return null
}

/** Junta a janela «até agora» que chegou da rede ao que já havia. Sem sobreposição, a antiga não serve (buraco). */
function juntarRecente(antes: SerieVelas | undefined, velas: VelaC[], janela: number): SerieVelas {
  const agora = Date.now()
  if (!velas.length) return antes ? { ...antes, recenteEm: agora } : { velas: [], recenteEm: agora, janela, inicio: false }
  if (!antes?.velas.length || antes.velas[antes.velas.length - 1].t < velas[0].t) {
    return { velas, recenteEm: agora, janela, inicio: false }
  }
  // A cauda do que havia pode ser a vela viva formada pelos preços: a da rede ganha a partir da sua 1.ª.
  return { velas: colar(antes.velas, velas), recenteEm: agora, janela: Math.max(janela, antes.janela), inicio: antes.inicio }
}

type RespostaRede = { col?: Parameters<typeof deColunas>[0]; velas?: VelaC[] }

async function pedirRede(symbol: string, tf: string, limite: number, ate?: number): Promise<VelaC[]> {
  // Feed directo ligado e a cobrir este símbolo: as velas vêm da corretora do cliente, não da rota.
  const f = fonteDirecta
  if (f && f.cobre(symbol)) return f.pedir(symbol, tf, limite, ate)
  const url = URL_VELAS(symbol, tf, limite, ate)
  const doFetch = async () => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`velas ${r.status}`)
    return (await r.json()) as RespostaRede
  }
  // O script do HTML de /webtrader pode já ter pedido estas velas durante o parse da página.
  const doHtml = tirarPreCarga<RespostaRede>(url)
  const d = doHtml ? await doHtml.catch(doFetch) : await doFetch()
  return d.col ? deColunas(d.col) : d.velas ?? []
}

/**
 * As `limite` velas até agora, juntas ao que já havia. Devolve a série inteira (pode ter mais do
 * que `limite`, se já havia histórico para trás). Pedidos iguais em curso partilham a promessa.
 */
export function buscarRecentes(symbol: string, tf: string, limite: number): Promise<SerieVelas> {
  const k = chave(symbol, tf)
  const ek = `${k}:${limite}`
  const ja = emCurso.get(ek)
  if (ja) return ja
  const p = pedirRede(symbol, tf, limite)
    .then((velas) => {
      const s = juntarRecente(memoria.get(k), velas, limite)
      if (s.velas.length) guardar(k, s)
      return s
    })
    .finally(() => emCurso.delete(ek))
  emCurso.set(ek, p)
  return p
}

/** Mais histórico para trás de `ate` (arrastar o gráfico para a esquerda). */
export function buscarAntigas(symbol: string, tf: string, ate: number, limite = 1000): Promise<{ serie: SerieVelas; novas: number }> {
  const k = chave(symbol, tf)
  const ek = `${k}:ate:${ate}`
  const ja = emCurso.get(ek) as Promise<unknown> | undefined
  if (ja) return ja as Promise<{ serie: SerieVelas; novas: number }>
  const p = pedirRede(symbol, tf, limite, ate)
    .then((antes) => {
      const atual = memoria.get(k) ?? { velas: [], recenteEm: 0, janela: 0, inicio: false }
      const velas = acrescentarAntigas(atual.velas, antes)
      const novas = velas.length - atual.velas.length
      const serie = { ...atual, velas, inicio: novas === 0 }
      guardar(k, serie)
      return { serie, novas }
    })
    .finally(() => emCurso.delete(ek))
  emCurso.set(ek, p as unknown as Promise<SerieVelas>)
  return p
}

/** A vela viva (preços ao vivo) — só a última muda, ou abre-se uma nova. Não vai ao disco a cada tick. */
export function tocarVelaViva(symbol: string, tf: string, vela: VelaC) {
  const s = memoria.get(chave(symbol, tf))
  if (!s?.velas.length) return
  const arr = s.velas
  const u = arr[arr.length - 1]
  if (u.t === vela.t) arr[arr.length - 1] = vela
  else if (vela.t > u.t) arr.push(vela)
}

/** Velas para outros consumidores (H4/M1 do Sensei): da memória se frescas, senão da rede (e ficam cá). */
export async function velasPara(symbol: string, tf: string, limite: number): Promise<VelaC[]> {
  const m = lerMemoria(symbol, tf)
  if (m && fresco(m) && (m.velas.length >= limite || m.janela >= limite)) return m.velas.slice(-limite)
  const s = await buscarRecentes(symbol, tf, limite)
  return s.velas.slice(-limite)
}

/**
 * Pré-busca em tempo morto (os timeframes vizinhos do que se está a ver: em M15, o M5 e o H1).
 * Só a janela recente, só se não houver já em memória, no máximo dois — a rota de preços e a das
 * contas também contam para o limite de pedidos por minuto do middleware.
 */
export function preBuscar(symbol: string, tfs: string[]) {
  if (typeof window === "undefined") return
  const faltam = tfs.filter((tf) => TF_SEGUNDOS[tf] && !lerMemoria(symbol, tf)).slice(0, 2)
  if (!faltam.length) return
  const correr = () => { for (const tf of faltam) void buscarRecentes(symbol, tf, 300).catch(() => {}) }
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
  if (w.requestIdleCallback) w.requestIdleCallback(correr, { timeout: 2000 })
  else setTimeout(correr, 300)
}

export const TF_VIZINHOS: Record<string, string[]> = {
  M1: ["M5"], M2: ["M1", "M3"], M3: ["M1", "M5"], M5: ["M15", "M1"], M10: ["M5", "M15"],
  M15: ["H1", "M5"], M30: ["M15", "H1"], H1: ["H4", "M15"], H2: ["H1", "H4"], H4: ["H1", "D1"],
  H6: ["H1", "H4"], H8: ["H1", "H4"], H12: ["H1", "D1"], D1: ["H4"], W1: ["D1"], MN: ["D1", "W1"],
}

// ─────────────────────────────────────────────────────────────────────────────
// Disco (IndexedDB). Tudo opcional: modo privado, WebViews antigas ou quota cheia → só memória.
// ─────────────────────────────────────────────────────────────────────────────

const BD = "mtm-velas"
const LOJA = "series"
let bdPromessa: Promise<IDBDatabase | null> | null = null

function abrirBd(): Promise<IDBDatabase | null> {
  if (bdPromessa) return bdPromessa
  bdPromessa = new Promise((resolver) => {
    try {
      if (typeof indexedDB === "undefined") return resolver(null)
      const pedido = indexedDB.open(BD, 1)
      pedido.onupgradeneeded = () => { try { pedido.result.createObjectStore(LOJA) } catch { /* já existe */ } }
      pedido.onsuccess = () => resolver(pedido.result)
      pedido.onerror = () => resolver(null)
      pedido.onblocked = () => resolver(null)
      setTimeout(() => resolver(null), 1500)
    } catch {
      resolver(null)
    }
  })
  return bdPromessa
}

interface NoDisco { v: 1; em: number; janela: number; t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; vol: number[] }

/** A série guardada em disco (ou null). Não fica «fresca»: a janela recente vai sempre à rede depois. */
export async function lerDisco(symbol: string, tf: string): Promise<SerieVelas | null> {
  const k = chave(symbol, tf)
  const bd = await abrirBd()
  if (!bd) return null
  const no = await new Promise<NoDisco | null>((resolver) => {
    try {
      const r = bd.transaction(LOJA, "readonly").objectStore(LOJA).get(k)
      r.onsuccess = () => resolver((r.result as NoDisco) ?? null)
      r.onerror = () => resolver(null)
    } catch {
      resolver(null)
    }
  })
  if (!no || no.v !== 1 || !Array.isArray(no.t) || !no.t.length) return null
  // Velha demais: a janela recente (300 velas) já não chega ao que está guardado e ficaria um buraco
  // (M1: ~4 h; M5: ~20 h; H1 em diante: 7 dias).
  const idadeMax = Math.min(7 * 86400_000, 300 * (TF_SEGUNDOS[tf] ?? 300) * 1000 * 0.8)
  if (Date.now() - no.em > idadeMax) return null
  const velas = deColunas({ t: no.t, o: no.o, h: no.h, l: no.l, c: no.c, v: no.vol })
  const m = memoria.get(k)
  if (m?.velas.length) return m
  const s: SerieVelas = { velas, recenteEm: 0, janela: no.janela, inicio: false }
  memoria.set(k, s)
  while (memoria.size > MAX_SERIES) memoria.delete(memoria.keys().next().value as string)
  return s
}

const porGravar = new Set<string>()
let gravacaoAgendada = false
const ultimaGravacao = new Map<string, number>()

function agendarDisco(k: string) {
  if (typeof window === "undefined") return
  porGravar.add(k)
  if (gravacaoAgendada) return
  gravacaoAgendada = true
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
  const correr = () => { gravacaoAgendada = false; void gravarPendentes() }
  if (w.requestIdleCallback) w.requestIdleCallback(correr, { timeout: 5000 })
  else setTimeout(correr, 1000)
}

async function gravarPendentes() {
  const bd = await abrirBd()
  const lista = [...porGravar]
  porGravar.clear()
  if (!bd) return
  const adiadas: string[] = []
  try {
    const tx = bd.transaction(LOJA, "readwrite")
    const loja = tx.objectStore(LOJA)
    for (const k of lista) {
      // No máximo uma escrita por série a cada 10 s (a vela viva não justifica mais).
      if (Date.now() - (ultimaGravacao.get(k) ?? 0) < 10_000) { adiadas.push(k); continue }
      const s = memoria.get(k)
      if (!s?.velas.length) continue
      ultimaGravacao.set(k, Date.now())
      const velas = s.velas.slice(-MAX_VELAS_DISCO)
      const no: NoDisco = { v: 1, em: s.recenteEm || Date.now(), janela: s.janela, t: [], o: [], h: [], l: [], c: [], vol: [] }
      for (const x of velas) { no.t.push(x.t); no.o.push(x.o); no.h.push(x.h); no.l.push(x.l); no.c.push(x.c); no.vol.push(Number(x.v) || 0) }
      loja.put(no, k)
    }
  } catch { /* quota cheia ou BD fechada: fica só a memória */ }
  if (adiadas.length) setTimeout(() => adiadas.forEach(agendarDisco), 10_000)
}

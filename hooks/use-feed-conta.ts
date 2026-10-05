"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { PrecoVivo } from "@/components/funded/api"
import { usePrecos } from "@/components/funded/use-precos"
import type { ContaWT, OrdemWT, PosicaoWT } from "@/lib/webtrader/corretoras/tipos"
import { ErroFeed, criarFeed, lerPreferenciasSimbolos, pedirCredenciais, pulsar } from "@/lib/webtrader/feed-directo/ligar"
import type { CredenciaisFeed, EstadoFeed, FeedConta, FichaMinima } from "@/lib/webtrader/feed-directo/tipos"
import type { VelaC } from "@/lib/webtrader/velas"

/**
 * O FEED DA CONTA NO ECRÃ — dada a ref (`mt5:site:<uuid>`, `tradelocker:auto:<uuid>`…), pede a
 * credencial curta (F1), liga o feed directo (F2) e expõe cotações, posições, ordens e conta com
 * `fonte: 'conta'`. Quando não há conta, a credencial falha ou o feed cai mais de 10 s, cai para o
 * feed MTM (`usePrecos`, indicativo) com `fonte: 'mtm'` e volta sozinho quando recuperar.
 *
 * Um feed por ref, partilhado entre renders e entre o StrictMode (registo no módulo): fechar e
 * abrir duas vezes não liga duas vezes à corretora. Desliga 2 s depois do último consumidor sair.
 *
 * Batimento: POST /api/webtrader/feed-directo/pulso a cada 60 s enquanto o feed existe. Renovação:
 * 2 min antes de `expiraEm` pede credencial nova e passa-a ao feed.
 */

const FRESCO_MS = 10_000
const QUEDA_PARA_MTM_MS = 10_000
const PULSO_MS = 60_000
const FOLGA_RENOVACAO_MS = 2 * 60_000

interface Entrada {
  feed: FeedConta | null
  cred: CredenciaisFeed | null
  erro: { texto: string; status: number; code: string | null } | null
  aLigar: Promise<void> | null
  consumidores: number
  caidoDesde: number | null
  fecho: ReturnType<typeof setTimeout> | null
  renovacao: ReturnType<typeof setTimeout> | null
  pulso: ReturnType<typeof setInterval> | null
  ouvintes: Set<() => void>
}
const registo = new Map<string, Entrada>()

function avisar(e: Entrada) { e.ouvintes.forEach((o) => { try { o() } catch { /* ok */ } }) }

async function ligarEntrada(ref: string, e: Entrada) {
  try {
    const cred = await pedirCredenciais(ref)
    e.cred = cred
    if (cred.plataforma === 'metaapi' && cred.estadoConta === 'desligada') {
      e.erro = { texto: 'A conta MT5 está desligada da corretora.', status: 503, code: 'mt5_desligada' }
      avisar(e)
      return
    }
    const feed = await criarFeed(cred, { preferencias: lerPreferenciasSimbolos(ref) })
    if (!e.consumidores) { feed.desligar(); return }
    e.feed = feed
    feed.aoMudar(() => avisar(e))
    agendarRenovacao(ref, e)
    e.pulso = setInterval(() => void pulsar(ref, feed.estado === 'ligado' ? 'conta' : 'mtm', feed.estado), PULSO_MS)
    avisar(e)
    await feed.ligar()
    void pulsar(ref, feed.estado === 'ligado' ? 'conta' : 'mtm', feed.estado)
  } catch (err) {
    e.erro = err instanceof ErroFeed ? { texto: err.message, status: err.status, code: err.code } : { texto: (err as Error)?.message || 'Não foi possível ligar o feed da corretora.', status: 0, code: null }
  } finally {
    e.aLigar = null
    avisar(e)
  }
}

function agendarRenovacao(ref: string, e: Entrada) {
  if (e.renovacao) clearTimeout(e.renovacao)
  const exp = e.cred ? Date.parse(e.cred.expiraEm) : NaN
  if (!Number.isFinite(exp)) return
  const em = Math.max(5_000, exp - Date.now() - FOLGA_RENOVACAO_MS)
  e.renovacao = setTimeout(async () => {
    try {
      const c = await pedirCredenciais(ref)
      e.cred = c
      await e.feed?.renovar(c)
      agendarRenovacao(ref, e)
    } catch {
      // Falhou renovar: tenta outra vez daqui a 1 min; se a credencial expirar, o feed cai e o hook passa ao MTM.
      e.renovacao = setTimeout(() => agendarRenovacao(ref, e), 60_000)
    }
  }, em)
}

function obterEntrada(ref: string): Entrada {
  let e = registo.get(ref)
  if (!e) {
    e = { feed: null, cred: null, erro: null, aLigar: null, consumidores: 0, caidoDesde: null, fecho: null, renovacao: null, pulso: null, ouvintes: new Set() }
    registo.set(ref, e)
  }
  if (e.fecho) { clearTimeout(e.fecho); e.fecho = null }
  if (!e.feed && !e.aLigar) { e.erro = null; e.aLigar = ligarEntrada(ref, e) }
  return e
}

function largarEntrada(ref: string, e: Entrada) {
  e.consumidores = Math.max(0, e.consumidores - 1)
  if (e.consumidores) return
  e.fecho = setTimeout(() => {
    if (e.consumidores) return
    e.feed?.desligar()
    if (e.renovacao) clearTimeout(e.renovacao)
    if (e.pulso) clearInterval(e.pulso)
    registo.delete(ref)
  }, 2000)
}

/** Para a fonte «conta», a frescura é a idade do tick (G1 dá ≤1 tick/2,5 s; 10 s é folga, não ruído). */
function paraPrecoVivo(symbol: string, c: { bid: number; ask: number; em: number }, agora: number): PrecoVivo {
  return { symbol, bid: c.bid, ask: c.ask, em: new Date(c.em).toISOString(), fresco: agora - c.em <= FRESCO_MS }
}

export interface FeedContaResultado {
  fonte: 'conta' | 'mtm'
  estado: EstadoFeed | 'sem_conta' | 'a_ligar'
  erro: { texto: string; status: number; code: string | null } | null
  vivos: Record<string, PrecoVivo>
  posicoes: PosicaoWT[] | null
  ordens: OrdemWT[] | null
  conta: ContaWT | null
  /** Velas da conta (null quando a fonte é o MTM). `ate` em segundos. */
  velas: ((symbol: string, tf: string, limite: number, ate?: number) => Promise<VelaC[]>) | null
  ficha: (symbol: string) => FichaMinima | null
  simbolosCorretora: string[]
  /** O feed dá cotação/velas a este canónico? */
  cobre: (symbol: string) => boolean
  actualizarAgora: () => void
  versao: 'mt4' | 'mt5' | null
  plataforma: 'metaapi' | 'tradelocker' | null
}

export function useFeedConta(ref: string | null, simbolos: string[], opcoes: { activo?: boolean } = {}): FeedContaResultado {
  const activo = opcoes.activo !== false && !!ref
  // O feed muda sem referência nova (guarda o retrato dentro de si): é este contador que força o recálculo.
  const [tick, setTick] = useState(0)
  const entradaRef = useRef<Entrada | null>(null)
  const [fonte, setFonte] = useState<'conta' | 'mtm'>('mtm')

  useEffect(() => {
    if (!activo || !ref) { entradaRef.current = null; setFonte('mtm'); return }
    const e = obterEntrada(ref)
    e.consumidores++
    entradaRef.current = e
    const ouvir = () => setTick((x) => x + 1)
    e.ouvintes.add(ouvir)
    ouvir()
    return () => { e.ouvintes.delete(ouvir); largarEntrada(ref, e); if (entradaRef.current === e) entradaRef.current = null }
  }, [ref, activo])

  // Símbolos visíveis → subscrições (MetaApi) / sondagem (TL).
  const chaveSimbolos = [...new Set(simbolos.filter(Boolean))].sort().join(',')
  useEffect(() => {
    const feed = entradaRef.current?.feed
    if (feed && chaveSimbolos) feed.verSimbolos(chaveSimbolos.split(','))
  }, [chaveSimbolos, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fonte: 'conta' enquanto o feed está ligado; 'mtm' depois de >10 s caído (e logo que não haja feed).
  useEffect(() => {
    const avaliar = () => {
      const e = entradaRef.current
      const feed = e?.feed
      if (!feed) { setFonte('mtm'); return }
      if (feed.estado === 'ligado') { if (e) e.caidoDesde = null; setFonte('conta'); return }
      if (e && e.caidoDesde == null) e.caidoDesde = Date.now()
      if (e && Date.now() - (e.caidoDesde ?? 0) > QUEDA_PARA_MTM_MS) setFonte('mtm')
    }
    avaliar()
    const iv = setInterval(avaliar, 1000)
    return () => clearInterval(iv)
  }, [ref, activo])

  const e = entradaRef.current
  const feed = e?.feed ?? null
  const cobre = useCallback((s: string) => !!feed && feed.mapa.paraCorretora[s.toUpperCase()] != null, [feed])

  // O MTM cobre o que a conta não dá (símbolos só do catálogo) e tudo, quando a fonte é o MTM.
  const simbolosMtm = useMemo(() => (fonte === 'conta' ? simbolos.filter((s) => !cobre(s)) : simbolos), [fonte, simbolos, cobre])
  const { precos: mtm } = usePrecos(simbolosMtm, 2000)

  const vivos = useMemo(() => {
    const out: Record<string, PrecoVivo> = { ...mtm }
    if (fonte === 'conta' && feed) {
      const agora = Date.now()
      for (const [s, c] of Object.entries(feed.cotacoes())) out[s] = paraPrecoVivo(s, c, agora)
    }
    return out
  }, [mtm, fonte, feed, tick]) // eslint-disable-line react-hooks/exhaustive-deps

  const estado: FeedContaResultado['estado'] = !activo ? 'sem_conta' : feed ? feed.estado : e?.aLigar ? 'a_ligar' : 'caido'
  const velas = useMemo(() => (fonte === 'conta' && feed ? (s: string, tf: string, limite: number, ate?: number) => feed.velas(s, tf, limite, ate) : null), [fonte, feed])
  const ficha = useCallback((s: string) => feed?.ficha(s) ?? null, [feed])

  return {
    fonte, estado, erro: e?.erro ?? (feed?.erro ? { texto: feed.erro, status: 0, code: null } : null), vivos,
    posicoes: fonte === 'conta' ? feed?.posicoes() ?? null : null,
    ordens: fonte === 'conta' ? feed?.ordens() ?? null : null,
    conta: fonte === 'conta' ? feed?.conta() ?? null : null,
    velas, ficha, simbolosCorretora: feed?.simbolos() ?? [], cobre,
    actualizarAgora: () => feed?.actualizarAgora(),
    versao: e?.cred?.plataforma === 'metaapi' ? e.cred.versao : null,
    plataforma: feed?.plataforma ?? null,
  }
}

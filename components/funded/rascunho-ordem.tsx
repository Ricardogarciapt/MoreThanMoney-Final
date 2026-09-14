"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  type Direcao, type MapaPrecos, comissaoUsd, lucroUsd, margemUsd, normalizarVolume, pendenteDispara, pips,
  precoDeAbertura, spreadEmPreco, validarNiveis,
} from "@/lib/mtmfunded/simulado/matematica"
import { tipoDeEntrada, valorDoPip } from "@/lib/mtmfunded/simulado/ordens"
import {
  type VolumePorRisco, percentagemDeUsd, precoDePercentagem, precoDeValor, usdDePercentagem, volumePorRisco,
} from "@/lib/mtmfunded/simulado/niveis-financeiros"
import type { SimboloFicha, PrecoVivo } from "./api"

/**
 * O RASCUNHO DA ORDEM — UM só estado para o ticket e para o gráfico, como no painel de ordens do
 * TradingView com a ferramenta de posição.
 *
 * Escrever o SL no ticket desenha a linha; arrastar a linha escreve o SL no ticket. A ferramenta
 * Long/Short não é outra coisa: é este mesmo rascunho posto no gráfico. Por isso nunca há duas
 * versões da mesma ordem, e «Confirmar» — no ticket ou na barra do gráfico — envia exactamente o
 * que está desenhado.
 *
 * Os níveis guardam-se em PREÇO. As excepções ficam em `fixos`:
 *  · pips escritos numa ordem a mercado — o trader fixou a DISTÂNCIA, e o SL acompanha o preço vivo;
 *  · $ ou % do saldo — o trader fixou o DINHEIRO: se a entrada ou o volume mudarem, o preço do
 *    SL/TP recalcula-se para continuar a perder/ganhar o mesmo (niveis-financeiros.ts).
 * Arrastar a linha ou escrever um preço desfaz o fixo: a partir daí manda o preço.
 *
 * O volume tem dois modos: lote (escrito à mão) ou RISCO ($ ou % do saldo), em que o lote sai da
 * distância ao SL — mexer no SL (escrito ou arrastado) recalcula o lote ao vivo.
 *
 * A validação é a do servidor (matematica/ordens): um SL do lado errado aparece escrito no ticket
 * E pinta a linha de vermelho.
 */

export type TipoOrdem = "mercado" | "limit" | "stop"
export type CampoNivel = "entrada" | "sl" | "tp"
/** Como o trader escreve o SL/TP: preço, pips, dinheiro (USD) ou percentagem do saldo. */
export type ModoNiveis = "preco" | "pips" | "usd" | "pct"
/** Como se escolhe o volume: lote à mão, ou pelo risco em $ / % do saldo. */
export type ModoVolume = "lote" | "risco_usd" | "risco_pct"
export interface NivelFixo { modo: "pips" | "usd" | "pct"; valor: number }

/** As escolhas de modo ficam no browser do trader (uma chave por modo). */
export const CHAVE_MODO_NIVEIS = "mtmfunded_ticket_modo_niveis"
export const CHAVE_MODO_VOLUME = "mtmfunded_ticket_modo_volume"
const MODOS_NIVEIS: ModoNiveis[] = ["preco", "pips", "usd", "pct"]
const MODOS_VOLUME: ModoVolume[] = ["lote", "risco_usd", "risco_pct"]
function lerModo<T extends string>(chave: string, validos: T[]): T | null {
  try { const v = localStorage.getItem(chave) as T | null; return v && validos.includes(v) ? v : null } catch { return null }
}
function guardarModo(chave: string, v: string) {
  try { localStorage.setItem(chave, v) } catch { /* modo privado: fica só nesta sessão */ }
}

export interface Rascunho {
  /** O lado que se está a ver/preparar (hover no SELL/BUY, ferramenta Long/Short). */
  lado: Direcao
  /** O trader já carregou em BUY/SELL: o resumo com «Confirmar» está aberto. */
  escolhido: boolean
  tipo: TipoOrdem
  /** Preço da pendente (limit/stop). A mercado é o ask/bid vivo — fica null. */
  entrada: number | null
  sl: number | null
  tp: number | null
  /** SL/TP presos a uma distância (pips a mercado) ou a um valor em dinheiro — ver o topo. */
  fixos: { sl: NivelFixo | null; tp: NivelFixo | null }
  modoNiveis: ModoNiveis
  /** Mostrar o rascunho no gráfico mesmo sem níveis (tocou no volume, escolheu a ferramenta…). */
  visivel: boolean
  origem: "manual" | "scanner" | "ideia_mtm"
  ideiaRef: string | null
}

const VAZIO: Rascunho = {
  lado: "buy", escolhido: false, tipo: "mercado", entrada: null, sl: null, tp: null,
  fixos: { sl: null, tp: null }, modoNiveis: "preco", visivel: false, origem: "manual", ideiaRef: null,
}

export interface ErrosRascunho { volume?: string; entrada?: string; sl?: string; tp?: string; margem?: string }

export interface Dimensionamento extends VolumePorRisco {
  /** O risco pedido, já em USD (a % convertida pelo saldo). */
  alvoUsd: number | null
}

export interface PedidoOrdem {
  accao: "abrir" | "pendente"
  direcao: Direcao
  volume: number
  sl: number | null
  tp: number | null
  tipo?: "limit" | "stop"
  preco?: number
  origem: Rascunho["origem"]
  ideiaRef: string | null
}

interface ValorContexto {
  r: Rascunho
  simbolo: SimboloFicha
  preco?: PrecoVivo
  precos: MapaPrecos
  /** O volume efectivo da ordem (no modo risco, o calculado). */
  volume: number
  setVolume: (v: number) => void
  saldo: number | null
  tolerancia: number
  /** Entrada efectiva: ask/bid vivo (mercado) ou o preço da pendente. */
  entrada: number | null
  /** SL/TP efectivos (com os pips fixos já convertidos em preço). */
  sl: number | null
  tp: number | null
  erros: ErrosRascunho
  temErros: boolean
  resumo: {
    risco: number | null; ganho: number | null; riscoPct: number | null; ganhoPct: number | null
    pipsSl: number | null; pipsTp: number | null; rr: string | null; margem: number | null; comissao: number; valorPip: number | null
  }
  modoVolume: ModoVolume
  /** O valor escrito no modo risco ($ ou %, conforme o modo). */
  riscoEscrito: number | null
  /** Só no modo risco: o lote calculado, se ficou preso ao mínimo/máximo e o risco real. */
  dimensionamento: Dimensionamento | null
  definirModoNiveis: (m: ModoNiveis) => void
  definirModoVolume: (m: ModoVolume) => void
  definirRisco: (valor: number | null) => void
  /** O gráfico deve desenhar o rascunho? */
  mostrar: boolean
  set: (patch: Partial<Rascunho>) => void
  /** Arrastar/escrever um nível. A entrada troca sozinha entre Mercado, Limit e Stop. */
  definirNivel: (campo: CampoNivel, valor: number | null) => void
  definirPips: (campo: "sl" | "tp", pips: number | null) => void
  /** SL/TP pelo dinheiro: `usd` em USD, `pct` em % do saldo. Fica fixo até arrastar/escrever preço. */
  definirValor: (campo: "sl" | "tp", modo: "usd" | "pct", valor: number | null) => void
  /** Ferramenta Long/Short: põe o rascunho no gráfico nesse lado e preço (SL/TP por defeito se faltarem). */
  colocar: (lado: Direcao, entrada: number | null, distancia?: number) => void
  aplicar: (p: { lado?: Direcao; entrada?: number | null; sl?: number | null; tp?: number | null; origem?: Rascunho["origem"]; ideiaRef?: string | null; escolhido?: boolean }) => void
  limpar: () => void
  enviar: () => Promise<void>
  aEnviar: boolean
  erroEnvio: string | null
  /**
   * A ferramenta Long/Short activa — partilhada entre o ticket e o gráfico. Carregar em Long no
   * ticket arma a ferramenta no gráfico (e passa-o à vista de negociar), e vice-versa.
   */
  ferramenta: Direcao | null
  setFerramenta: (d: Direcao | null) => void
}

const Contexto = createContext<ValorContexto | null>(null)

export function useRascunho(): ValorContexto {
  const v = useContext(Contexto)
  if (!v) throw new Error("useRascunho fora do RascunhoProvider")
  return v
}
/** Para componentes que também vivem fora do WebTrader (o gráfico de análise não precisa dele). */
export function useRascunhoOpcional(): ValorContexto | null {
  return useContext(Contexto)
}

export function RascunhoProvider(props: {
  simbolo: SimboloFicha
  preco?: PrecoVivo
  precos: MapaPrecos
  volume: number
  setVolume: (v: number) => void
  alavancagem: number
  margemLivre: number | null
  /** O saldo da conta (sim_saldo) — base do % no SL/TP e no risco. */
  saldo: number | null
  onEnviar: (p: PedidoOrdem) => Promise<void>
  children: ReactNode
}) {
  const { simbolo: s, preco, precos, volume: volumeEscrito, setVolume, alavancagem, margemLivre, saldo } = props
  const [r, setR] = useState<Rascunho>(VAZIO)
  const [dim, setDim] = useState<{ modo: ModoVolume; valor: number | null }>({ modo: "lote", valor: null })

  // Os modos escolhidos da última vez (lidos depois de montar: no servidor não há localStorage).
  useEffect(() => {
    const n = lerModo(CHAVE_MODO_NIVEIS, MODOS_NIVEIS)
    const v = lerModo(CHAVE_MODO_VOLUME, MODOS_VOLUME)
    if (n) setR((x) => ({ ...x, modoNiveis: n }))
    if (v) setDim((d) => ({ ...d, modo: v }))
  }, [])
  const [aEnviar, setAEnviar] = useState(false)
  const [erroEnvio, setErroEnvio] = useState<string | null>(null)
  const [ferramenta, setFerramenta] = useState<Direcao | null>(null)
  const arred = useCallback((v: number) => Number(v.toFixed(s.digits)), [s.digits])
  const tolerancia = Math.max(spreadEmPreco(s), 2 * s.pip_size)

  // Outro símbolo, outro rascunho: um SL de ouro não serve ao EURUSD. O modo preço/pips fica.
  // (Só em MUDANÇAS: ao montar não se limpa, senão apagava o pré-preenchimento de um alerta.)
  const simboloAnterior = useRef(s.symbol)
  useEffect(() => {
    if (simboloAnterior.current === s.symbol) return
    simboloAnterior.current = s.symbol
    setR((x) => ({ ...VAZIO, modoNiveis: x.modoNiveis }))
    setErroEnvio(null)
  }, [s.symbol])

  const mapa = useMemo<MapaPrecos>(() => ({ ...precos, ...(preco ? { [s.symbol]: preco } : {}) }), [precos, preco, s.symbol])
  const entrada = r.tipo === "mercado" ? (preco ? precoDeAbertura(r.lado, preco) : null) : r.entrada
  const resolver = (campo: "sl" | "tp", f: NivelFixo, vol: number): number | null => {
    if (entrada == null) return null
    if (f.modo === "pips") {
      const sinal = (r.lado === "buy" ? 1 : -1) * (campo === "sl" ? -1 : 1)
      return arred(entrada + sinal * f.valor * s.pip_size)
    }
    return f.modo === "usd"
      ? precoDeValor(s, r.lado, campo, entrada, vol, f.valor, mapa)
      : precoDePercentagem(s, r.lado, campo, entrada, vol, f.valor, saldo, mapa)
  }
  // Ordem das contas: SL → (modo risco) lote → TP. O SL em dinheiro nunca depende do lote calculado
  // (ao passar para o modo risco fica preso ao preço), senão lote e SL andavam atrás um do outro.
  const sl = r.fixos.sl ? resolver("sl", r.fixos.sl, volumeEscrito) : r.sl
  const alvoRisco = dim.modo === "risco_usd" ? dim.valor : dim.modo === "risco_pct" && dim.valor != null ? usdDePercentagem(dim.valor, saldo) : null
  const dimensionamento = useMemo<Dimensionamento | null>(
    () => (dim.modo === "lote" ? null : { ...volumePorRisco(s, entrada, sl, alvoRisco, mapa), alvoUsd: alvoRisco }),
    [dim.modo, s, entrada, sl, alvoRisco, mapa],
  )
  const volume = dimensionamento?.volume ?? volumeEscrito
  const tp = r.fixos.tp ? resolver("tp", r.fixos.tp, volume) : r.tp

  // No modo risco o lote do ecrã (e da ordem) acompanha o SL e o preço vivo.
  useEffect(() => {
    const v = dimensionamento?.volume
    if (v != null && Math.abs(v - volumeEscrito) > 1e-9) setVolume(v)
  }, [dimensionamento?.volume]) // eslint-disable-line react-hooks/exhaustive-deps

  const erros = useMemo<ErrosRascunho>(() => {
    const e: ErrosRascunho = {}
    if (dimensionamento && dimensionamento.volume == null) {
      e.volume = dimensionamento.motivo === "sem_sl" ? "Define o SL para calcular o lote"
        : dimensionamento.motivo === "sem_risco" ? (dim.modo === "risco_pct" && saldo == null ? "sem saldo para calcular a %" : "indica o risco para calcular o lote")
          : "sem preço de conversão para calcular o lote"
    } else if (normalizarVolume(s, volume) == null) e.volume = `volume fora dos limites (${s.volume_min}–${s.volume_max}, passo ${s.volume_step})`
    if (r.tipo !== "mercado") {
      if (!(r.entrada != null && r.entrada > 0)) e.entrada = "indica o preço da ordem"
      else if (preco?.fresco && pendenteDispara(r.lado, r.tipo, r.entrada, preco)) {
        const lado = r.tipo === "limit" ? (r.lado === "buy" ? "abaixo" : "acima") : (r.lado === "buy" ? "acima" : "abaixo")
        e.entrada = `uma ${r.lado} ${r.tipo} tem de ficar ${lado} do preço atual`
      }
    }
    if (entrada != null) {
      const eSl = validarNiveis(r.lado, entrada, sl, null)
      const eTp = validarNiveis(r.lado, entrada, null, tp)
      if (eSl) e.sl = eSl
      if (eTp) e.tp = eTp
      // Um $ ou % que não se consegue pôr no gráfico diz-se — não desaparece em silêncio.
      for (const campo of ["sl", "tp"] as const) {
        const f = r.fixos[campo]
        if (!f || f.modo === "pips" || (campo === "sl" ? sl : tp) != null || e[campo]) continue
        e[campo] = f.modo === "pct" && saldo == null ? "sem saldo para calcular a %"
          : "esse valor não cabe: o nível ficaria abaixo de zero ou falta o preço de conversão"
      }
      const risco = sl != null ? lucroUsd(s, r.lado, volume, entrada, sl, mapa) : null
      if (!e.sl && risco != null && margemLivre != null && Math.abs(risco) > margemLivre) {
        e.sl = `o risco (${Math.abs(risco).toFixed(2)} $) é maior que a margem livre (${margemLivre.toFixed(2)} $)`
      }
      const m = margemUsd(s, volume, entrada, alavancagem, mapa)
      if (m != null && margemLivre != null && m > margemLivre) e.margem = `margem insuficiente: precisa ${m.toFixed(2)} $, livre ${margemLivre.toFixed(2)} $`
    }
    return e
  }, [s, volume, dimensionamento, dim.modo, saldo, r.tipo, r.entrada, r.lado, r.fixos, preco, entrada, sl, tp, alavancagem, margemLivre, mapa])

  const resumo = useMemo(() => {
    const risco = entrada != null && sl != null ? lucroUsd(s, r.lado, volume, entrada, sl, mapa) : null
    const ganho = entrada != null && tp != null ? lucroUsd(s, r.lado, volume, entrada, tp, mapa) : null
    const pipsSl = entrada != null && sl != null ? pips(s, entrada, sl) : null
    const pipsTp = entrada != null && tp != null ? pips(s, entrada, tp) : null
    return {
      risco, ganho, pipsSl, pipsTp,
      riscoPct: percentagemDeUsd(risco == null ? null : Math.abs(risco), saldo),
      ganhoPct: percentagemDeUsd(ganho, saldo),
      rr: pipsSl && pipsTp ? (pipsTp / pipsSl).toFixed(2) : null,
      margem: entrada != null ? margemUsd(s, volume, entrada, alavancagem, mapa) : null,
      comissao: comissaoUsd(s, volume),
      valorPip: entrada != null ? valorDoPip(s, volume, entrada, mapa) : null,
    }
  }, [s, r.lado, volume, entrada, sl, tp, mapa, alavancagem, saldo])

  const set = useCallback((patch: Partial<Rascunho>) => setR((x) => ({ ...x, ...patch })), [])

  const definirNivel = useCallback((campo: CampoNivel, valor: number | null) => {
    setR((x) => {
      if (campo === "entrada") {
        if (valor == null) return { ...x, tipo: "mercado", entrada: null }
        const v = arred(valor)
        // Arrastar a entrada para longe do mercado faz dela pendente — limit ou stop conforme o lado.
        const tipo = preco ? tipoDeEntrada(x.lado, v, preco, tolerancia) : x.tipo === "mercado" ? "limit" : x.tipo
        return { ...x, visivel: true, tipo, entrada: tipo === "mercado" ? null : v }
      }
      return { ...x, visivel: true, [campo]: valor == null ? null : arred(valor), fixos: { ...x.fixos, [campo]: null } }
    })
  }, [arred, preco, tolerancia])

  const definirPips = useCallback((campo: "sl" | "tp", n: number | null) => {
    setR((x) => {
      if (n == null || !(n > 0)) return { ...x, [campo]: null, fixos: { ...x.fixos, [campo]: null } }
      // Numa pendente a entrada não mexe: converte-se já para preço. A mercado fica a distância fixa.
      if (x.tipo !== "mercado" && x.entrada != null) {
        const sinal = (x.lado === "buy" ? 1 : -1) * (campo === "sl" ? -1 : 1)
        return { ...x, visivel: true, [campo]: arred(x.entrada + sinal * n * s.pip_size), fixos: { ...x.fixos, [campo]: null } }
      }
      return { ...x, visivel: true, fixos: { ...x.fixos, [campo]: { modo: "pips", valor: n } } }
    })
  }, [arred, s.pip_size])

  const definirValor = useCallback((campo: "sl" | "tp", modo: "usd" | "pct", n: number | null) => {
    setR((x) => (n == null || !(n > 0)
      ? { ...x, [campo]: null, fixos: { ...x.fixos, [campo]: null } }
      : { ...x, visivel: true, fixos: { ...x.fixos, [campo]: { modo, valor: n } } }))
  }, [])

  const definirModoNiveis = useCallback((m: ModoNiveis) => {
    setR((x) => ({ ...x, modoNiveis: m }))
    guardarModo(CHAVE_MODO_NIVEIS, m)
  }, [])

  const definirModoVolume = (m: ModoVolume) => {
    guardarModo(CHAVE_MODO_VOLUME, m)
    // Um SL preso a dinheiro passa a preço: no modo risco é o SL que decide o lote, não o contrário.
    if (m !== "lote" && r.fixos.sl && r.fixos.sl.modo !== "pips") {
      const agora = sl
      setR((x) => ({ ...x, sl: agora, fixos: { ...x.fixos, sl: null } }))
    }
    // Começa no risco que a ordem já tem, para o lote não saltar ao trocar de modo.
    const riscoAgora = resumo.risco == null ? null : Math.abs(resumo.risco)
    const valor = m === "lote" ? dim.valor
      : m === dim.modo ? dim.valor
        : m === "risco_usd" ? (dim.modo === "risco_pct" && alvoRisco != null ? Math.round(alvoRisco * 100) / 100 : riscoAgora != null ? Math.round(riscoAgora * 100) / 100 : null)
          : (dim.modo === "risco_usd" && dim.valor != null ? percentagemDeUsd(dim.valor, saldo) : percentagemDeUsd(riscoAgora, saldo))
    setDim({ modo: m, valor })
    setR((x) => ({ ...x, visivel: true }))
  }
  const definirRisco = useCallback((valor: number | null) => setDim((d) => ({ ...d, valor })), [])

  const colocar = useCallback((lado: Direcao, e: number | null, distancia?: number) => {
    setR((x) => {
      const ref = e ?? (preco ? precoDeAbertura(lado, preco) : null)
      if (ref == null) return { ...x, lado, visivel: true }
      const tipo = preco ? tipoDeEntrada(lado, ref, preco, tolerancia) : "limit"
      const d = distancia ?? Math.max(spreadEmPreco(s) * 5, s.pip_size * 10, ref * 0.001)
      const sinal = lado === "buy" ? 1 : -1
      // Trocar de lado com níveis do lado errado seria desenhar um erro: recomeçam a partir da entrada.
      const trocou = x.lado !== lado
      return {
        ...x, lado, visivel: true, tipo, entrada: tipo === "mercado" ? null : arred(ref),
        sl: !trocou && x.sl != null ? x.sl : arred(ref - sinal * d),
        tp: !trocou && x.tp != null ? x.tp : arred(ref + sinal * 2 * d),
        fixos: { sl: null, tp: null },
      }
    })
  }, [arred, preco, s, tolerancia])

  const aplicar = useCallback<ValorContexto["aplicar"]>((p) => {
    setR((x) => {
      const lado = p.lado ?? x.lado
      let tipo: TipoOrdem = "mercado"
      let ent: number | null = null
      if (p.entrada != null && preco) {
        tipo = tipoDeEntrada(lado, p.entrada, preco, tolerancia)
        ent = tipo === "mercado" ? null : arred(p.entrada)
      }
      return {
        ...x, lado, tipo, entrada: ent, visivel: true,
        sl: p.sl ?? null, tp: p.tp ?? null, fixos: { sl: null, tp: null },
        origem: p.origem ?? x.origem, ideiaRef: p.ideiaRef ?? x.ideiaRef,
        escolhido: p.escolhido ?? x.escolhido,
      }
    })
  }, [arred, preco, tolerancia])

  const limpar = useCallback(() => { setR((x) => ({ ...VAZIO, modoNiveis: x.modoNiveis, lado: x.lado })); setErroEnvio(null) }, [])

  const temErros = Object.keys(erros).length > 0
  const enviar = async () => {
    if (temErros || entrada == null) return
    const v = normalizarVolume(s, volume)
    if (v == null) return
    setAEnviar(true)
    setErroEnvio(null)
    try {
      await props.onEnviar(r.tipo === "mercado"
        ? { accao: "abrir", direcao: r.lado, volume: v, sl, tp, origem: r.origem, ideiaRef: r.ideiaRef }
        : { accao: "pendente", direcao: r.lado, volume: v, sl, tp, tipo: r.tipo, preco: r.entrada!, origem: r.origem, ideiaRef: r.ideiaRef })
      limpar()
    } catch (e) {
      setErroEnvio((e as Error).message)
    } finally {
      setAEnviar(false)
    }
  }

  const mostrar = r.visivel || r.escolhido || r.entrada != null || sl != null || tp != null

  return (
    <Contexto.Provider value={{
      r, simbolo: s, preco, precos, volume, setVolume, saldo, tolerancia, entrada, sl, tp, erros, temErros, resumo, mostrar,
      modoVolume: dim.modo, riscoEscrito: dim.valor, dimensionamento, definirModoNiveis, definirModoVolume, definirRisco,
      set, definirNivel, definirPips, definirValor, colocar, aplicar, limpar, enviar, aEnviar, erroEnvio,
      ferramenta, setFerramenta,
    }}>
      {props.children}
    </Contexto.Provider>
  )
}

"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  type Direcao, type MapaPrecos, comissaoUsd, lucroUsd, margemUsd, normalizarVolume, pendenteDispara, pips,
  precoDeAbertura, spreadEmPreco, validarNiveis,
} from "@/lib/mtmfunded/simulado/matematica"
import { tipoDeEntrada, valorDoPip } from "@/lib/mtmfunded/simulado/ordens"
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
 * Os níveis guardam-se em PREÇO. A excepção são os pips escritos numa ordem a mercado: aí o que o
 * trader fixou foi a DISTÂNCIA, e o SL acompanha o preço vivo até ele o arrastar ou escrever um
 * preço (é o que `pipsFixos` guarda).
 *
 * A validação é a do servidor (matematica/ordens): um SL do lado errado aparece escrito no ticket
 * E pinta a linha de vermelho.
 */

export type TipoOrdem = "mercado" | "limit" | "stop"
export type CampoNivel = "entrada" | "sl" | "tp"

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
  pipsFixos: { sl: number | null; tp: number | null }
  modoNiveis: "preco" | "pips"
  /** Mostrar o rascunho no gráfico mesmo sem níveis (tocou no volume, escolheu a ferramenta…). */
  visivel: boolean
  origem: "manual" | "scanner" | "ideia_mtm"
  ideiaRef: string | null
}

const VAZIO: Rascunho = {
  lado: "buy", escolhido: false, tipo: "mercado", entrada: null, sl: null, tp: null,
  pipsFixos: { sl: null, tp: null }, modoNiveis: "preco", visivel: false, origem: "manual", ideiaRef: null,
}

export interface ErrosRascunho { volume?: string; entrada?: string; sl?: string; tp?: string; margem?: string }

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
  volume: number
  setVolume: (v: number) => void
  tolerancia: number
  /** Entrada efectiva: ask/bid vivo (mercado) ou o preço da pendente. */
  entrada: number | null
  /** SL/TP efectivos (com os pips fixos já convertidos em preço). */
  sl: number | null
  tp: number | null
  erros: ErrosRascunho
  temErros: boolean
  resumo: { risco: number | null; ganho: number | null; pipsSl: number | null; pipsTp: number | null; rr: string | null; margem: number | null; comissao: number; valorPip: number | null }
  /** O gráfico deve desenhar o rascunho? */
  mostrar: boolean
  set: (patch: Partial<Rascunho>) => void
  /** Arrastar/escrever um nível. A entrada troca sozinha entre Mercado, Limit e Stop. */
  definirNivel: (campo: CampoNivel, valor: number | null) => void
  definirPips: (campo: "sl" | "tp", pips: number | null) => void
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
  onEnviar: (p: PedidoOrdem) => Promise<void>
  children: ReactNode
}) {
  const { simbolo: s, preco, precos, volume, setVolume, alavancagem, margemLivre } = props
  const [r, setR] = useState<Rascunho>(VAZIO)
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

  const entrada = r.tipo === "mercado" ? (preco ? precoDeAbertura(r.lado, preco) : null) : r.entrada
  const deslocar = (campo: "sl" | "tp", n: number) => {
    if (entrada == null) return null
    const sinal = (r.lado === "buy" ? 1 : -1) * (campo === "sl" ? -1 : 1)
    return arred(entrada + sinal * n * s.pip_size)
  }
  const sl = r.pipsFixos.sl != null ? deslocar("sl", r.pipsFixos.sl) : r.sl
  const tp = r.pipsFixos.tp != null ? deslocar("tp", r.pipsFixos.tp) : r.tp

  const erros = useMemo<ErrosRascunho>(() => {
    const e: ErrosRascunho = {}
    if (normalizarVolume(s, volume) == null) e.volume = `volume fora dos limites (${s.volume_min}–${s.volume_max}, passo ${s.volume_step})`
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
      const m = margemUsd(s, volume, entrada, alavancagem, { ...precos, ...(preco ? { [s.symbol]: preco } : {}) })
      if (m != null && margemLivre != null && m > margemLivre) e.margem = `margem insuficiente: precisa ${m.toFixed(2)} $, livre ${margemLivre.toFixed(2)} $`
    }
    return e
  }, [s, volume, r.tipo, r.entrada, r.lado, preco, entrada, sl, tp, alavancagem, margemLivre, precos])

  const resumo = useMemo(() => {
    const mapa = { ...precos, ...(preco ? { [s.symbol]: preco } : {}) }
    const risco = entrada != null && sl != null ? lucroUsd(s, r.lado, volume, entrada, sl, mapa) : null
    const ganho = entrada != null && tp != null ? lucroUsd(s, r.lado, volume, entrada, tp, mapa) : null
    const pipsSl = entrada != null && sl != null ? pips(s, entrada, sl) : null
    const pipsTp = entrada != null && tp != null ? pips(s, entrada, tp) : null
    return {
      risco, ganho, pipsSl, pipsTp,
      rr: pipsSl && pipsTp ? (pipsTp / pipsSl).toFixed(2) : null,
      margem: entrada != null ? margemUsd(s, volume, entrada, alavancagem, mapa) : null,
      comissao: comissaoUsd(s, volume),
      valorPip: entrada != null ? valorDoPip(s, volume, entrada, mapa) : null,
    }
  }, [s, r.lado, volume, entrada, sl, tp, precos, preco, alavancagem])

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
      return { ...x, visivel: true, [campo]: valor == null ? null : arred(valor), pipsFixos: { ...x.pipsFixos, [campo]: null } }
    })
  }, [arred, preco, tolerancia])

  const definirPips = useCallback((campo: "sl" | "tp", n: number | null) => {
    setR((x) => {
      if (n == null || !(n > 0)) return { ...x, [campo]: null, pipsFixos: { ...x.pipsFixos, [campo]: null } }
      // Numa pendente a entrada não mexe: converte-se já para preço. A mercado fica a distância fixa.
      if (x.tipo !== "mercado" && x.entrada != null) {
        const sinal = (x.lado === "buy" ? 1 : -1) * (campo === "sl" ? -1 : 1)
        return { ...x, visivel: true, [campo]: arred(x.entrada + sinal * n * s.pip_size), pipsFixos: { ...x.pipsFixos, [campo]: null } }
      }
      return { ...x, visivel: true, pipsFixos: { ...x.pipsFixos, [campo]: n } }
    })
  }, [arred, s.pip_size])

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
        pipsFixos: { sl: null, tp: null },
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
        sl: p.sl ?? null, tp: p.tp ?? null, pipsFixos: { sl: null, tp: null },
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
      r, simbolo: s, preco, precos, volume, setVolume, tolerancia, entrada, sl, tp, erros, temErros, resumo, mostrar,
      set, definirNivel, definirPips, colocar, aplicar, limpar, enviar, aEnviar, erroEnvio,
      ferramenta, setFerramenta,
    }}>
      {props.children}
    </Contexto.Provider>
  )
}

"use client"

import { useEffect, useState, type ReactNode } from "react"
import { estadoEmFrase } from "@/lib/webtrader/textos"
import { AlertTriangle, Eye } from "lucide-react"
import type { MapaPrecos } from "@/lib/mtmfunded/simulado/matematica"
import type { LimitesConta } from "@/lib/mtmfunded/simulado/ordens"
import { gestaoDaLinha } from "@/lib/mtmfunded/simulado/avancadas"
import { type PrecoVivo, type SimboloFicha, COR_ESTADO, usd } from "./api"
import FundedGrafico from "./funded-grafico"
import type { Prefill } from "./funded-ticket"
import type { OrdemGrafico, PosicaoGrafico } from "./grafico-tipos"
import { RascunhoProvider, useRascunho, type PedidoOrdem } from "./rascunho-ordem"
import ModalSinal from "./modal-sinal"
import type { useAlertas } from "./funded-alertas"
import type { useDiario } from "./funded-diario"

/**
 * O QUE OS DOIS MODOS PARTILHAM — o «trader» de uma conta (dados, preços, acções) e as peças que
 * SIMPLE e PRO montam de maneira diferente: o gráfico ligado à conta, o provedor do rascunho e o
 * pré-preenchimento vindo de alertas/scanners.
 *
 * Os dados vivem num só sítio (funded-trader.tsx): trocar de modo não relê a conta, não perde o
 * rascunho do ticket nem desliga os preços.
 */

export type Estado = Awaited<ReturnType<typeof import("@/lib/mtmfunded/simulado/execucao")["estadoCompleto"]>>

export interface VivoConta {
  flutuante: number; equity: number; margem: number; margemLivre: number; nivelMargemPct: number | null; semPreco: string[]
  limites: LimitesConta
}

export interface Trader {
  accountId: string
  dados: Estado
  vivo: VivoConta
  mapa: MapaPrecos
  vivos: Record<string, PrecoVivo>
  fichas: Record<string, SimboloFicha>
  simbolo: SimboloFicha | null
  volume: number
  setVolume: (v: number) => void
  podeNegociar: boolean
  selecionar: (s: SimboloFicha) => void
  selecionarPorNome: (symbol: string) => Promise<void>
  obterFicha: (symbol: string) => Promise<SimboloFicha | null>
  executar: (accao: string, corpo: Record<string, unknown>) => Promise<unknown>
  enviarPedido: (p: PedidoOrdem, symbol: string) => Promise<unknown>
  setVisiveis: (s: string[]) => void
  /** Símbolos dos outros gráficos do multi-gráfico (precisam de preço ao vivo). */
  setExtras: (s: string[]) => void
  prefill: Prefill | null
  simboloInicial: string | null
  alertas: ReturnType<typeof useAlertas>
  diario: ReturnType<typeof useDiario>
  metricas: Array<[string, string, string?]>
}

export const posicoesDoGrafico = (t: Trader, symbol: string): PosicaoGrafico[] =>
  t.dados.posicoes.filter((p) => p.symbol === symbol).map((p) => ({
    id: String(p.id), direcao: p.direcao as PosicaoGrafico["direcao"], volume: Number(p.volume), preco_entrada: Number(p.preco_entrada),
    sl: p.sl == null ? null : Number(p.sl), tp: p.tp == null ? null : Number(p.tp),
    tps: gestaoDaLinha(p as Record<string, unknown>).tps,
  }))

export const ordensDoGrafico = (t: Trader, symbol: string): OrdemGrafico[] =>
  t.dados.ordens.filter((o) => o.symbol === symbol).map((o) => ({
    id: String(o.id), direcao: o.direcao as OrdemGrafico["direcao"], tipo: o.tipo as OrdemGrafico["tipo"], volume: Number(o.volume), preco: Number(o.preco),
    sl: o.sl == null ? null : Number(o.sl), tp: o.tp == null ? null : Number(o.tp),
  }))

/** O rascunho (ticket ⇄ gráfico) de um símbolo desta conta. */
export function ProvedorRascunho({ t, ficha, volume, setVolume, children }: { t: Trader; ficha: SimboloFicha; volume: number; setVolume: (v: number) => void; children: ReactNode }) {
  return (
    <RascunhoProvider
      simbolo={ficha} preco={t.vivos[ficha.symbol]} precos={t.mapa} volume={volume} setVolume={setVolume}
      alavancagem={t.dados.conta.alavancagem} margemLivre={t.vivo.margemLivre} saldo={t.dados.estado.saldo}
      onEnviar={(p) => t.enviarPedido(p, ficha.symbol)}
    >
      {children}
      {/* A folha de confirmação de um sinal (scanner/ideia) vive aqui, dentro do rascunho: é dele
          que tira os números que mostra — os mesmos do ticket, não uma segunda conta. */}
      <ModalSinal nomeConta={t.dados?.conta?.login ? `Conta ${String(t.dados.conta.login)}` : null} />
    </RascunhoProvider>
  )
}

/**
 * O gráfico de negociação de um símbolo desta conta — posições, pendentes, alertas e as acções.
 * Os estudos (Sensei, GoldKiller, MTM Scanner) vêm do próprio FundedGrafico: não se tocam aqui.
 */
export function GraficoConta({ t, ficha, chaveTf, preencher, alturaClasse }: { t: Trader; ficha: SimboloFicha; chaveTf?: string; preencher?: boolean; alturaClasse?: string }) {
  const alertas = (t.alertas.alertas ?? []).filter((a) => a.ativo && a.symbol === ficha.symbol).map((a) => ({ id: a.id, preco: a.preco, nota: a.nota }))
  return (
    <FundedGrafico
      simbolo={ficha} preco={t.vivos[ficha.symbol]} precos={t.mapa} volume={t.volume}
      posicoes={posicoesDoGrafico(t, ficha.symbol)} ordens={ordensDoGrafico(t, ficha.symbol)} podeNegociar={t.podeNegociar}
      preencher={preencher} alturaClasse={alturaClasse} chaveTf={chaveTf} alertas={alertas}
      onModificarPosicao={(id, sl, tp) => t.executar("modificar", { positionId: id, sl, tp })}
      onModificarPendente={(id, preco, sl, tp) => t.executar("modificar_pendente", { orderId: id, preco, sl, tp })}
      onFecharPosicao={(id) => t.executar("fechar", { positionId: id })}
      onCancelarPendente={(id) => t.executar("cancelar", { orderId: id })}
      onMudarSimbolo={(s) => void t.selecionarPorNome(s)}
    />
  )
}

/**
 * Pré-preenchimento vindo de um alerta, ideia ou «Usar este sinal» noutro ecrã: vai para o rascunho
 * (e portanto para o ticket E para o gráfico). Só no símbolo do link — trocar de símbolo depois não
 * arrasta o SL de ouro para o EURUSD.
 */
export function AplicarPrefill({ prefill, simboloInicial }: { prefill: Prefill | null; simboloInicial: string | null }) {
  const k = useRascunho()
  const symbol = k.simbolo.symbol
  useEffect(() => {
    if (!prefill || !(prefill.direcao || prefill.sl || prefill.tp)) return
    if (simboloInicial && !simboloInicial.split(",").includes(symbol)) return
    k.aplicar({
      lado: prefill.direcao, sl: prefill.sl ?? null, tp: prefill.tp ?? null,
      origem: prefill.origem === "scanner" || prefill.origem === "ideia_mtm" ? prefill.origem : "manual",
      ideiaRef: prefill.ideiaRef ?? null, escolhido: Boolean(prefill.direcao),
    })
  }, [prefill, symbol]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

/** Faixa do pré-preenchimento: diz de onde veio e desaparece ao fechar. */
export function FaixaPrefill({ t }: { t: Trader }) {
  const [fechada, setFechada] = useState(false)
  const p = t.prefill
  if (fechada || !p || !(p.direcao || p.sl || p.tp)) return null
  return (
    <div className="flex items-center gap-2 border-b border-[#D2A63C]/30 bg-[#D2A63C]/10 px-3 py-1.5 text-[11.5px] text-zinc-200">
      <span className="min-w-0 flex-1 truncate">
        {p.origem === "ideia_mtm" ? "Ideia MTM" : "Alerta do scanner"}: <b>{t.simbolo?.symbol}</b> {p.direcao?.toUpperCase()}
        {p.sl ? ` · SL ${p.sl}` : ""}{p.tp ? ` · TP ${p.tp}` : ""} — confirma a conta e o volume no ticket.
      </span>
      <button type="button" onClick={() => setFechada(true)} className="-my-1.5 grid h-8 w-8 place-items-center text-zinc-400" aria-label="fechar aviso">×</button>
    </div>
  )
}

/** Avisos da conta: investor, conta não activa, sem preço. */
export function AvisosConta({ t }: { t: Trader }) {
  const c = t.dados.conta
  return (
    <>
      {t.dados.modo === "investor" && (
        <div className="flex items-center gap-1.5 bg-sky-500/10 px-3 py-1 text-[11px] text-sky-300"><Eye className="h-3.5 w-3.5" /> Só leitura (investor)</div>
      )}
      {c.estado !== "ativa" && (
        <div className="flex items-center gap-1.5 bg-rose-500/10 px-3 py-1 text-[11.5px] text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Conta {estadoEmFrase(c.estadoCurto)} — só leitura{c.motivo ? `: ${String(c.motivo)}` : ""}.
        </div>
      )}
      {t.vivo.semPreco.length > 0 && <div className="px-3 py-0.5 text-[10.5px] text-amber-300">Sem preço para {t.vivo.semPreco.join(", ")} — o flutuante dessas posições conta 0.</div>}
    </>
  )
}

/** Etiqueta curta da conta (tipo + estado), para as barras. */
export function EtiquetaConta({ t }: { t: Trader }) {
  const c = t.dados.conta
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{c.etiqueta}</span>
      <span className="rounded px-1 py-0.5 text-[10.5px] font-semibold" style={{ color: COR_ESTADO[c.estadoCurto], background: `${COR_ESTADO[c.estadoCurto]}22` }}>{c.estadoCurto}</span>
    </span>
  )
}

export const corResultado = (v: number | null | undefined) => (v == null ? "text-white" : v >= 0 ? "text-emerald-300" : "text-rose-300")
export { usd }

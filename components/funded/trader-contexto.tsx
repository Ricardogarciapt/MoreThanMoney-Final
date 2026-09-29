"use client"

import { useEffect, useState, type ReactNode } from "react"
import { estadoEmFrase } from "@/lib/webtrader/textos"
import { AlertTriangle, Eye, ShieldCheck, type LucideIcon } from "lucide-react"
import type { MapaPrecos } from "@/lib/mtmfunded/simulado/matematica"
import type { LimitesConta } from "@/lib/mtmfunded/simulado/ordens"
import { gestaoDaLinha } from "@/lib/mtmfunded/simulado/avancadas"
import { type PrecoVivo, type SimboloFicha, corDoEstado, usd } from "./api"
import FundedGrafico from "./funded-grafico"
import type { Prefill } from "./funded-ticket"
import type { AlertaGrafico, OrdemGrafico, PosicaoGrafico } from "./grafico-tipos"
import { RascunhoProvider, useRascunho, type PedidoOrdem } from "./rascunho-ordem"
import ModalSinal from "./modal-sinal"
import ModalTravas from "./modal-travas"
import { textoDaFolga } from "@/lib/travas-por-tipo-de-conta"
import type { useAlertas } from "./funded-alertas"
import type { useDiario } from "./funded-diario"

/**
 * O CONTRATO DO TRADER — o que os dois layouts (SIMPLE e PRO) precisam de saber de uma conta.
 *
 * Havia dois webtraders com o mesmo trabalho e aspectos diferentes: o das contas MTM Funded
 * (funded-trader.tsx, simuladas) tinha modos, lista de símbolos e painéis arrumáveis; o das contas
 * REAIS (webtrader/corretora-trader.tsx) tinha um layout só, mais pobre. A mesma pessoa via duas
 * plataformas.
 *
 * A solução não foi copiar o layout: foi ESTREITAR o contrato. `TraderBase` é o mínimo — posições e
 * ordens já normalizadas, preços, símbolo, métricas e as PEÇAS que só o dono da conta sabe montar
 * (o ticket, os painéis, os avisos). Os layouts arrumam; quem sabe da conta é quem a lê. Assim o
 * corretora-trader constrói um `TraderBase` a partir de ContaWT/PosicaoWT/OrdemWT e ganha os mesmos
 * modos sem herdar nada do motor simulado.
 *
 * Onde um painel não faz sentido numa conta real (alertas, diário, regras de prop firm) ele
 * simplesmente NÃO entra na lista `paineis` — em vez de fingir dados vazios.
 */

export type Estado = Awaited<ReturnType<typeof import("@/lib/mtmfunded/simulado/execucao")["estadoCompleto"]>>

export interface VivoConta {
  flutuante: number; equity: number; margem: number; margemLivre: number; nivelMargemPct: number | null; semPreco: string[]
  limites: LimitesConta
}

/** Posição/ordem já traduzidas para o que o gráfico desenha — mais o símbolo, para as filtrar. */
export type PosicaoTrader = PosicaoGrafico & { symbol: string }
export type OrdemTrader = OrdemGrafico & { symbol: string }

/**
 * Um painel do trader. O PRO desenha-os todos como separadores em baixo; o SIMPLE põe os
 * `principal` na gaveta deslizável e o resto debaixo de «Mais». `irPara` deixa um painel saltar
 * para outro (o histórico abre a nota no diário) sem o layout saber de quem é o salto.
 */
export interface PainelTrader {
  chave: string
  nome: string
  icone: LucideIcon
  /** Etiqueta com o número (posições abertas, alertas activos…). 0 ou nada = sem etiqueta. */
  contagem?: number
  principal?: boolean
  /**
   * `denso` vem do layout (tabela apertada no PRO, cartões para o dedo no SIMPLE) e `fechar` deixa
   * o painel sair da frente quando manda a atenção para o gráfico (a gaveta do SIMPLE).
   */
  conteudo: (ctx: { irPara: (chave: string) => void; denso: boolean; fechar: () => void }) => ReactNode
}

export interface TraderBase {
  accountId: string
  /** O que o gráfico e os selectores lêem — venha de um motor simulado ou de uma corretora. */
  posicoes: PosicaoTrader[]
  ordens: OrdemTrader[]
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
  metricas: Array<[string, string, string?]>
  /** O que o rascunho da ordem precisa da conta (e o nome que a folha do sinal mostra). */
  carteira: {
    nome: string | null
    alavancagem: number
    margemLivre: number | null
    saldo: number | null
    equity: number | null
    flutuante: number | null
  }
  /** Linhas de alerta no gráfico — vazio nas contas que não têm alertas. */
  alertasGrafico: (symbol: string) => AlertaGrafico[]
  /** Faixas de aviso por baixo da barra (só leitura, conta travada, conta REAL, sem preço…). */
  avisos: ReactNode
  paineis: PainelTrader[]
  /** Onde fica guardado o separador escolhido — a conta simulada e a real não se pisam. */
  chavePaineis: string
  /** O ticket desta conta: o rascunho partilhado (Funded) ou o formulário da corretora. */
  ticket: ReactNode
  /** A ferramenta Long/Short do gráfico só existe onde o rascunho envia mesmo a ordem. */
  ferramentaGrafico: boolean
}

/** O trader de uma conta MTM Funded: o contrato comum MAIS o estado do motor simulado. */
export interface Trader extends TraderBase {
  dados: Estado
  vivo: VivoConta
  alertas: ReturnType<typeof useAlertas>
  diario: ReturnType<typeof useDiario>
}

/** Do estado do motor simulado para as linhas do gráfico (com os TPs parciais da gestão). */
export const posicoesSimuladas = (dados: Estado): PosicaoTrader[] =>
  dados.posicoes.map((p) => ({
    id: String(p.id), symbol: String(p.symbol), direcao: p.direcao as PosicaoTrader["direcao"], volume: Number(p.volume), preco_entrada: Number(p.preco_entrada),
    sl: p.sl == null ? null : Number(p.sl), tp: p.tp == null ? null : Number(p.tp),
    tps: gestaoDaLinha(p as Record<string, unknown>).tps,
  }))

export const ordensSimuladas = (dados: Estado): OrdemTrader[] =>
  dados.ordens.map((o) => ({
    id: String(o.id), symbol: String(o.symbol), direcao: o.direcao as OrdemTrader["direcao"], tipo: o.tipo as OrdemTrader["tipo"], volume: Number(o.volume), preco: Number(o.preco),
    sl: o.sl == null ? null : Number(o.sl), tp: o.tp == null ? null : Number(o.tp),
  }))

export const posicoesDoGrafico = (t: TraderBase, symbol: string): PosicaoGrafico[] => t.posicoes.filter((p) => p.symbol === symbol)
export const ordensDoGrafico = (t: TraderBase, symbol: string): OrdemGrafico[] => t.ordens.filter((o) => o.symbol === symbol)

/** O rascunho (ticket ⇄ gráfico) de um símbolo desta conta. */
export function ProvedorRascunho({ t, ficha, volume, setVolume, children }: { t: TraderBase; ficha: SimboloFicha; volume: number; setVolume: (v: number) => void; children: ReactNode }) {
  return (
    <RascunhoProvider
      simbolo={ficha} preco={t.vivos[ficha.symbol]} precos={t.mapa} volume={volume} setVolume={setVolume}
      alavancagem={t.carteira.alavancagem} margemLivre={t.carteira.margemLivre} saldo={t.carteira.saldo}
      onEnviar={(p) => t.enviarPedido(p, ficha.symbol)}
    >
      {children}
      {/* A folha de confirmação de um sinal (scanner/ideia) vive aqui, dentro do rascunho: é dele
          que tira os números que mostra — os mesmos do ticket, não uma segunda conta. */}
      <ModalSinal nomeConta={t.carteira.nome} />
    </RascunhoProvider>
  )
}

/**
 * O gráfico de negociação de um símbolo desta conta — posições, pendentes, alertas e as acções.
 * Os estudos (Sensei, GoldKiller, MTM Scanner) vêm do próprio FundedGrafico: não se tocam aqui.
 */
export function GraficoConta({ t, ficha, chaveTf, preencher, alturaClasse }: { t: TraderBase; ficha: SimboloFicha; chaveTf?: string; preencher?: boolean; alturaClasse?: string }) {
  return (
    <FundedGrafico
      simbolo={ficha} preco={t.vivos[ficha.symbol]} precos={t.mapa} volume={t.volume} ferramenta={t.ferramentaGrafico}
      posicoes={posicoesDoGrafico(t, ficha.symbol)} ordens={ordensDoGrafico(t, ficha.symbol)} podeNegociar={t.podeNegociar}
      preencher={preencher} alturaClasse={alturaClasse} chaveTf={chaveTf} alertas={t.alertasGrafico(ficha.symbol)}
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
export function FaixaPrefill({ t }: { t: TraderBase }) {
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

/** Avisos da conta simulada: investor, conta não activa, sem preço. */
export function AvisosConta({ dados: t_dados, vivo }: { dados: Estado; vivo: VivoConta }) {
  const c = t_dados.conta
  const [travasAbertas, setTravasAbertas] = useState(false)
  /**
   * A trava do tipo de conta (financiada 3 %/6 %, real 30 %) vem do servidor em `dados.travas` — o
   * mesmo veredicto que recusa a ordem. A faixa só aparece quando há travas nesta conta: numa conta
   * de desafio ou de análise não se põe uma faixa a falar de regras que não se lhe aplicam.
   *
   * `dados.travas` pode não existir numa resposta de um servidor antigo (a releitura leve guarda o
   * último estado): daí o `?.`, em vez de um ecrã em branco.
   */
  const travas = (t_dados as { travas?: Parameters<typeof ModalTravas>[0]["veredicto"] }).travas
  return (
    <>
      {travas?.temTrava && (
        <button
          type="button"
          onClick={() => setTravasAbertas(true)}
          className={`flex w-full items-center gap-1.5 px-3 py-1 text-left text-[11px] ${travas.podeAbrir ? "bg-white/5 text-zinc-300" : "bg-rose-500/10 text-rose-300"}`}
        >
          {travas.podeAbrir
            ? <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 flex-1 truncate">
            {travas.podeAbrir
              ? `Dia: ${textoDaFolga(travas.diaria)}`
              : "Entradas travadas pelo limite de perda — as saídas continuam"}
          </span>
          <span className="shrink-0 underline">ver</span>
        </button>
      )}
      {travasAbertas && travas && (
        <ModalTravas
          accountId={t_dados.conta.id}
          veredicto={travas}
          saldos={{ saldo: t_dados.estado.saldo, equity: vivo.equity, flutuante: vivo.flutuante, margemLivre: vivo.margemLivre }}
          onFechar={() => setTravasAbertas(false)}
        />
      )}
      {t_dados.modo === "investor" && (
        <div className="flex items-center gap-1.5 bg-sky-500/10 px-3 py-1 text-[11px] text-sky-300"><Eye className="h-3.5 w-3.5" /> Só leitura (investor)</div>
      )}
      {c.estado !== "ativa" && (
        <div className="flex items-center gap-1.5 bg-rose-500/10 px-3 py-1 text-[11.5px] text-rose-300">
          <AlertTriangle className="h-3.5 w-3.5" /> Conta {estadoEmFrase(c.estadoCurto)} — só leitura{c.motivo ? `: ${String(c.motivo)}` : ""}.
        </div>
      )}
      {vivo.semPreco.length > 0 && <div className="px-3 py-0.5 text-[10.5px] text-amber-300">Sem preço para {vivo.semPreco.join(", ")} — o flutuante dessas posições conta 0.</div>}
    </>
  )
}

/** Etiqueta curta da conta (tipo + estado), para as barras. */
export function EtiquetaConta({ t }: { t: Trader }) {
  const c = t.dados.conta
  return (
    <span className="flex shrink-0 items-center gap-1">
      <span className="rounded bg-[#D2A63C] px-1.5 py-0.5 text-[10.5px] font-bold text-black">{c.etiqueta}</span>
      <span className="rounded px-1 py-0.5 text-[10.5px] font-semibold" style={{ color: corDoEstado(c.estadoCurto), background: `${corDoEstado(c.estadoCurto)}22` }}>{c.estadoCurto}</span>
    </span>
  )
}

export const corResultado = (v: number | null | undefined) => (v == null ? "text-white" : v >= 0 ? "text-emerald-300" : "text-rose-300")
export { usd }

"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TrendingUp, TrendingDown, Lock, Zap, Eye, EyeOff, Maximize2, Minimize2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { scannersPermitidos } from "@/lib/mtmfunded/acesso"
import { ESTUDOS_WEBTRADER, type ChaveEstudoWebtrader } from "@/lib/scanners/estudos"
import type { Direcao } from "@/lib/mtmfunded/simulado/matematica"
import { px } from "./api"
import { type GraficoProps, type Tf, TIMEFRAMES, TV } from "./grafico-tipos"
import GraficoLeve from "./grafico-leve"
import { useSinaisEstudos } from "./use-sinais-estudos"
import { useGraficoVisivel } from "./grafico-visivel"
import { useRascunhoOpcional } from "./rascunho-ordem"
import { InterruptorUmClique } from "./um-clique"
import { PopoverInputsSensei, sinalDoSensei, useInputsSensei } from "./sensei-estudo"
import type { ResultadoSensei } from "@/lib/estudos/sensei/tipos"
import { PopoverInputsGoldKiller, sinalDoGoldKiller, useInputsGoldKiller } from "./goldkiller-estudo"
import type { ResultadoGoldKiller } from "@/lib/estudos/goldkiller/tipos"
import { PopoverInputsMTMScanner, sinalDoMTMScanner, useInputsMTMScanner } from "./mtmscanner-estudo"
import type { ResultadoMTMScanner } from "@/lib/estudos/mtmscanner/tipos"

export type { PosicaoGrafico, OrdemGrafico, Ferramenta } from "./grafico-tipos"


/**
 * O GRÁFICO DO WEBTRADER — um só modo, com tudo no mesmo gráfico.
 *
 * Não há vista de «análise» à parte: o gráfico é o de negociação (Lightweight Charts v5,
 * grafico-leve.tsx) e leva posições, pendentes, SL/TP/entrada arrastáveis, a ferramenta de
 * posição, o volume e os estudos MTM. O MTM SENSEI está portado (lib/estudos/sensei): o botão
 * desenha o estudo completo, com painéis e roda dentada de inputs, e o «Usar este sinal» lê a trade
 * ativa do cálculo local. O MTM GOLDKILLER também (lib/estudos/goldkiller): níveis em degrau com
 * as faixas, BUY/SELL nas viragens, roda dentada, e o «Usar este sinal» lê a última viragem (entrada =
 * Center Line, SL = Drawdown 50, TP = Gain 50/75/100). O MTM SCANNER também (lib/estudos/mtmscanner,
 * o Pine oficial V3.5): DEMAs, POC, B/S, caixa Entry/Stop/TP, estrutura, roda dentada, e o «Usar este
 * sinal» lê o último B/S (entrada/SL/TP1-3 do alerta). O gráfico gratuito do TradingView fica só no separador Scanner
 * (que não é este componente).
 *
 * A biblioteca licenciada do TradingView (grafico-tradingview.tsx + biblioteca-tv.ts) saiu a 05/10:
 * estava adormecida à espera de public/charting_library/, que nunca existiu, e custava um HEAD (404)
 * e um ecrã vazio «a verificar» em cada abertura. Para a repor: `git show 4c894bdf:components/funded/grafico-tradingview.tsx`.
 *
 * Estudos por perfil (lib/mtmfunded/acesso.ts): membro/admin todos, torneio só GoldKiller, quem
 * entrou só com login+password da conta simulada nenhum.
 *
 * «Mostrar gráfico» (grafico-visivel.ts) esconde o corpo do gráfico sem o desmontar (as velas e os
 * estudos ficam carregados); no SIMPLE o painel das posições fica com o ecrã. ECRÃ INTEIRO (useEcraInteiro):
 * o contentor passa a ocupar a janela e, onde há Fullscreen API, pede-se o ecrã inteiro ao DOCUMENTO
 * — não ao contentor, porque as confirmações das ordens (um-clique.tsx) vivem fora dele e ficariam
 * invisíveis por baixo do ecrã inteiro de um elemento. No iPhone (sem Fullscreen API fora de vídeo)
 * fica só «ocupar a janela». Sai com Esc ou com o botão; o gráfico redimensiona-se (autoSize).
 */

const CHAVE_ESTUDOS = "mtmfunded_estudos"
const CHAVE_TF = "mtmfunded_tf"

/** Ecrã inteiro do gráfico: `api` (Fullscreen API do documento + ocupar a janela) ou `janela` (só ocupar a janela). */
function useEcraInteiro() {
  const [cheio, setCheio] = useState<false | "api" | "janela">(false)
  const cheioRef = useRef(cheio)
  cheioRef.current = cheio
  const doc = () => document as Document & { webkitFullscreenElement?: Element | null; webkitFullscreenEnabled?: boolean; webkitExitFullscreen?: () => Promise<void> | void }
  const elementoCheio = () => doc().fullscreenElement ?? doc().webkitFullscreenElement ?? null
  const sair = useCallback(() => {
    const d = doc()
    if (elementoCheio()) { try { void (d.exitFullscreen ? d.exitFullscreen() : d.webkitExitFullscreen?.())?.catch?.(() => {}) } catch { /* ok */ } }
    setCheio(false)
  }, [])
  const entrar = useCallback(async () => {
    const d = doc()
    const raiz = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void }
    const pode = Boolean(d.fullscreenEnabled || d.webkitFullscreenEnabled) && Boolean(raiz.requestFullscreen || raiz.webkitRequestFullscreen)
    setCheio(pode ? "api" : "janela")
    if (!pode) return
    try { await (raiz.requestFullscreen ? raiz.requestFullscreen() : raiz.webkitRequestFullscreen?.()) } catch { setCheio("janela") }
  }, [])
  useEffect(() => {
    if (!cheio) return
    // Saiu do ecrã inteiro pelo browser (Esc, gesto): sai também de «ocupar a janela».
    const mudou = () => { if (cheioRef.current === "api" && !elementoCheio()) setCheio(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape" && cheioRef.current === "janela") setCheio(false) }
    document.addEventListener("fullscreenchange", mudou)
    document.addEventListener("webkitfullscreenchange", mudou)
    window.addEventListener("keydown", tecla)
    // A página por trás não faz scroll enquanto o gráfico ocupa a janela.
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("fullscreenchange", mudou)
      document.removeEventListener("webkitfullscreenchange", mudou)
      window.removeEventListener("keydown", tecla)
      document.body.style.overflow = antes
    }
  }, [cheio])
  // Desmontar o gráfico em ecrã inteiro (trocar de conta/modo) não deixa o browser preso nele.
  useEffect(() => () => { if (cheioRef.current === "api" && elementoCheio()) { try { void document.exitFullscreen?.().catch(() => {}) } catch { /* ok */ } } }, [])
  return { cheio, entrar, sair }
}

function ler<T>(chave: string, defeito: T): T {
  try { const v = localStorage.getItem(chave); return v == null ? defeito : (JSON.parse(v) as T) } catch { return defeito }
}
function guardar(chave: string, v: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(v)) } catch { /* ok */ }
}

export default function FundedGrafico(props: GraficoProps) {
  const { simbolo, preco, podeNegociar } = props
  const { user } = useAuth()
  // A ferramenta Long/Short vive no rascunho (partilhada com o ticket); sem rascunho, fica local.
  const [modoLocal, setModoLocal] = useState<Direcao | null>(null)
  const rascunho = useRascunhoOpcional()
  // A ferramenta Long/Short e «Usar este sinal» só onde o rascunho É o ticket (contas MTM Funded).
  const comFerramenta = Boolean(rascunho) && props.ferramenta !== false
  const modo = rascunho ? rascunho.ferramenta : modoLocal
  const setModo = (d: Direcao | null) => (rascunho ? rascunho.setFerramenta(d) : setModoLocal(d))
  const [tf, setTfEstado] = useState<Tf>("M5")
  const [estudos, setEstudos] = useState<ChaveEstudoWebtrader[]>(["Goldkiller"])

  useEffect(() => {
    setEstudos(ler<ChaveEstudoWebtrader[]>(CHAVE_ESTUDOS, ["Goldkiller"]))
    const guardado = ler<string | null>(CHAVE_TF + (props.chaveTf ?? ""), null)
    if (guardado && TIMEFRAMES.some((t) => t.chave === guardado)) setTfEstado(guardado as Tf)
  }, [])
  const setTf = (t: Tf) => { setTfEstado(t); guardar(CHAVE_TF + (props.chaveTf ?? ""), t) }

  // Quem pode usar que estudos — a mesma regra das páginas do MTM Funded e dos torneios.
  const permitidos = useMemo(() => {
    const lista = scannersPermitidos(user ?? null)
    return ESTUDOS_WEBTRADER.filter((e) => lista === null || lista.some((p) => p.toLowerCase() === e.acesso.toLowerCase()))
  }, [user])
  const ativos = useMemo(
    () => estudos.filter((c) => permitidos.some((p) => p.chave === c)),
    [estudos, permitidos],
  )
  const alternarEstudo = (c: ChaveEstudoWebtrader) => {
    const novo = estudos.includes(c) ? estudos.filter((x) => x !== c) : [...estudos, c]
    setEstudos(novo)
    guardar(CHAVE_ESTUDOS, novo)
  }

  // Sensei, GoldKiller e MTM Scanner: o estudo completo calculado aqui, no gráfico Lightweight.
  const senseiLocal = ativos.includes("Sensei")
  const { inputs: inputsSensei, definir: definirSensei, repor: reporSensei } = useInputsSensei(user?.id)
  const [resultadoSensei, setResultadoSensei] = useState<ResultadoSensei | null>(null)
  const gkLocal = ativos.includes("Goldkiller")
  const { inputs: inputsGK, definir: definirGK, repor: reporGK } = useInputsGoldKiller(user?.id)
  const [resultadoGK, setResultadoGK] = useState<ResultadoGoldKiller | null>(null)
  const msLocal = ativos.includes("MTMScanner")
  const { inputs: inputsMS, definir: definirMS, repor: reporMS } = useInputsMTMScanner(user?.id)
  const [resultadoMS, setResultadoMS] = useState<ResultadoMTMScanner | null>(null)
  const estudosSetas = useMemo(
    () => ativos.filter((c) => !(senseiLocal && c === "Sensei") && !(gkLocal && c === "Goldkiller") && !(msLocal && c === "MTMScanner")),
    [ativos, senseiLocal, gkLocal, msLocal],
  )
  const { sinais, ultimoAtivo: ultimoAlerta } = useSinaisEstudos(simbolo.symbol, estudosSetas)
  const sinalSensei = useMemo(() => (senseiLocal ? sinalDoSensei(resultadoSensei, simbolo.symbol) : null), [senseiLocal, resultadoSensei, simbolo.symbol])
  const sinalGK = useMemo(() => (gkLocal ? sinalDoGoldKiller(resultadoGK, simbolo.symbol) : null), [gkLocal, resultadoGK, simbolo.symbol])
  const sinalMS = useMemo(() => (msLocal ? sinalDoMTMScanner(resultadoMS, simbolo.symbol) : null), [msLocal, resultadoMS, simbolo.symbol])
  // O sinal em jogo: o mais recente entre a trade ativa do Sensei, a viragem do GoldKiller, o B/S do MTM Scanner e o último alerta ativo.
  const ultimoAtivo = [sinalSensei, sinalGK, sinalMS, ultimoAlerta].reduce<typeof ultimoAlerta>((melhor, x) => (x && (!melhor || x.em > melhor.em) ? x : melhor), null)
  const configSensei = useMemo(
    () => (senseiLocal ? { inputs: inputsSensei, paineis: true, aoCalcular: setResultadoSensei } : null),
    [senseiLocal, JSON.stringify(inputsSensei)], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const configGK = useMemo(
    () => (gkLocal ? { inputs: inputsGK, aoCalcular: setResultadoGK } : null),
    [gkLocal, JSON.stringify(inputsGK)], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const configMS = useMemo(
    () => (msLocal ? { inputs: inputsMS, aoCalcular: setResultadoMS } : null),
    [msLocal, JSON.stringify(inputsMS)], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const usarSinal = () => {
    // Só pré-preenche: nunca envia, nem com a negociação num clique ligada.
    if (!ultimoAtivo || !rascunho) return
    const local = ultimoAtivo.id.startsWith("sensei-local:") || ultimoAtivo.id.startsWith("goldkiller-local:") || ultimoAtivo.id.startsWith("mtmscanner-local:")
    rascunho.aplicar({ lado: ultimoAtivo.direcao, entrada: ultimoAtivo.entrada, sl: ultimoAtivo.sl, tp: ultimoAtivo.tp, origem: "scanner", ideiaRef: local ? null : ultimoAtivo.id, escolhido: false })
  }

  const spread = preco ? Math.round((preco.ask - preco.bid) * Math.pow(10, simbolo.digits)) : null
  const [visivel, setVisivel] = useGraficoVisivel()
  const { cheio, entrar, sair } = useEcraInteiro()
  // Em ecrã inteiro o gráfico mostra-se sempre e enche o contentor.
  const mostrar = visivel || Boolean(cheio)
  const encher = Boolean(props.preencher || cheio)
  const botao = "flex shrink-0 items-center gap-1 rounded border px-2 py-1"

  return (
    <div
      className={`overflow-hidden border ${cheio ? "fixed inset-0 z-[940] flex flex-col rounded-none" : `rounded-md ${props.preencher ? "flex h-full min-h-0 flex-col" : ""}`}`}
      style={{ background: TV.fundo, borderColor: TV.borda, color: TV.texto, ...(cheio ? { paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)", paddingLeft: "env(safe-area-inset-left, 0px)", paddingRight: "env(safe-area-inset-right, 0px)" } : {}) }}
      data-grafico-cheio={cheio || undefined}
    >
      {/* Linha 1 — símbolo, bid/spread/ask, ⚡ */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-2.5 py-1.5" style={{ borderColor: TV.borda }}>
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="text-[14px] font-bold text-white">{simbolo.symbol}</span>
          <span className="hidden truncate text-[11px] sm:inline" style={{ color: TV.textoFraco }}>{simbolo.nome ?? ""}</span>
        </div>
        <div className="flex items-center gap-1 font-mono text-[11.5px]">
          <span className="rounded px-1.5 py-0.5" style={{ color: TV.venda, background: "rgba(247,82,95,0.12)" }}>{px(preco?.bid, simbolo.digits)}</span>
          <span style={{ color: TV.textoFraco }}>{spread ?? "—"}</span>
          <span className="rounded px-1.5 py-0.5" style={{ color: "#8FA8FF", background: "rgba(41,98,255,0.14)" }}>{px(preco?.ask, simbolo.digits)}</span>
        </div>
        {podeNegociar && rascunho && <div className="ml-auto flex h-7 [@media(pointer:coarse)]:h-auto"><InterruptorUmClique /></div>}
      </div>

      {/* Linha 2 — timeframes, estudos (setas), ferramentas */}
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1 text-[12px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ borderColor: TV.borda }}>
        {TIMEFRAMES.map((t) => (
          <button key={t.chave} onClick={() => setTf(t.chave)} className="shrink-0 rounded px-2 py-1 font-medium hover:bg-white/5" style={{ color: tf === t.chave ? TV.azul : TV.texto }}>
            {t.rotulo}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0" style={{ background: TV.borda }} />
        {permitidos.length === 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: TV.textoFraco }}><Lock className="h-3 w-3" /> Estudos MTM para membros</span>
        ) : permitidos.map((e) => {
          const on = ativos.includes(e.chave)
          const completo = true
          return (
            <span key={e.chave} className="flex shrink-0 items-center gap-1">
              <button onClick={() => alternarEstudo(e.chave)} title={completo ? (e.chave === "Sensei" ? "MTM Sensei completo no gráfico (DEMAs, cloud, estrutura, OB, sinais e painéis)" : e.chave === "Goldkiller" ? "MTM GoldKiller completo no gráfico (níveis HLCC4, faixas, BUY/SELL)" : "MTM Scanner V3.5 completo no gráfico (DEMAs, POC, B/S, Entry/Stop/TP, estrutura)") : `Setas dos sinais ${e.rotulo} no gráfico`} className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[11px]"
                style={on ? { borderColor: e.cor, color: e.cor, background: `${e.cor}1f` } : { borderColor: TV.borda, color: TV.textoFraco }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? e.cor : TV.textoFraco }} /> {e.rotulo}
              </button>
              {completo && on && e.chave === "Sensei" && <PopoverInputsSensei inputs={inputsSensei} definir={definirSensei} repor={reporSensei} cor={e.cor} />}
              {completo && on && e.chave === "Goldkiller" && <PopoverInputsGoldKiller inputs={inputsGK} definir={definirGK} repor={reporGK} cor={e.cor} />}
              {completo && on && e.chave === "MTMScanner" && <PopoverInputsMTMScanner inputs={inputsMS} definir={definirMS} repor={reporMS} cor={e.cor} />}
            </span>
          )
        })}
        <div className="ml-auto flex shrink-0 gap-1 pl-2">
          <button type="button" onClick={() => (cheio ? sair() : void entrar())} className={botao}
            title={cheio ? "Sair do ecrã inteiro (Esc)" : "Gráfico em ecrã inteiro"} aria-label={cheio ? "sair do ecrã inteiro" : "gráfico em ecrã inteiro"} aria-pressed={Boolean(cheio)}
            style={cheio ? { borderColor: TV.azul, color: "#fff", background: "rgba(41,98,255,0.2)" } : { borderColor: TV.borda, color: TV.texto }}>
            {cheio ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          {!cheio && (
            <button type="button" onClick={() => setVisivel(!visivel)} className={botao}
              title={visivel ? "Esconder o gráfico (fica o painel das posições)" : "Mostrar gráfico"} aria-label="mostrar gráfico" aria-pressed={visivel}
              style={visivel ? { borderColor: TV.borda, color: TV.texto } : { borderColor: TV.azul, color: "#fff", background: "rgba(41,98,255,0.2)" }}>
              {visivel ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />} <span className="hidden sm:inline">Mostrar gráfico</span>
            </button>
          )}
        {podeNegociar && comFerramenta && (
          <>
            <button onClick={() => setModo(modo === "buy" ? null : "buy")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "buy" ? { borderColor: TV.tp, background: "rgba(8,153,129,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.tp }}>
              <TrendingUp className="h-3.5 w-3.5" /> Posição longa
            </button>
            <button onClick={() => setModo(modo === "sell" ? null : "sell")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "sell" ? { borderColor: TV.sl, background: "rgba(242,54,69,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.sl }}>
              <TrendingDown className="h-3.5 w-3.5" /> Posição curta
            </button>
          </>
        )}
        </div>
      </div>

      {ultimoAtivo && comFerramenta && podeNegociar && (
        <div className="flex flex-wrap items-center gap-2 border-b px-2.5 py-1.5 text-[11.5px]" style={{ borderColor: TV.borda, background: `${ultimoAtivo.estudo.cor}10` }}>
          <Zap className="h-3.5 w-3.5" style={{ color: ultimoAtivo.estudo.cor }} />
          <span>
            <b style={{ color: ultimoAtivo.estudo.cor }}>{ultimoAtivo.estudo.rotulo}</b> {ultimoAtivo.direcao === "buy" ? "compra" : "venda"}
            {ultimoAtivo.entrada != null ? ` @ ${px(ultimoAtivo.entrada, simbolo.digits)}` : ""}
            {ultimoAtivo.sl != null ? ` · SL ${px(ultimoAtivo.sl, simbolo.digits)}` : ""}
            {ultimoAtivo.tp != null ? ` · TP ${px(ultimoAtivo.tp, simbolo.digits)}` : ""}
          </span>
          <button onClick={usarSinal} className="ml-auto rounded px-2.5 py-1 font-semibold text-white" style={{ background: TV.azul }}>Usar este sinal</button>
        </div>
      )}

      {/* Escondido fica montado (display:none): velas, estudos e subscrições não se perdem. */}
      <div className={mostrar ? "contents" : "hidden"}>
      {/* A trade ativa do Sensei já tem as linhas ENTRY/SL/EXIT do próprio estudo e o GoldKiller os
          seus níveis: só o alerta (não o sinal local) leva as linhas ténues de referência. */}
      <GraficoLeve {...props} preencher={encher} sinais={sinais} sinalAtivo={ultimoAlerta} sensei={configSensei} goldkiller={configGK} mtmscanner={configMS} tf={tf} modo={modo} setModo={setModo} />
      </div>
    </div>
  )
}

"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, TrendingDown, Lock, Zap } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { scannersPermitidos } from "@/lib/mtmfunded/acesso"
import { ESTUDOS_WEBTRADER, type ChaveEstudoWebtrader } from "@/lib/scanners/estudos"
import type { Direcao } from "@/lib/mtmfunded/simulado/matematica"
import { px } from "./api"
import { type GraficoProps, type Tf, TIMEFRAMES, TV } from "./grafico-tipos"
import { bibliotecaTvDisponivel } from "./biblioteca-tv"
import GraficoLeve from "./grafico-leve"
import GraficoTradingView from "./grafico-tradingview"
import { useSinaisEstudos } from "./use-sinais-estudos"
import { useRascunhoOpcional } from "./rascunho-ordem"
import { InterruptorUmClique } from "./um-clique"

export type { PosicaoGrafico, OrdemGrafico, Ferramenta } from "./grafico-tipos"

/**
 * O GRÁFICO DO WEBTRADER — um só modo, com tudo no mesmo gráfico.
 *
 * Não há vista de «análise» à parte: o gráfico é o de negociação (Lightweight Charts v5,
 * grafico-leve.tsx) e leva posições, pendentes, SL/TP/entrada arrastáveis, a ferramenta de
 * posição, o volume e as SETAS dos sinais dos estudos MTM (GoldKiller, Sensei, MTM Scanner) — os
 * botões dos estudos na barra ligam e desligam essas setas. O gráfico gratuito do TradingView fica
 * só no separador Scanner (que não é este componente).
 *
 * A biblioteca licenciada do TradingView (grafico-tradingview.tsx) está adormecida: só é usada,
 * sozinha e no mesmo modo único, se existir em public/charting_library/ E tiver as primitivas de
 * trading (edição Trading Platform). Se arrancar sem elas, ou falhar, volta-se ao Lightweight.
 *
 * Estudos por perfil (lib/mtmfunded/acesso.ts): membro/admin todos, torneio só GoldKiller, quem
 * entrou só com login+password da conta simulada nenhum.
 */

const CHAVE_ESTUDOS = "mtmfunded_estudos"
const CHAVE_TF = "mtmfunded_tf"

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
  const modo = rascunho ? rascunho.ferramenta : modoLocal
  const setModo = (d: Direcao | null) => (rascunho ? rascunho.setFerramenta(d) : setModoLocal(d))
  const [motor, setMotor] = useState<"a_verificar" | "tv" | "leve">("a_verificar")
  const [semTradingPlatform, setSemTradingPlatform] = useState(false)
  const [tf, setTfEstado] = useState<Tf>("M5")
  const [estudos, setEstudos] = useState<ChaveEstudoWebtrader[]>(["Goldkiller"])

  useEffect(() => {
    bibliotecaTvDisponivel().then((ok) => setMotor(ok ? "tv" : "leve"))
    setEstudos(ler<ChaveEstudoWebtrader[]>(CHAVE_ESTUDOS, ["Goldkiller"]))
    const guardado = ler<string | null>(CHAVE_TF, null)
    if (guardado && TIMEFRAMES.some((t) => t.chave === guardado)) setTfEstado(guardado as Tf)
  }, [])
  const setTf = (t: Tf) => { setTfEstado(t); guardar(CHAVE_TF, t) }

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

  const { sinais, ultimoAtivo } = useSinaisEstudos(simbolo.symbol, ativos)

  const usarSinal = () => {
    // Só pré-preenche: nunca envia, nem com a negociação num clique ligada.
    if (!ultimoAtivo || !rascunho) return
    rascunho.aplicar({ lado: ultimoAtivo.direcao, entrada: ultimoAtivo.entrada, sl: ultimoAtivo.sl, tp: ultimoAtivo.tp, origem: "scanner", ideiaRef: ultimoAtivo.id, escolhido: false })
  }

  const spread = preco ? Math.round((preco.ask - preco.bid) * Math.pow(10, simbolo.digits)) : null

  return (
    <div className="overflow-hidden rounded-md border" style={{ background: TV.fundo, borderColor: TV.borda, color: TV.texto }}>
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
        {podeNegociar && rascunho && <div className="ml-auto h-7"><InterruptorUmClique /></div>}
      </div>

      {/* Linha 2 — timeframes, estudos (setas), ferramentas */}
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1 text-[12px]" style={{ borderColor: TV.borda }}>
        {motor !== "tv" && TIMEFRAMES.map((t) => (
          <button key={t.chave} onClick={() => setTf(t.chave)} className="shrink-0 rounded px-2 py-1 font-medium hover:bg-white/5" style={{ color: tf === t.chave ? TV.azul : TV.texto }}>
            {t.rotulo}
          </button>
        ))}
        <span className="mx-1 h-4 w-px shrink-0" style={{ background: TV.borda }} />
        {permitidos.length === 0 ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px]" style={{ color: TV.textoFraco }}><Lock className="h-3 w-3" /> Estudos MTM para membros</span>
        ) : permitidos.map((e) => {
          const on = ativos.includes(e.chave)
          return (
            <button key={e.chave} onClick={() => alternarEstudo(e.chave)} title={`Setas dos sinais ${e.rotulo} no gráfico`} className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[11px]"
              style={on ? { borderColor: e.cor, color: e.cor, background: `${e.cor}1f` } : { borderColor: TV.borda, color: TV.textoFraco }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? e.cor : TV.textoFraco }} /> {e.rotulo}
            </button>
          )
        })}
        {podeNegociar && rascunho && (
          <div className="ml-auto flex shrink-0 gap-1 pl-2">
            <button onClick={() => setModo(modo === "buy" ? null : "buy")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "buy" ? { borderColor: TV.tp, background: "rgba(8,153,129,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.tp }}>
              <TrendingUp className="h-3.5 w-3.5" /> Posição longa
            </button>
            <button onClick={() => setModo(modo === "sell" ? null : "sell")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "sell" ? { borderColor: TV.sl, background: "rgba(242,54,69,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.sl }}>
              <TrendingDown className="h-3.5 w-3.5" /> Posição curta
            </button>
          </div>
        )}
      </div>

      {ultimoAtivo && rascunho && podeNegociar && (
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

      {motor === "a_verificar" ? (
        <div className={props.alturaClasse ?? "h-[400px] md:h-[500px]"} />
      ) : motor === "tv" ? (
        // Adormecido: só com a Trading Platform instalada. Sem primitivas de trading ou a falhar → Lightweight.
        <GraficoTradingView {...props} sinais={sinais} sinalAtivo={ultimoAtivo} modo={modo} setModo={setModo} onFalhou={() => setMotor("leve")} onSemLinhas={() => { setSemTradingPlatform(true); setMotor("leve") }} />
      ) : (
        <GraficoLeve {...props} sinais={sinais} sinalAtivo={ultimoAtivo} tf={tf} modo={modo} setModo={setModo} />
      )}
      {semTradingPlatform && (
        <p className="border-t px-2 py-1 text-center text-[10.5px]" style={{ borderColor: TV.borda, color: TV.textoFraco }}>
          A biblioteca TradingView instalada é «Advanced Charts»: linhas de ordens exigem a biblioteca Trading Platform — a usar o gráfico Lightweight.
        </p>
      )}
    </div>
  )
}

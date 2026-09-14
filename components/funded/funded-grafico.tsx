"use client"

import { useEffect, useMemo, useState } from "react"
import { TrendingUp, TrendingDown, Lock, Zap } from "lucide-react"
import TvChartEmbed from "@/components/tv-chart-embed"
import { useAuth } from "@/contexts/auth-context"
import { scannersPermitidos } from "@/lib/mtmfunded/acesso"
import { ESTUDOS_WEBTRADER, scannerStudies, type ChaveEstudoWebtrader } from "@/lib/scanners/estudos"
import type { Direcao } from "@/lib/mtmfunded/simulado/matematica"
import { px, tvSymbolDe } from "./api"
import { type GraficoProps, type Tf, TIMEFRAMES, TV, tfPorChave } from "./grafico-tipos"
import { bibliotecaTvDisponivel } from "./biblioteca-tv"
import GraficoLeve from "./grafico-leve"
import GraficoTradingView from "./grafico-tradingview"
import { useSinaisEstudos } from "./use-sinais-estudos"
import { useRascunhoOpcional } from "./rascunho-ordem"

export type { PosicaoGrafico, OrdemGrafico, Ferramenta } from "./grafico-tipos"

/**
 * O GRÁFICO DO WEBTRADER — escolhe o motor e junta as duas vistas.
 *
 * Duas vistas, com um interruptor que se lembra da última escolha:
 *  · «Análise (TradingView + estudos)» — o widget gratuito do TradingView com os NOSSOS estudos
 *    publicados (GoldKiller, Sensei, MTM Scanner). Corre Pine, mas não aceita linhas de ordens.
 *  · «Negociar (linhas arrastáveis)» — o gráfico onde a ordem se desenha e arrasta, ligado ao ticket.
 *    O motor escolhe-se sozinho: a biblioteca licenciada do TradingView se estiver em
 *    public/charting_library/ (biblioteca-tv.ts), senão o nosso gráfico leve vestido de TradingView.
 *
 * Por defeito: com a biblioteca → Negociar (é o TradingView a sério, com linhas); sem ela → Análise,
 * porque é aí que os estudos correm. Nenhum dos dois motores de negociação corre Pine, por isso lá
 * os estudos aparecem como os SINAIS que deram (setas + linhas do sinal activo, da base de dados).
 *
 * Estudos por perfil (lib/mtmfunded/acesso.ts): membro/admin todos, torneio só GoldKiller, quem
 * entrou só com login+password da conta simulada nenhum.
 */

type Vista = "analise" | "negociar"
const CHAVE_VISTA = "mtmfunded_vista_grafico"
const CHAVE_ESTUDOS = "mtmfunded_estudos"

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
  // Carregar em Long/Short (no ticket ou aqui) com a vista de análise aberta leva à vista de negociar:
  // é lá que as linhas se desenham e arrastam.
  useEffect(() => {
    if (modo && vista === "analise") mudarVista("negociar")
  }, [modo]) // eslint-disable-line react-hooks/exhaustive-deps
  const [motor, setMotor] = useState<"a_verificar" | "tv" | "leve">("a_verificar")
  const [vista, setVista] = useState<Vista | null>(null)
  const [tf, setTf] = useState<Tf>("M5")
  const [estudos, setEstudos] = useState<ChaveEstudoWebtrader[]>(["Goldkiller"])

  useEffect(() => {
    bibliotecaTvDisponivel().then((ok) => {
      setMotor(ok ? "tv" : "leve")
      setVista(ler<Vista | null>(CHAVE_VISTA, null) ?? (ok ? "negociar" : "analise"))
    })
    setEstudos(ler<ChaveEstudoWebtrader[]>(CHAVE_ESTUDOS, ["Goldkiller"]))
  }, [])

  const mudarVista = (v: Vista) => { setVista(v); guardar(CHAVE_VISTA, v) }

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
  const estudosTv = useMemo(() => ativos.flatMap((c) => scannerStudies[c] ?? []), [ativos])

  const { sinais, ultimoAtivo } = useSinaisEstudos(vista === "negociar" ? simbolo.symbol : null, ativos)

  const usarSinal = () => {
    if (!ultimoAtivo || !rascunho) return
    rascunho.aplicar({ lado: ultimoAtivo.direcao, entrada: ultimoAtivo.entrada, sl: ultimoAtivo.sl, tp: ultimoAtivo.tp, origem: "scanner", ideiaRef: ultimoAtivo.id, escolhido: false })
  }

  const spread = preco ? Math.round((preco.ask - preco.bid) * Math.pow(10, simbolo.digits)) : null
  const negociar = vista === "negociar"

  return (
    <div className="overflow-hidden rounded-md border" style={{ background: TV.fundo, borderColor: TV.borda, color: TV.texto }}>
      {/* Linha 1 — símbolo, bid/ask, e o interruptor das vistas */}
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
        <div className="ml-auto flex overflow-hidden rounded border text-[11.5px]" style={{ borderColor: TV.borda }}>
          <button onClick={() => mudarVista("analise")} className="px-2.5 py-1" style={vista === "analise" ? { background: TV.azul, color: "#fff" } : { color: TV.textoFraco }}>
            Análise (TradingView + estudos)
          </button>
          <button onClick={() => mudarVista("negociar")} className="px-2.5 py-1" style={negociar ? { background: TV.azul, color: "#fff" } : { color: TV.textoFraco }}>
            Negociar (linhas arrastáveis)
          </button>
        </div>
      </div>

      {/* Linha 2 — timeframes, estudos, ferramentas */}
      <div className="flex items-center gap-1 overflow-x-auto border-b px-2 py-1 text-[12px]" style={{ borderColor: TV.borda }}>
        {!(negociar && motor === "tv") && TIMEFRAMES.map((t) => (
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
            <button key={e.chave} onClick={() => alternarEstudo(e.chave)} className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[11px]"
              style={on ? { borderColor: e.cor, color: e.cor, background: `${e.cor}1f` } : { borderColor: TV.borda, color: TV.textoFraco }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: on ? e.cor : TV.textoFraco }} /> {e.rotulo}
            </button>
          )
        })}
        {negociar && podeNegociar && rascunho && (
          <div className="ml-auto flex shrink-0 gap-1 pl-2">
            <button onClick={() => setModo(modo === "buy" ? null : "buy")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "buy" ? { borderColor: TV.tp, background: "rgba(8,153,129,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.tp }}>
              <TrendingUp className="h-3.5 w-3.5" /> Long
            </button>
            <button onClick={() => setModo(modo === "sell" ? null : "sell")} className="flex items-center gap-1 rounded border px-2 py-1"
              style={modo === "sell" ? { borderColor: TV.sl, background: "rgba(242,54,69,0.2)", color: "#fff" } : { borderColor: TV.borda, color: TV.sl }}>
              <TrendingDown className="h-3.5 w-3.5" /> Short
            </button>
          </div>
        )}
      </div>

      {negociar && ultimoAtivo && rascunho && podeNegociar && (
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

      {vista == null || motor === "a_verificar" ? (
        <div className={props.alturaClasse ?? "h-[340px] md:h-[440px]"} />
      ) : vista === "analise" ? (
        <div>
          <TvChartEmbed tvSymbol={tvSymbolDe(simbolo)} interval={String(tfPorChave(tf).seg >= 86400 ? "D" : tfPorChave(tf).seg / 60)} height={420} studies={estudosTv} />
          <p className="px-2 py-1.5 text-center text-[10.5px]" style={{ color: TV.textoFraco }}>
            Análise com os estudos MTM. O ticket abaixo negoceia daqui; ao carregar em Long/Short o gráfico passa às linhas arrastáveis. Com a biblioteca TradingView (pedida), análise e linhas ficam no mesmo gráfico.
          </p>
        </div>
      ) : motor === "tv" ? (
        <GraficoTradingView {...props} sinais={sinais} sinalAtivo={ultimoAtivo} modo={modo} setModo={setModo} onFalhou={() => setMotor("leve")} />
      ) : (
        <GraficoLeve {...props} sinais={sinais} sinalAtivo={ultimoAtivo} tf={tf} modo={modo} setModo={setModo} />
      )}
    </div>
  )
}

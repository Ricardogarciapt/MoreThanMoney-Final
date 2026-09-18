"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react"
import { type Direcao, normalizarVolume, pips } from "@/lib/mtmfunded/simulado/matematica"
import { percentagemDeUsd, valorDoNivel } from "@/lib/mtmfunded/simulado/niveis-financeiros"
import { px, usd } from "./api"
import { type ModoNiveis, type ModoVolume, useRascunho } from "./rascunho-ordem"
import { EtiquetaUmClique, InterruptorUmClique, useUmClique } from "./um-clique"
import OrdensAvancadas from "./ordens-avancadas"
import { modoNiveisPermitido } from "@/lib/webtrader/ticket"

/**
 * O TICKET — comprar/vender com tudo à vista ANTES de confirmar: margem, comissão e valor do pip.
 *
 * As contas são as mesmas do servidor (lib/mtmfunded/simulado/matematica): o que o ticket diz que
 * custa é o que a conta paga. SL/TP por preço, pips, dinheiro ($) ou % do saldo — quem vem de sinais
 * pensa em pips, quem vem do gráfico em preço e quem gere risco em dinheiro. O volume escreve-se em
 * lote ou sai do risco ($ / %) e da distância ao SL.
 */

const NOMES_NIVEIS: Array<[ModoNiveis, string]> = [["preco", "Preço"], ["pips", "Pips"], ["usd", "$"], ["pct", "%"]]
const NOMES_VOLUME: Array<[ModoVolume, string]> = [["lote", "Lote"], ["risco_usd", "Risco $"], ["risco_pct", "Risco %"]]

export interface Prefill { direcao?: Direcao; sl?: number | null; tp?: number | null; origem?: string; ideiaRef?: string | null }

/**
 * Ligado nos dois sentidos ao gráfico pelo rascunho (rascunho-ordem.tsx): escrever aqui desenha
 * as linhas; arrastá-las escreve aqui. Passar o rato (ou manter o dedo) em SELL/BUY mostra a
 * ordem desse lado no gráfico; tocar escolhe-o e abre o resumo.
 */
export default function FundedTicket(props: { margemLivre: number | null }) {
  const k = useRascunho()
  const umClique = useUmClique()
  const { r, simbolo: s, preco, volume, setVolume, erros, resumo, saldo } = k
  const modo = r.modoNiveis
  const emRisco = k.modoVolume !== "lote"
  // No modo risco o $/% do SL É o risco: escreve-se no volume, e o campo do SL só o mostra.
  const slPeloRisco = emRisco && (modo === "usd" || modo === "pct")
  const [edicao, setEdicao] = useState<{ campo: "entrada" | "sl" | "tp"; texto: string } | null>(null)
  const [textoRisco, setTextoRisco] = useState<string | null>(null)
  const [textoVolume, setTextoVolume] = useState<string | null>(null)
  const segurou = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const passo = s.volume_step || 0.01
  const mudarVolume = (delta: number) => {
    const v = normalizarVolume(s, Math.max(s.volume_min, Math.round((volume + delta) / passo) * passo))
    if (v != null) setVolume(v)
    k.set({ visivel: true })
  }

  const numero = (t: string) => { const n = Number(String(t).replace(",", ".")); return t.trim() && Number.isFinite(n) && n > 0 ? n : null }

  /** Dinheiro (sempre positivo) e % do saldo de um nível — com o volume efectivo da ordem. */
  const dinheiro = (v: number | null) =>
    v == null || k.entrada == null ? null : valorDoNivel(s, r.lado, k.entrada, v, volume, { ...k.precos, ...(preco ? { [s.symbol]: preco } : {}) })

  /** O que o campo mostra quando não se está a escrever nele: o estado, no modo escolhido. */
  const mostrado = (campo: "entrada" | "sl" | "tp") => {
    if (edicao?.campo === campo) return edicao.texto
    if (campo === "entrada") return r.entrada == null ? "" : px(r.entrada, s.digits)
    const v = campo === "sl" ? k.sl : k.tp
    if (v == null) return ""
    if (modo === "pips" && k.entrada != null) return String(pips(s, k.entrada, v))
    if (modo === "usd") { const d = dinheiro(v); return d == null ? "" : d.toFixed(2) }
    if (modo === "pct") { const d = percentagemDeUsd(dinheiro(v), saldo); return d == null ? "" : String(d) }
    return px(v, s.digits)
  }
  const escrever = (campo: "entrada" | "sl" | "tp", texto: string) => {
    setEdicao({ campo, texto })
    const n = numero(texto)
    if (campo === "entrada") return k.set({ entrada: n, visivel: true })
    if (modo === "pips") k.definirPips(campo, n)
    else if (modo === "usd" || modo === "pct") k.definirValor(campo, modo, n)
    else k.definirNivel(campo, n)
  }
  /** Por baixo de cada campo, as outras formas do mesmo nível (a que se escreve não se repete). */
  const legenda = (campo: "sl" | "tp") => {
    const v = campo === "sl" ? k.sl : k.tp
    if (v == null || k.entrada == null) return null
    const d = dinheiro(v)
    const pct = percentagemDeUsd(d, saldo)
    const partes: string[] = []
    if (modo !== "preco") partes.push(px(v, s.digits))
    if (modo !== "pips") partes.push(`${pips(s, k.entrada, v)} pips`)
    if (modo !== "usd") partes.push(`${campo === "sl" ? "−" : "+"}${usd(d)} $`)
    if (modo !== "pct" && pct != null) partes.push(`${pct}%`)
    return partes.join(" · ")
  }

  // O nível mudou por fora (linha arrastada no gráfico) enquanto o campo tinha texto por escrever:
  // o que está no gráfico ganha — o campo passa a mostrar o valor novo.
  useEffect(() => {
    if (!edicao) return
    const n = numero(edicao.texto)
    const atual = edicao.campo === "entrada" ? r.entrada : edicao.campo === "sl" ? k.sl : k.tp
    if (n == null || atual == null) return
    // Em $/% o que se escreveu fica guardado tal e qual: enquanto for o mesmo, continua-se a escrever
    // (o preço arredondado aos dígitos daria outro dinheiro e apagava o que se está a escrever).
    if (edicao.campo !== "entrada" && (modo === "usd" || modo === "pct")) {
      if (r.fixos[edicao.campo]?.valor !== n) setEdicao(null)
      return
    }
    const comparado = edicao.campo !== "entrada" && modo === "pips" && k.entrada != null ? pips(s, k.entrada, atual) : atual
    if (Math.abs(comparado - n) > (modo === "pips" && edicao.campo !== "entrada" ? 0.05 : Math.pow(10, -s.digits))) setEdicao(null)
  }, [r.entrada, k.sl, k.tp, r.fixos]) // eslint-disable-line react-hooks/exhaustive-deps

  const trocarTipo = (t: "mercado" | "limit" | "stop") => {
    // Uma pendente nova começa no preço de agora: a linha aparece onde se vê e arrasta-se dali.
    if (t === "mercado") return k.set({ tipo: t, entrada: null })
    k.set({ tipo: t, visivel: true, entrada: r.entrada ?? k.entrada ?? null })
  }

  const verLado = (lado: Direcao) => { if (!r.escolhido) k.set({ lado }) }
  const premir = (lado: Direcao) => {
    // Num clique não há pré-visualização por pressão longa: tocar é enviar.
    if (umClique.ligado) return
    segurou.current = false
    temporizador.current = setTimeout(() => { segurou.current = true; k.set({ lado, visivel: true }) }, 350)
  }
  const largar = () => { if (temporizador.current) clearTimeout(temporizador.current) }
  // Num clique: o lado muda primeiro (o SL/TP em pips/$/% recalcula-se para esse lado) e a ordem
  // sai no render seguinte, já validada com os níveis desse lado.
  const [pedidoEnvio, setPedidoEnvio] = useState<{ lado: Direcao; n: number } | null>(null)
  const escolher = (lado: Direcao) => {
    if (segurou.current) { segurou.current = false; return }
    if (umClique.ligado) {
      if (k.aEnviar || umClique.ocupado) return
      setPedidoEnvio((p) => ({ lado, n: (p?.n ?? 0) + 1 }))
      k.set({ lado, visivel: true })
      return
    }
    k.set({ lado, escolhido: true, visivel: true })
  }
  useEffect(() => {
    if (!pedidoEnvio || pedidoEnvio.lado !== r.lado) return
    setPedidoEnvio(null)
    // Com erros não sai nada: abre-se o resumo, onde os erros ficam à vista.
    if (k.temErros || k.entrada == null) k.set({ escolhido: true })
    else void k.enviar()
  }, [pedidoEnvio, r.lado]) // eslint-disable-line react-hooks/exhaustive-deps

  const semPreco = !preco?.fresco
  const Erro = ({ t }: { t?: string }) => (t ? <p className="text-[11px] text-rose-300">{t}</p> : null)

  return (
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-[#131722] p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="flex items-center gap-1.5 text-[15px] font-bold text-white">{s.symbol} <EtiquetaUmClique /></p>
          <p className="text-[10.5px] text-zinc-500">{s.nome ?? ""} · spread {s.spread_pontos} pts</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
          {(["mercado", "limit", "stop"] as const).map((t) => (
            <button key={t} onClick={() => trocarTipo(t)} className={`rounded-md px-2 py-1 ${r.tipo === t ? "bg-[#2962FF] text-white" : "text-zinc-400"}`}>
              {t === "mercado" ? "Mercado" : t === "limit" ? "Limit" : "Stop"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-zinc-400">Volume</span>
        <Segmentos opcoes={NOMES_VOLUME} ativo={k.modoVolume} onEscolher={(m) => { setTextoRisco(null); k.definirModoVolume(m) }} rotulo="modo do volume" />
      </div>
      {!emRisco ? (
        <div className="flex items-center gap-2">
          <button onClick={() => mudarVolume(-passo)} aria-label="menos volume" className="grid h-9 w-9 place-items-center rounded-lg bg-white/5"><Minus className="h-4 w-4" /></button>
          <input
            inputMode="decimal" aria-label="volume em lotes"
            value={textoVolume ?? String(volume)}
            // O texto escrito fica no campo enquanto se escreve: com `value={volume}` numérico, «0,» ou
            // «0.0» viravam 0 e não se conseguia escrever 0,05 à mão.
            onChange={(e) => { setTextoVolume(e.target.value); const v = numero(e.target.value); if (v != null) { setVolume(v); k.set({ visivel: true }) } }}
            onBlur={() => { setTextoVolume(null); const v = normalizarVolume(s, volume); setVolume(v ?? s.volume_min) }}
            className={`h-9 w-full rounded-lg border bg-black text-center font-mono text-white ${erros.volume ? "border-rose-500" : "border-white/10"}`}
          />
          <button onClick={() => mudarVolume(passo)} aria-label="mais volume" className="grid h-9 w-9 place-items-center rounded-lg bg-white/5"><Plus className="h-4 w-4" /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <input
              inputMode="decimal" aria-label={k.modoVolume === "risco_usd" ? "risco em dólares" : "risco em % do saldo"}
              value={textoRisco ?? (k.riscoEscrito == null ? "" : String(k.riscoEscrito))}
              placeholder={k.modoVolume === "risco_usd" ? "Risco" : "Risco do saldo"}
              onChange={(e) => { setTextoRisco(e.target.value); k.definirRisco(numero(e.target.value)); k.set({ visivel: true }) }}
              onBlur={() => setTextoRisco(null)}
              className={`h-9 w-full rounded-lg border bg-black pl-2 pr-7 font-mono text-white ${erros.volume ? "border-rose-500" : "border-white/10"}`}
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500">{k.modoVolume === "risco_usd" ? "$" : "%"}</span>
          </div>
          <span className="text-zinc-500">=</span>
          <span className={`h-9 min-w-[6.5rem] rounded-lg border px-2 text-center font-mono leading-9 ${k.dimensionamento?.volume != null ? "border-white/10 text-white" : "border-white/5 text-zinc-600"}`} title="lote calculado pelo risco e pela distância ao SL">
            {k.dimensionamento?.volume != null ? `${k.dimensionamento.volume} lote${k.dimensionamento.volume === 1 ? "" : "s"}` : "— lotes"}
          </span>
        </div>
      )}
      <Erro t={erros.volume} />
      {emRisco && k.dimensionamento?.limitado && k.dimensionamento.volume != null && (
        <p className="text-[11px] text-amber-300">
          Lote preso ao {k.dimensionamento.limitado === "min" ? "mínimo" : "máximo"} ({k.dimensionamento.volume}) — risco real {usd(k.dimensionamento.riscoReal)} ${percentagemDeUsd(k.dimensionamento.riscoReal, saldo) != null ? ` (${percentagemDeUsd(k.dimensionamento.riscoReal, saldo)}%)` : ""}
          {k.dimensionamento.limitado === "min" ? ", acima do que pediste." : ", abaixo do que pediste."}
        </p>
      )}

      {r.tipo !== "mercado" && (
        <>
          <div className="flex items-center gap-2">
            <span className="w-14 text-zinc-400">Preço</span>
            <input
              inputMode="decimal" value={mostrado("entrada")} placeholder={preco ? px(preco.bid, s.digits) : ""}
              onChange={(e) => escrever("entrada", e.target.value)} onBlur={() => setEdicao(null)}
              className={`h-9 w-full rounded-lg border bg-black px-2 font-mono text-white ${erros.entrada ? "border-rose-500" : "border-white/10"}`}
            />
          </div>
          <Erro t={erros.entrada} />
        </>
      )}

      {/* Desenhar no gráfico: a MESMA ordem, marcada à mão com a ferramenta de posição. Não é um
          segundo par de botões de compra/venda — esses são o SELL/BUY lá em baixo. Por isso tem
          aspecto de ferramenta (ícone + «desenhar»), não de botão de ordem. */}
      <div className="flex items-center justify-between">
        <span className="text-zinc-400">Desenhar no gráfico</span>
        <div className="flex gap-1 text-[11px]">
          {(["buy", "sell"] as const).map((lado) => {
            const on = k.ferramenta === lado
            const Icone = lado === "buy" ? TrendingUp : TrendingDown
            return (
              <button
                key={lado}
                title={lado === "buy" ? "Ferramenta de posição longa: marca entrada, SL e TP no gráfico" : "Ferramenta de posição curta: marca entrada, SL e TP no gráfico"}
                onClick={() => {
                  if (on) { k.setFerramenta(null); return }
                  k.setFerramenta(lado)
                  k.colocar(lado, r.tipo === "mercado" ? null : r.entrada)
                }}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 ${
                  on ? "border-[#2962FF] bg-[#2962FF]/20 text-white" : "border-white/10 text-zinc-400 hover:text-white"
                }`}
              >
                <Icone className="h-3.5 w-3.5" /> {lado === "buy" ? "posição longa" : "posição curta"}
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-zinc-400">SL / TP</span>
        <Segmentos opcoes={NOMES_NIVEIS} ativo={modo} onEscolher={(m) => { setEdicao(null); k.definirModoNiveis(m) }} rotulo="modo do SL e TP"
          desactivado={(m) => (modoNiveisPermitido(k.modoVolume, m) ? null : "No modo Risco o SL escreve-se em preço ou pips — o risco já é o dinheiro")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input
            inputMode="decimal" aria-label="stop loss" value={mostrado("sl")} onChange={(e) => escrever("sl", e.target.value)} onBlur={() => setEdicao(null)}
            readOnly={slPeloRisco}
            title={slPeloRisco ? "No modo Risco o dinheiro do SL é o risco: escreve o SL em preço ou pips, ou arrasta a linha" : undefined}
            placeholder={PLACEHOLDER[modo].sl}
            className={`h-9 w-full rounded-lg border bg-black px-2 font-mono text-rose-200 placeholder:text-zinc-600 ${slPeloRisco ? "opacity-60" : ""} ${erros.sl ? "border-rose-500 ring-1 ring-rose-500" : "border-rose-500/30"}`}
          />
          {legenda("sl") && <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{legenda("sl")}</p>}
        </div>
        <div>
          <input
            inputMode="decimal" aria-label="take profit" value={mostrado("tp")} onChange={(e) => escrever("tp", e.target.value)} onBlur={() => setEdicao(null)}
            placeholder={PLACEHOLDER[modo].tp}
            className={`h-9 w-full rounded-lg border bg-black px-2 font-mono text-emerald-200 placeholder:text-zinc-600 ${erros.tp ? "border-rose-500 ring-1 ring-rose-500" : "border-emerald-500/30"}`}
          />
          {legenda("tp") && <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{legenda("tp")}</p>}
        </div>
      </div>
      {slPeloRisco && <p className="text-[10.5px] text-zinc-500">No modo Risco, o $/% do SL é o risco do volume — o SL escreve-se em preço ou pips, ou arrasta-se a linha.</p>}
      <Erro t={erros.sl} />
      <Erro t={erros.tp} />
      <Erro t={erros.margem} />

      <OrdensAvancadas />

      <div className="flex gap-2">
      <div className="grid flex-1 grid-cols-2 gap-2">
        {(["sell", "buy"] as const).map((lado) => {
          const ativo = r.lado === lado
          const venda = lado === "sell"
          return (
            <button
              key={lado} disabled={semPreco || (umClique.ligado && (k.aEnviar || umClique.ocupado))}
              onMouseEnter={() => verLado(lado)} onFocus={() => verLado(lado)}
              onPointerDown={() => premir(lado)} onPointerUp={largar} onPointerLeave={largar}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => escolher(lado)}
              className={`select-none rounded-xl py-2.5 font-bold disabled:opacity-40 ${
                ativo && r.escolhido ? (venda ? "bg-[#F23645] text-white" : "bg-[#089981] text-white")
                  : ativo ? (venda ? "bg-[#F23645]/30 text-rose-100 ring-1 ring-[#F23645]" : "bg-[#089981]/30 text-emerald-100 ring-1 ring-[#089981]")
                    : (venda ? "bg-[#F23645]/15 text-rose-300" : "bg-[#089981]/15 text-emerald-300")
              }`}
            >
              {venda ? "SELL" : "BUY"}<div className="font-mono text-[13px]">{px(venda ? preco?.bid : preco?.ask, s.digits)}</div>
            </button>
          )
        })}
      </div>
      <InterruptorUmClique />
      </div>
      {semPreco && <p className="text-center text-[11px] text-amber-300">Sem preço ao vivo — mercado fechado ou motor parado.</p>}

      {/* O resumo de sempre: o que a ordem arrisca e ganha, em dinheiro E em % do saldo. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-white/[0.03] px-2.5 py-1.5 font-mono text-[10.5px]">
        <Mini k="Risco" v={resumo.risco == null ? "—" : `−${usd(Math.abs(resumo.risco))} $${resumo.riscoPct != null ? ` · ${resumo.riscoPct}%` : ""}`} cor={erros.sl ? "text-rose-300" : "text-rose-200"} />
        <Mini k="Ganho" v={resumo.ganho == null ? "—" : `${resumo.ganho >= 0 ? "+" : ""}${usd(resumo.ganho)} $${resumo.ganhoPct != null ? ` · ${resumo.ganhoPct}%` : ""}`} cor={erros.tp ? "text-rose-300" : "text-emerald-200"} />
        <Mini k="Pips SL/TP" v={`${resumo.pipsSl ?? "—"} / ${resumo.pipsTp ?? "—"}`} />
        <Mini k="R:R" v={resumo.rr ?? "—"} />
        <Mini k="Margem" v={`${usd(resumo.margem)} $`} cor={erros.margem ? "text-rose-300" : undefined} />
        <Mini k="Valor do pip" v={`${usd(resumo.valorPip)} $`} />
      </div>

      {r.escolhido && (
        <div className="space-y-1 rounded-lg border border-white/15 bg-white/5 p-2.5">
          <Linha k="Volume" v={`${volume} lote${volume === 1 ? "" : "s"}${emRisco ? " (pelo risco)" : ""}`} alerta={Boolean(erros.volume)} />
          <Linha k="Entrada" v={`${px(k.entrada, s.digits)}${r.tipo === "mercado" ? " (a mercado)" : ` (${r.lado} ${r.tipo})`}`} />
          <Linha k="Margem necessária" v={`${usd(resumo.margem)} $`} alerta={Boolean(erros.margem) || (props.margemLivre != null && resumo.margem != null && resumo.margem > props.margemLivre)} />
          <Linha k="Comissão" v={`${usd(resumo.comissao)} $`} />
          <Linha k="Valor do pip" v={`${usd(resumo.valorPip)} $`} />
          {k.sl != null && <Linha k="SL" v={`${px(k.sl, s.digits)} · ${resumo.pipsSl} pips · ${usd(resumo.risco)} $${resumo.riscoPct != null ? ` (${resumo.riscoPct}%)` : ""}`} alerta={Boolean(erros.sl)} />}
          {k.tp != null && <Linha k="TP" v={`${px(k.tp, s.digits)} · ${resumo.pipsTp} pips · ${resumo.ganho != null && resumo.ganho >= 0 ? "+" : ""}${usd(resumo.ganho)} $${resumo.ganhoPct != null ? ` (${resumo.ganhoPct}%)` : ""}${resumo.rr ? ` · R:R ${resumo.rr}` : ""}`} alerta={Boolean(erros.tp)} />}
          {k.erroEnvio && <p className="text-[11px] text-rose-300">{k.erroEnvio}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => k.set({ escolhido: false })} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
            <button disabled={k.aEnviar || umClique.ocupado || k.temErros || semPreco} onClick={() => void k.enviar()} className={`flex-[2] rounded-lg py-2 font-bold text-white disabled:opacity-40 ${r.lado === "buy" ? "bg-[#089981]" : "bg-[#F23645]"}`}>
              {k.aEnviar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Confirmar ${r.lado === "buy" ? "compra" : "venda"}${r.tipo === "mercado" ? "" : ` ${r.tipo}`}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const PLACEHOLDER: Record<ModoNiveis, { sl: string; tp: string }> = {
  preco: { sl: "Stop loss", tp: "Take profit" },
  pips: { sl: "SL (pips)", tp: "TP (pips)" },
  usd: { sl: "SL ($ a perder)", tp: "TP ($ a ganhar)" },
  pct: { sl: "SL (% do saldo)", tp: "TP (% do saldo)" },
}

function Segmentos<T extends string>({ opcoes, ativo, onEscolher, rotulo, desactivado }: {
  opcoes: Array<[T, string]>; ativo: T; onEscolher: (v: T) => void; rotulo: string
  /** Motivo (texto) quando a opção não se pode escolher agora; null = pode. */
  desactivado?: (v: T) => string | null
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex gap-0.5 rounded-lg bg-white/5 p-0.5 text-[11px]">
      {opcoes.map(([v, nome]) => {
        const motivo = desactivado?.(v) ?? null
        return (
          <button key={v} type="button" role="radio" aria-checked={ativo === v} disabled={motivo != null} title={motivo ?? undefined} onClick={() => onEscolher(v)}
            className={`min-h-[28px] rounded-md px-2 py-0.5 disabled:cursor-not-allowed disabled:opacity-30 ${ativo === v ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
            {nome}
          </button>
        )
      })}
    </div>
  )
}

function Mini({ k, v, cor }: { k: string; v: string; cor?: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="font-sans text-zinc-500">{k}</span>
      <span className={cor ?? "text-zinc-200"}>{v}</span>
    </div>
  )
}

function Linha({ k, v, alerta }: { k: string; v: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-400">{k}</span>
      <span className={`font-mono ${alerta ? "text-rose-300" : "text-white"}`}>{v}</span>
    </div>
  )
}

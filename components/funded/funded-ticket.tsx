"use client"

import { useEffect, useRef, useState } from "react"
import { Loader2, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react"
import { type Direcao, normalizarVolume, pips } from "@/lib/mtmfunded/simulado/matematica"
import { px, usd } from "./api"
import { useRascunho } from "./rascunho-ordem"

/**
 * O TICKET — comprar/vender com tudo à vista ANTES de confirmar: margem, comissão e valor do pip.
 *
 * As contas são as mesmas do servidor (lib/mtmfunded/simulado/matematica): o que o ticket diz que
 * custa é o que a conta paga. SL/TP por preço ou por pips, porque quem vem de sinais pensa em pips
 * e quem vem do gráfico pensa em preço.
 */

export interface Prefill { direcao?: Direcao; sl?: number | null; tp?: number | null; origem?: string; ideiaRef?: string | null }

/**
 * Ligado nos dois sentidos ao gráfico pelo rascunho (rascunho-ordem.tsx): escrever aqui desenha
 * as linhas; arrastá-las escreve aqui. Passar o rato (ou manter o dedo) em SELL/BUY mostra a
 * ordem desse lado no gráfico; tocar escolhe-o e abre o resumo.
 */
export default function FundedTicket(props: { margemLivre: number | null }) {
  const k = useRascunho()
  const { r, simbolo: s, preco, volume, setVolume, erros, resumo } = k
  const [edicao, setEdicao] = useState<{ campo: "entrada" | "sl" | "tp"; texto: string } | null>(null)
  const segurou = useRef(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const passo = s.volume_step || 0.01
  const mudarVolume = (delta: number) => {
    const v = normalizarVolume(s, Math.max(s.volume_min, Math.round((volume + delta) / passo) * passo))
    if (v != null) setVolume(v)
    k.set({ visivel: true })
  }

  const numero = (t: string) => { const n = Number(String(t).replace(",", ".")); return t.trim() && Number.isFinite(n) && n > 0 ? n : null }

  /** O que o campo mostra quando não se está a escrever nele: o estado, em preço ou em pips. */
  const mostrado = (campo: "entrada" | "sl" | "tp") => {
    if (edicao?.campo === campo) return edicao.texto
    if (campo === "entrada") return r.entrada == null ? "" : px(r.entrada, s.digits)
    const v = campo === "sl" ? k.sl : k.tp
    if (v == null) return ""
    if (r.modoNiveis === "pips" && k.entrada != null) return String(pips(s, k.entrada, v))
    return px(v, s.digits)
  }
  const escrever = (campo: "entrada" | "sl" | "tp", texto: string) => {
    setEdicao({ campo, texto })
    const n = numero(texto)
    if (campo === "entrada") return k.set({ entrada: n, visivel: true })
    if (r.modoNiveis === "pips") k.definirPips(campo, n)
    else k.definirNivel(campo, n)
  }

  // O nível mudou por fora (linha arrastada no gráfico) enquanto o campo tinha texto por escrever:
  // o que está no gráfico ganha — o campo passa a mostrar o valor novo.
  useEffect(() => {
    if (!edicao) return
    const n = numero(edicao.texto)
    const atual = edicao.campo === "entrada" ? r.entrada : edicao.campo === "sl" ? k.sl : k.tp
    if (n == null || atual == null) return
    const comparado = edicao.campo !== "entrada" && r.modoNiveis === "pips" && k.entrada != null ? pips(s, k.entrada, atual) : atual
    if (Math.abs(comparado - n) > (r.modoNiveis === "pips" && edicao.campo !== "entrada" ? 0.05 : Math.pow(10, -s.digits))) setEdicao(null)
  }, [r.entrada, k.sl, k.tp]) // eslint-disable-line react-hooks/exhaustive-deps

  const trocarTipo = (t: "mercado" | "limit" | "stop") => {
    // Uma pendente nova começa no preço de agora: a linha aparece onde se vê e arrasta-se dali.
    if (t === "mercado") return k.set({ tipo: t, entrada: null })
    k.set({ tipo: t, visivel: true, entrada: r.entrada ?? k.entrada ?? null })
  }

  const verLado = (lado: Direcao) => { if (!r.escolhido) k.set({ lado }) }
  const premir = (lado: Direcao) => {
    segurou.current = false
    temporizador.current = setTimeout(() => { segurou.current = true; k.set({ lado, visivel: true }) }, 350)
  }
  const largar = () => { if (temporizador.current) clearTimeout(temporizador.current) }
  const escolher = (lado: Direcao) => {
    if (segurou.current) { segurou.current = false; return }
    k.set({ lado, escolhido: true, visivel: true })
  }

  const semPreco = !preco?.fresco
  const Erro = ({ t }: { t?: string }) => (t ? <p className="text-[11px] text-rose-300">{t}</p> : null)

  return (
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-[#131722] p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-bold text-white">{s.symbol}</p>
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

      <div className="flex items-center gap-2">
        <span className="w-14 text-zinc-400">Volume</span>
        <button onClick={() => mudarVolume(-passo)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5"><Minus className="h-4 w-4" /></button>
        <input
          inputMode="decimal"
          value={volume}
          onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) { setVolume(v); k.set({ visivel: true }) } }}
          onBlur={() => { const v = normalizarVolume(s, volume); setVolume(v ?? s.volume_min) }}
          className={`h-9 w-full rounded-lg border bg-black text-center font-mono text-white ${erros.volume ? "border-rose-500" : "border-white/10"}`}
        />
        <button onClick={() => mudarVolume(passo)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5"><Plus className="h-4 w-4" /></button>
      </div>
      <Erro t={erros.volume} />

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
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
          <button onClick={() => { setEdicao(null); k.set({ modoNiveis: "preco" }) }} className={`rounded-md px-2 py-0.5 ${r.modoNiveis === "preco" ? "bg-white/15 text-white" : "text-zinc-500"}`}>preço</button>
          <button onClick={() => { setEdicao(null); k.set({ modoNiveis: "pips" }) }} className={`rounded-md px-2 py-0.5 ${r.modoNiveis === "pips" ? "bg-white/15 text-white" : "text-zinc-500"}`}>pips</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <input
            inputMode="decimal" aria-label="stop loss" value={mostrado("sl")} onChange={(e) => escrever("sl", e.target.value)} onBlur={() => setEdicao(null)}
            placeholder={r.modoNiveis === "pips" ? "SL (pips)" : "Stop loss"}
            className={`h-9 w-full rounded-lg border bg-black px-2 font-mono text-rose-200 placeholder:text-zinc-600 ${erros.sl ? "border-rose-500 ring-1 ring-rose-500" : "border-rose-500/30"}`}
          />
          {k.sl != null && resumo.pipsSl != null && <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{r.modoNiveis === "pips" ? px(k.sl, s.digits) : `${resumo.pipsSl} pips`} · {usd(resumo.risco)} $</p>}
        </div>
        <div>
          <input
            inputMode="decimal" aria-label="take profit" value={mostrado("tp")} onChange={(e) => escrever("tp", e.target.value)} onBlur={() => setEdicao(null)}
            placeholder={r.modoNiveis === "pips" ? "TP (pips)" : "Take profit"}
            className={`h-9 w-full rounded-lg border bg-black px-2 font-mono text-emerald-200 placeholder:text-zinc-600 ${erros.tp ? "border-rose-500 ring-1 ring-rose-500" : "border-emerald-500/30"}`}
          />
          {k.tp != null && resumo.pipsTp != null && <p className="mt-0.5 font-mono text-[10.5px] text-zinc-500">{r.modoNiveis === "pips" ? px(k.tp, s.digits) : `${resumo.pipsTp} pips`} · {resumo.ganho != null && resumo.ganho >= 0 ? "+" : ""}{usd(resumo.ganho)} $</p>}
        </div>
      </div>
      <Erro t={erros.sl} />
      <Erro t={erros.tp} />
      <Erro t={erros.margem} />

      <div className="grid grid-cols-2 gap-2">
        {(["sell", "buy"] as const).map((lado) => {
          const ativo = r.lado === lado
          const venda = lado === "sell"
          return (
            <button
              key={lado} disabled={semPreco}
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
      {semPreco && <p className="text-center text-[11px] text-amber-300">Sem preço ao vivo — mercado fechado ou motor parado.</p>}

      {r.escolhido && (
        <div className="space-y-1 rounded-lg border border-white/15 bg-white/5 p-2.5">
          <Linha k="Entrada" v={`${px(k.entrada, s.digits)}${r.tipo === "mercado" ? " (a mercado)" : ` (${r.lado} ${r.tipo})`}`} />
          <Linha k="Margem necessária" v={`${usd(resumo.margem)} $`} alerta={Boolean(erros.margem) || (props.margemLivre != null && resumo.margem != null && resumo.margem > props.margemLivre)} />
          <Linha k="Comissão" v={`${usd(resumo.comissao)} $`} />
          <Linha k="Valor do pip" v={`${usd(resumo.valorPip)} $`} />
          {k.sl != null && <Linha k="SL" v={`${px(k.sl, s.digits)} · ${resumo.pipsSl} pips · ${usd(resumo.risco)} $`} alerta={Boolean(erros.sl)} />}
          {k.tp != null && <Linha k="TP" v={`${px(k.tp, s.digits)} · ${resumo.pipsTp} pips · ${resumo.ganho != null && resumo.ganho >= 0 ? "+" : ""}${usd(resumo.ganho)} $${resumo.rr ? ` · R:R ${resumo.rr}` : ""}`} alerta={Boolean(erros.tp)} />}
          {k.erroEnvio && <p className="text-[11px] text-rose-300">{k.erroEnvio}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => k.set({ escolhido: false })} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
            <button disabled={k.aEnviar || k.temErros || semPreco} onClick={() => void k.enviar()} className={`flex-[2] rounded-lg py-2 font-bold text-white disabled:opacity-40 ${r.lado === "buy" ? "bg-[#089981]" : "bg-[#F23645]"}`}>
              {k.aEnviar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Confirmar ${r.lado === "buy" ? "compra" : "venda"}${r.tipo === "mercado" ? "" : ` ${r.tipo}`}`}
            </button>
          </div>
        </div>
      )}
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

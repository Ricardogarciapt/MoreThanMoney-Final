"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, Minus, Plus } from "lucide-react"
import { type Direcao, type MapaPrecos, margemUsd, comissaoUsd, normalizarVolume, validarNiveis, precoDeAbertura, pips } from "@/lib/mtmfunded/simulado/matematica"
import { valorDoPip, validarPendente } from "@/lib/mtmfunded/simulado/ordens"
import { type SimboloFicha, type PrecoVivo, px, usd } from "./api"

/**
 * O TICKET — comprar/vender com tudo à vista ANTES de confirmar: margem, comissão e valor do pip.
 *
 * As contas são as mesmas do servidor (lib/mtmfunded/simulado/matematica): o que o ticket diz que
 * custa é o que a conta paga. SL/TP por preço ou por pips, porque quem vem de sinais pensa em pips
 * e quem vem do gráfico pensa em preço.
 */

export interface Prefill { direcao?: Direcao; sl?: number | null; tp?: number | null; origem?: string; ideiaRef?: string | null }

export default function FundedTicket(props: {
  simbolo: SimboloFicha
  preco?: PrecoVivo
  precos: MapaPrecos
  alavancagem: number
  margemLivre: number | null
  volume: number
  setVolume: (v: number) => void
  prefill?: Prefill | null
  onEnviar: (p: { accao: "abrir" | "pendente"; direcao: Direcao; volume: number; sl: number | null; tp: number | null; tipo?: "limit" | "stop"; preco?: number; expiraEm?: string | null }) => Promise<void>
}) {
  const { simbolo: s, preco, precos, alavancagem, volume, setVolume } = props
  const [modoNiveis, setModoNiveis] = useState<"preco" | "pips">("preco")
  const [sl, setSl] = useState("")
  const [tp, setTp] = useState("")
  const [tipo, setTipo] = useState<"mercado" | "limit" | "stop">("mercado")
  const [precoOrdem, setPrecoOrdem] = useState("")
  const [confirmar, setConfirmar] = useState<Direcao | null>(null)
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    // Pré-preenchido por um alerta do scanner ou uma ideia MTM: níveis por preço, o trader confirma.
    if (!props.prefill) return
    setModoNiveis("preco")
    setSl(props.prefill.sl != null ? String(props.prefill.sl) : "")
    setTp(props.prefill.tp != null ? String(props.prefill.tp) : "")
    if (props.prefill.direcao) setConfirmar(props.prefill.direcao)
  }, [props.prefill])

  useEffect(() => { setErro(null) }, [s.symbol, tipo])

  const passo = s.volume_step || 0.01
  const mudarVolume = (delta: number) => {
    const v = normalizarVolume(s, Math.max(s.volume_min, Math.round((volume + delta) / passo) * passo))
    if (v != null) setVolume(v)
  }

  /** Converte o campo (preço ou pips) num preço absoluto para esta direção. */
  const nivel = (campo: string, qual: "sl" | "tp", direcao: Direcao, entrada: number): number | null => {
    const n = Number(String(campo).replace(",", "."))
    if (!campo || !Number.isFinite(n) || n <= 0) return null
    if (modoNiveis === "preco") return n
    const sinal = (direcao === "buy" ? 1 : -1) * (qual === "sl" ? -1 : 1)
    return Number((entrada + sinal * n * s.pip_size).toFixed(s.digits))
  }

  const resumo = useMemo(() => {
    if (!confirmar || !preco) return null
    const entrada = tipo === "mercado" ? precoDeAbertura(confirmar, preco) : Number(precoOrdem)
    if (!(entrada > 0)) return { erro: "indica o preço da ordem" }
    const vSl = nivel(sl, "sl", confirmar, entrada)
    const vTp = nivel(tp, "tp", confirmar, entrada)
    const erroNiveis = tipo === "mercado"
      ? validarNiveis(confirmar, entrada, vSl, vTp)
      : (() => { const r = validarPendente(s, confirmar, tipo, volume, entrada, vSl, vTp, preco.fresco ? preco : null); return r.ok ? null : r.erro })()
    const mapa = { ...precos, [s.symbol]: preco }
    return {
      entrada, vSl, vTp, erro: erroNiveis,
      margem: margemUsd(s, volume, entrada, alavancagem, mapa),
      comissao: comissaoUsd(s, volume),
      valorPip: valorDoPip(s, volume, entrada, mapa),
    }
  }, [confirmar, preco, tipo, precoOrdem, sl, tp, modoNiveis, volume, precos, alavancagem, s]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async () => {
    if (!confirmar || !resumo || resumo.erro || !("entrada" in resumo)) return
    setAEnviar(true)
    setErro(null)
    try {
      await props.onEnviar(tipo === "mercado"
        ? { accao: "abrir", direcao: confirmar, volume, sl: resumo.vSl ?? null, tp: resumo.vTp ?? null }
        : { accao: "pendente", direcao: confirmar, volume, sl: resumo.vSl ?? null, tp: resumo.vTp ?? null, tipo, preco: resumo.entrada })
      setConfirmar(null)
      setSl(""); setTp("")
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setAEnviar(false)
    }
  }

  const semPreco = !preco?.fresco

  return (
    <div className="space-y-2.5 rounded-xl border border-white/10 bg-[#0d0d0d] p-3 text-[12px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-bold text-white">{s.symbol}</p>
          <p className="text-[10.5px] text-zinc-500">{s.nome ?? ""} · spread {s.spread_pontos} pts</p>
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
          {(["mercado", "limit", "stop"] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)} className={`rounded-md px-2 py-1 ${tipo === t ? "bg-[#D2A63C] text-black" : "text-zinc-400"}`}>
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
          onChange={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) setVolume(v) }}
          onBlur={() => { const v = normalizarVolume(s, volume); setVolume(v ?? s.volume_min) }}
          className="h-9 w-full rounded-lg border border-white/10 bg-black text-center font-mono text-white"
        />
        <button onClick={() => mudarVolume(passo)} className="grid h-9 w-9 place-items-center rounded-lg bg-white/5"><Plus className="h-4 w-4" /></button>
      </div>

      {tipo !== "mercado" && (
        <div className="flex items-center gap-2">
          <span className="w-14 text-zinc-400">Preço</span>
          <input inputMode="decimal" value={precoOrdem} onChange={(e) => setPrecoOrdem(e.target.value)} placeholder={preco ? px(preco.bid, s.digits) : ""} className="h-9 w-full rounded-lg border border-white/10 bg-black px-2 font-mono text-white" />
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="text-zinc-400">SL / TP</span>
        <div className="flex gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
          <button onClick={() => setModoNiveis("preco")} className={`rounded-md px-2 py-0.5 ${modoNiveis === "preco" ? "bg-white/15 text-white" : "text-zinc-500"}`}>preço</button>
          <button onClick={() => setModoNiveis("pips")} className={`rounded-md px-2 py-0.5 ${modoNiveis === "pips" ? "bg-white/15 text-white" : "text-zinc-500"}`}>pips</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder={modoNiveis === "pips" ? "SL (pips)" : "Stop loss"} className="h-9 rounded-lg border border-rose-500/30 bg-black px-2 font-mono text-rose-200 placeholder:text-zinc-600" />
        <input inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder={modoNiveis === "pips" ? "TP (pips)" : "Take profit"} className="h-9 rounded-lg border border-emerald-500/30 bg-black px-2 font-mono text-emerald-200 placeholder:text-zinc-600" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button disabled={semPreco} onClick={() => setConfirmar("sell")} className={`rounded-xl py-2.5 font-bold disabled:opacity-40 ${confirmar === "sell" ? "bg-rose-500 text-white" : "bg-rose-500/15 text-rose-300"}`}>
          SELL<div className="font-mono text-[13px]">{px(preco?.bid, s.digits)}</div>
        </button>
        <button disabled={semPreco} onClick={() => setConfirmar("buy")} className={`rounded-xl py-2.5 font-bold disabled:opacity-40 ${confirmar === "buy" ? "bg-emerald-500 text-black" : "bg-emerald-500/15 text-emerald-300"}`}>
          BUY<div className="font-mono text-[13px]">{px(preco?.ask, s.digits)}</div>
        </button>
      </div>
      {semPreco && <p className="text-center text-[11px] text-amber-300">Sem preço ao vivo — mercado fechado ou motor parado.</p>}

      {confirmar && resumo && (
        <div className="space-y-1 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 p-2.5">
          {"entrada" in resumo && (
            <>
              <Linha k="Entrada" v={`${px(resumo.entrada, s.digits)}${tipo === "mercado" ? " (a mercado)" : ` (${confirmar} ${tipo})`}`} />
              <Linha k="Margem necessária" v={`${usd(resumo.margem ?? null)} $`} alerta={props.margemLivre != null && resumo.margem != null && resumo.margem > props.margemLivre} />
              <Linha k="Comissão" v={`${usd(resumo.comissao ?? null)} $`} />
              <Linha k="Valor do pip" v={`${usd(resumo.valorPip ?? null)} $`} />
              {resumo.vSl != null && <Linha k="SL" v={`${px(resumo.vSl, s.digits)} · ${pips(s, resumo.entrada, resumo.vSl)} pips`} />}
              {resumo.vTp != null && <Linha k="TP" v={`${px(resumo.vTp, s.digits)} · ${pips(s, resumo.entrada, resumo.vTp)} pips`} />}
            </>
          )}
          {resumo.erro && <p className="text-[11px] text-rose-300">{resumo.erro}</p>}
          {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setConfirmar(null)} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
            <button disabled={aEnviar || Boolean(resumo.erro) || semPreco} onClick={enviar} className={`flex-[2] rounded-lg py-2 font-bold text-black disabled:opacity-40 ${confirmar === "buy" ? "bg-emerald-400" : "bg-rose-400"}`}>
              {aEnviar ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : `Confirmar ${confirmar === "buy" ? "compra" : "venda"}`}
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

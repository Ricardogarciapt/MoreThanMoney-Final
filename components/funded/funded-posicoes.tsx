"use client"

import { useState } from "react"
import { Loader2, Pencil, X } from "lucide-react"
import { type MapaPrecos, lucroUsd, precoDeFecho } from "@/lib/mtmfunded/simulado/matematica"
import { type SimboloFicha, px, usd } from "./api"

/**
 * POSIÇÕES, ORDENS E HISTÓRICO — o painel de baixo do MetaTrader, em lista para o telemóvel.
 *
 * O lucro das abertas calcula-se aqui com os preços ao vivo e a MESMA matemática do servidor,
 * para mexer a cada preço sem esperar pelo refresh da conta. Fechar pede o volume: vazio fecha tudo.
 */

type Linha = Record<string, any>

export default function FundedPosicoes(props: {
  vista: "posicoes" | "historico"
  posicoes: Linha[]
  ordens: Linha[]
  historico: Linha[]
  simbolos: Record<string, SimboloFicha>
  precos: MapaPrecos
  podeNegociar: boolean
  onFechar: (id: string, volume: number | null) => Promise<void>
  onModificar: (id: string, sl: number | null, tp: number | null) => Promise<void>
  onCancelar: (id: string) => Promise<void>
  onSelecionarSimbolo: (symbol: string) => void
}) {
  const [aberto, setAberto] = useState<{ id: string; modo: "fechar" | "modificar" } | null>(null)
  const [vol, setVol] = useState("")
  const [sl, setSl] = useState("")
  const [tp, setTp] = useState("")
  const [aEnviar, setAEnviar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const correr = async (f: () => Promise<void>) => {
    setAEnviar(true); setErro(null)
    try { await f(); setAberto(null) } catch (e) { setErro((e as Error).message) } finally { setAEnviar(false) }
  }
  const n = (v: string) => { const x = Number(v.replace(",", ".")); return v && Number.isFinite(x) && x > 0 ? x : null }

  if (props.vista === "historico") {
    return (
      <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-[#0d0d0d]">
        {props.historico.length === 0 && <p className="p-4 text-center text-[12px] text-zinc-500">Ainda sem trades fechadas.</p>}
        {props.historico.map((h) => {
          const d = props.simbolos[h.symbol]?.digits ?? 5
          const liquido = Number(h.pnl ?? 0) + Number(h.swap ?? 0) - Number(h.comissao ?? 0)
          return (
            <div key={h.id} className="grid grid-cols-[1fr_auto] gap-1 px-3 py-2 text-[12px]">
              <div>
                <span className={h.direcao === "buy" ? "text-emerald-400" : "text-rose-400"}>{h.direcao === "buy" ? "BUY" : "SELL"}</span>{" "}
                <b className="text-white">{h.symbol}</b> {Number(h.volume)}
                <div className="text-[10.5px] text-zinc-500">
                  {h.comentario ? <span className="text-[#D2A63C]">{h.comentario} · </span> : null}
                  {px(Number(h.preco_entrada), d)} → {px(Number(h.preco_fecho), d)} · {motivo(h.motivo_fecho)}{h.mae_id ? " · parcial" : ""} · {new Date(h.fechada_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}
                </div>
              </div>
              <div className="text-right">
                <p className={`font-mono font-semibold ${Number(h.pnl) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(Number(h.pnl))}</p>
                <p className="text-[10px] text-zinc-500">líq. {usd(liquido)}</p>
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-[#0d0d0d]">
        <p className="px-3 py-1.5 text-[10px] uppercase text-zinc-500">Posições abertas ({props.posicoes.length})</p>
        {props.posicoes.length === 0 && <p className="p-3 text-center text-[12px] text-zinc-500">Sem posições abertas.</p>}
        {props.posicoes.map((p) => {
          const s = props.simbolos[p.symbol]
          const preco = props.precos[p.symbol]
          const d = s?.digits ?? 5
          const atual = preco ? precoDeFecho(p.direcao, preco) : null
          const pnl = s && atual != null ? lucroUsd(s, p.direcao, Number(p.volume), Number(p.preco_entrada), atual, props.precos) : null
          const esteAberto = aberto?.id === p.id
          return (
            <div key={p.id} className="px-3 py-2 text-[12px]">
              <div className="grid grid-cols-[1fr_auto] gap-1" onClick={() => props.onSelecionarSimbolo(p.symbol)}>
                <div>
                  <span className={p.direcao === "buy" ? "text-emerald-400" : "text-rose-400"}>{p.direcao === "buy" ? "BUY" : "SELL"}</span>{" "}
                  <b className="text-white">{p.symbol}</b> {Number(p.volume)}
                  <div className="text-[10.5px] text-zinc-500">
                    {px(Number(p.preco_entrada), d)} → {px(atual, d)} · SL {p.sl != null ? px(Number(p.sl), d) : "—"} · TP {p.tp != null ? px(Number(p.tp), d) : "—"}
                    {p.comentario
                      ? <span className="text-[#D2A63C]"> · {p.comentario}</span>
                      : p.origem && p.origem !== "manual" ? ` · ${p.origem === "ideia_mtm" ? "ideia MTM" : p.origem}` : ""}
                  </div>
                </div>
                <p className={`self-center font-mono text-[14px] font-semibold ${pnl == null ? "text-zinc-500" : pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(pnl)}</p>
              </div>
              {props.podeNegociar && !esteAberto && (
                <div className="mt-1.5 flex gap-2">
                  <button onClick={() => { setAberto({ id: p.id, modo: "modificar" }); setSl(p.sl ?? ""); setTp(p.tp ?? ""); setErro(null) }} className="flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300"><Pencil className="h-3 w-3" /> SL/TP</button>
                  <button onClick={() => { setAberto({ id: p.id, modo: "fechar" }); setVol(""); setErro(null) }} className="flex items-center gap-1 rounded-md border border-rose-500/30 px-2 py-1 text-[11px] text-rose-300"><X className="h-3 w-3" /> Fechar</button>
                </div>
              )}
              {esteAberto && aberto && (
                <div className="mt-2 space-y-2 rounded-lg border border-white/10 bg-black/40 p-2">
                  {aberto.modo === "fechar" ? (
                    <div className="flex gap-2">
                      <input inputMode="decimal" value={vol} onChange={(e) => setVol(e.target.value)} placeholder={`volume (vazio = tudo ${Number(p.volume)})`} className="h-9 flex-1 rounded-lg border border-white/10 bg-black px-2 font-mono text-white" />
                      <button disabled={aEnviar} onClick={() => correr(() => props.onFechar(p.id, n(vol)))} className="rounded-lg bg-rose-500 px-3 font-bold text-white disabled:opacity-40">
                        {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : n(vol) ? "Fechar parcial" : "Fechar tudo"}
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="SL" className="h-9 rounded-lg border border-rose-500/30 bg-black px-2 font-mono text-white" />
                      <input inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="TP" className="h-9 rounded-lg border border-emerald-500/30 bg-black px-2 font-mono text-white" />
                      <button disabled={aEnviar} onClick={() => correr(() => props.onModificar(p.id, n(String(sl)), n(String(tp))))} className="rounded-lg bg-[#D2A63C] px-3 font-bold text-black disabled:opacity-40">
                        {aEnviar ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                      </button>
                    </div>
                  )}
                  {erro && <p className="text-[11px] text-rose-300">{erro}</p>}
                  <button onClick={() => setAberto(null)} className="text-[11px] text-zinc-500">cancelar</button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="divide-y divide-white/5 rounded-xl border border-white/10 bg-[#0d0d0d]">
        <p className="px-3 py-1.5 text-[10px] uppercase text-zinc-500">Ordens pendentes ({props.ordens.length})</p>
        {props.ordens.length === 0 && <p className="p-3 text-center text-[12px] text-zinc-500">Sem ordens pendentes.</p>}
        {props.ordens.map((o) => {
          const d = props.simbolos[o.symbol]?.digits ?? 5
          return (
            <div key={o.id} className="flex items-center justify-between px-3 py-2 text-[12px]">
              <div onClick={() => props.onSelecionarSimbolo(o.symbol)}>
                <span className={o.direcao === "buy" ? "text-emerald-400" : "text-rose-400"}>{o.direcao.toUpperCase()} {o.tipo.toUpperCase()}</span>{" "}
                <b className="text-white">{o.symbol}</b> {Number(o.volume)} @ {px(Number(o.preco), d)}
                <div className="text-[10.5px] text-zinc-500">SL {o.sl != null ? px(Number(o.sl), d) : "—"} · TP {o.tp != null ? px(Number(o.tp), d) : "—"}{o.expira_em ? ` · expira ${new Date(o.expira_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : ""}</div>
              </div>
              {props.podeNegociar && (
                <button onClick={() => correr(() => props.onCancelar(o.id))} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300">Cancelar</button>
              )}
            </div>
          )
        })}
        {erro && !aberto && <p className="px-3 pb-2 text-[11px] text-rose-300">{erro}</p>}
      </div>
    </div>
  )
}

function motivo(m: string | null) {
  return ({ manual: "manual", sl: "stop loss", tp: "take profit", stop_out: "stop-out", regra_quebrada: "regra quebrada", fim_de_ciclo: "fim de ciclo", estrategia: "saída da estratégia" } as Record<string, string>)[m ?? ""] ?? (m ?? "—")
}

"use client"

import { ChevronDown, Layers, Plus, X } from "lucide-react"
import { volumeDaParte } from "@/lib/mtmfunded/simulado/avancadas"
import { px } from "./api"
import { numeroDe } from "./avancado"
import { useRascunho } from "./rascunho-ordem"

/**
 * ORDENS AVANÇADAS NO TICKET — o bloco «Avançado», fechado por defeito (no telemóvel não se quer
 * ruído; quem precisa abre uma vez e fica aberto).
 *
 *  · Bracket com TPs parciais: TP1/TP2/TP3, cada um com % do volume — o que sobra fecha no TP normal;
 *  · Trailing stop em pips, preço ou $ (a distância converte-se em preço antes de enviar);
 *  · Break-even automático: a +X pips, ou quando o TP1 é atingido, com offset;
 *  · Expiração (GTD) e OCO — só para pendentes.
 * Tudo é executado pelo motor do VPS a cada preço (services/funded-motor/avaliacao.ts).
 */
export default function OrdensAvancadas() {
  const k = useRascunho()
  const { avancado: a, setAvancado, simbolo: s, r } = k
  const pendente = r.tipo !== "mercado"
  const ativos = [
    a.tps.some((t) => numeroDe(t.valor) != null) && `${a.tps.length} TP`,
    a.trailing.ligado && "trailing",
    a.be.ligado && "BE",
    pendente && a.expira && "GTD",
    pendente && a.oco.ligado && "OCO",
  ].filter(Boolean) as string[]

  const campo = "h-8 w-full rounded-md border border-white/10 bg-black px-2 font-mono text-[12px] text-white placeholder:text-zinc-600"
  const chip = (on: boolean) => `rounded-md px-2 py-0.5 text-[11px] ${on ? "bg-white/15 text-white" : "text-zinc-500 hover:text-zinc-300"}`

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02]">
      <button
        type="button" onClick={() => setAvancado({ aberto: !a.aberto })} aria-expanded={a.aberto}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] text-zinc-300"
      >
        <Layers className="h-3.5 w-3.5 text-[#D2A63C]" /> Avançado
        {ativos.length > 0 && <span className="ml-1 truncate text-[10.5px] text-[#D2A63C]">{ativos.join(" · ")}</span>}
        <ChevronDown className={`ml-auto h-4 w-4 transition ${a.aberto ? "rotate-180" : ""}`} />
      </button>

      {a.aberto && (
        <div className="space-y-3 border-t border-white/10 p-2.5 text-[11.5px]">
          {/* ── TPs parciais ── */}
          <section className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400">Take-profits parciais</span>
              <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
                {(["pips", "preco"] as const).map((m) => (
                  <button key={m} type="button" onClick={() => setAvancado({ tpsModo: m })} className={chip(a.tpsModo === m)}>{m === "pips" ? "Pips" : "Preço"}</button>
                ))}
              </div>
            </div>
            {a.tps.map((t, i) => {
              const pct = numeroDe(t.pct)
              const lotes = pct != null ? volumeDaParte(s, k.volume, pct) : null
              const nivel = numeroDe(t.valor)
              const preco = nivel == null || k.entrada == null ? null : a.tpsModo === "preco" ? nivel : k.entrada + (r.lado === "buy" ? 1 : -1) * nivel * s.pip_size
              return (
                <div key={i} className="grid grid-cols-[2.2rem_1fr_4.2rem_auto] items-center gap-1.5">
                  <span className="font-semibold text-emerald-300">TP{i + 1}</span>
                  <input inputMode="decimal" aria-label={`TP${i + 1} ${a.tpsModo}`} value={t.valor} placeholder={a.tpsModo === "pips" ? "pips" : "preço"}
                    onChange={(e) => setAvancado({ tps: a.tps.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)) })} className={campo} />
                  <div className="relative">
                    <input inputMode="decimal" aria-label={`TP${i + 1} percentagem`} value={t.pct} placeholder="%"
                      onChange={(e) => setAvancado({ tps: a.tps.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)) })} className={`${campo} pr-5`} />
                    <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500">%</span>
                  </div>
                  <button type="button" aria-label={`remover TP${i + 1}`} onClick={() => setAvancado({ tps: a.tps.filter((_, j) => j !== i) })} className="text-zinc-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                  <span />
                  <span className="col-span-3 -mt-1 font-mono text-[10px] text-zinc-500">
                    {preco != null ? `@ ${px(preco, s.digits)}` : ""}{lotes != null ? ` · ${lotes} lote` : pct != null ? " · abaixo do lote mínimo" : ""}
                  </span>
                </div>
              )
            })}
            {a.tps.length < 3 && (
              <button type="button" onClick={() => setAvancado({ tps: [...a.tps, { valor: "", pct: a.tps.length === 0 ? "50" : "25" }] })}
                className="flex items-center gap-1 text-[11px] text-[#D2A63C]"><Plus className="h-3 w-3" /> TP{a.tps.length + 1}</button>
            )}
            {a.tps.length > 0 && <p className="text-[10px] text-zinc-500">As % são do volume inicial. O que sobrar fecha no TP normal (ou fica aberto sem TP).</p>}
          </section>

          {/* ── Trailing ── */}
          <section className="space-y-1.5">
            <Interruptor rotulo="Trailing stop" ligado={a.trailing.ligado} onMudar={(v) => setAvancado({ trailing: { ...a.trailing, ligado: v } })} />
            {a.trailing.ligado && (
              <div className="grid grid-cols-[1fr_auto] gap-1.5">
                <input inputMode="decimal" aria-label="distância do trailing" value={a.trailing.valor} placeholder="distância"
                  onChange={(e) => setAvancado({ trailing: { ...a.trailing, valor: e.target.value } })} className={campo} />
                <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
                  {(["pips", "preco", "usd"] as const).map((u) => (
                    <button key={u} type="button" onClick={() => setAvancado({ trailing: { ...a.trailing, unidade: u } })} className={chip(a.trailing.unidade === u)}>{u === "pips" ? "Pips" : u === "preco" ? "Preço" : "$"}</button>
                  ))}
                </div>
                <input inputMode="decimal" aria-label="ativação do trailing em pips" value={a.trailing.ativacaoPips} placeholder="começa a +X pips (opcional)"
                  onChange={(e) => setAvancado({ trailing: { ...a.trailing, ativacaoPips: e.target.value } })} className={`${campo} col-span-2`} />
              </div>
            )}
          </section>

          {/* ── Break-even ── */}
          <section className="space-y-1.5">
            <Interruptor rotulo="Break-even automático" ligado={a.be.ligado} onMudar={(v) => setAvancado({ be: { ...a.be, ligado: v } })} />
            {a.be.ligado && (
              <div className="grid grid-cols-2 gap-1.5">
                <input inputMode="decimal" aria-label="gatilho do break-even em pips" value={a.be.gatilhoPips} placeholder="a +X pips" disabled={a.be.noTp1 && !a.be.gatilhoPips}
                  onChange={(e) => setAvancado({ be: { ...a.be, gatilhoPips: e.target.value } })} className={campo} />
                <input inputMode="decimal" aria-label="offset do break-even em pips" value={a.be.offsetPips} placeholder="offset pips"
                  onChange={(e) => setAvancado({ be: { ...a.be, offsetPips: e.target.value } })} className={campo} />
                <label className="col-span-2 flex items-center gap-1.5 text-zinc-300">
                  <input type="checkbox" checked={a.be.noTp1} onChange={(e) => setAvancado({ be: { ...a.be, noTp1: e.target.checked } })} className="h-3.5 w-3.5 accent-[#D2A63C]" />
                  Quando o TP1 for atingido
                </label>
              </div>
            )}
          </section>

          {/* ── Só pendentes ── */}
          <section className={`space-y-1.5 ${pendente ? "" : "opacity-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-zinc-400">Expira (GTD)</span>
              <input type="datetime-local" aria-label="expiração da ordem" disabled={!pendente} value={a.expira}
                onChange={(e) => setAvancado({ expira: e.target.value })} className="h-8 rounded-md border border-white/10 bg-black px-2 text-[11.5px] text-white [color-scheme:dark]" />
            </div>
            <Interruptor rotulo="OCO — uma cancela a outra" ligado={a.oco.ligado} desativado={!pendente} onMudar={(v) => setAvancado({ oco: { ...a.oco, ligado: v } })} />
            {pendente && a.oco.ligado && (
              <div className="grid grid-cols-[auto_1fr] gap-1.5">
                <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
                  {(["buy", "sell"] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setAvancado({ oco: { ...a.oco, direcao: d } })}
                      className={`rounded-md px-2 py-0.5 text-[11px] ${a.oco.direcao === d ? (d === "buy" ? "bg-[#089981] text-white" : "bg-[#F23645] text-white") : "text-zinc-500"}`}>{d === "buy" ? "Buy" : "Sell"}</button>
                  ))}
                </div>
                <input inputMode="decimal" aria-label="preço da segunda perna OCO" value={a.oco.preco} placeholder="preço da 2.ª perna"
                  onChange={(e) => setAvancado({ oco: { ...a.oco, preco: e.target.value } })} className={campo} />
                <p className="col-span-2 text-[10px] text-zinc-500">Mesmo volume; SL/TP à mesma distância. Limit ou stop decide-se pelo lado do preço.</p>
              </div>
            )}
            {!pendente && <p className="text-[10px] text-zinc-500">Escolhe Limit ou Stop para usar expiração e OCO.</p>}
          </section>

          {k.erros.avancado && <p className="text-[11px] text-rose-300">{k.erros.avancado}</p>}
        </div>
      )}
    </div>
  )
}

function Interruptor({ rotulo, ligado, onMudar, desativado }: { rotulo: string; ligado: boolean; onMudar: (v: boolean) => void; desativado?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-400">{rotulo}</span>
      <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo} disabled={desativado} onClick={() => onMudar(!ligado)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${ligado ? "bg-[#D2A63C]" : "bg-white/15"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  )
}

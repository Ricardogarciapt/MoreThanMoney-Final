"use client"

// `React` em âmbito: o teste desenha a caixa com `npx tsx` (JSX clássico), sem o compilador do Next.
import React, { useEffect, useRef, useState } from "react"
import { Minus, Plus } from "lucide-react"

/**
 * A caixa do lote da barra VENDER | lotes | COMPRAR: − e + mudam um passo, e um toque no número
 * abre o teclado para o escrever (como no TradeLocker e no MT5). Aceita vírgula ou ponto.
 *
 * O número só vale quando sai do campo (Enter, «OK» do teclado ou tocar fora): enquanto se escreve
 * «0,» ou «1.» não se muda o volume da conta. Um valor fora das regras do símbolo (mínimo, máximo,
 * passo) volta ao anterior e a caixa pisca a vermelho, em vez de arredondar sem dizer nada.
 */
export function lerLote(texto: string): number | null {
  const t = texto.trim().replace(",", ".")
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function LoteEditavel({ volume, passo, normalizar, onMudar, simbolo }: {
  volume: number
  passo: number
  /** As regras do símbolo: o volume aceite (arredondado ao passo) ou null se não der. */
  normalizar: (v: number) => number | null
  onMudar: (v: number) => void
  simbolo: string
}) {
  const [texto, setTexto] = useState(String(volume))
  const [editar, setEditar] = useState(false)
  const [erro, setErro] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!editar) setTexto(String(volume)) }, [volume, editar])
  useEffect(() => { if (!erro) return; const id = setTimeout(() => setErro(false), 900); return () => clearTimeout(id) }, [erro])

  const confirmar = () => {
    setEditar(false)
    const lido = lerLote(texto)
    const v = lido == null ? null : normalizar(lido)
    if (v == null) { setErro(true); setTexto(String(volume)); return }
    setTexto(String(v))
    if (v !== volume) onMudar(v)
  }
  const passoDe = (d: number) => {
    const v = normalizar(Math.round((volume + d) / passo) * passo)
    if (v != null) onMudar(v)
  }

  return (
    <div className={`flex items-center rounded-xl border bg-white/[0.03] transition-colors ${erro ? "border-rose-500" : editar ? "border-[#D2A63C]" : "border-white/15"}`}>
      <button type="button" onClick={() => passoDe(-passo)} aria-label="menos volume" className="grid h-12 w-11 shrink-0 place-items-center text-zinc-300 active:text-white"><Minus className="h-5 w-5" /></button>
      <label className="flex min-w-[4.5rem] flex-1 flex-col items-center leading-none">
        <input
          ref={campo}
          value={texto}
          inputMode="decimal"
          enterKeyHint="done"
          autoComplete="off"
          aria-label={`volume em lotes de ${simbolo}`}
          aria-invalid={erro || undefined}
          onFocus={(e) => { setEditar(true); e.currentTarget.select() }}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Enter") campo.current?.blur()
            if (e.key === "Escape") { setTexto(String(volume)); setEditar(false); campo.current?.blur() }
          }}
          className="w-full bg-transparent text-center font-mono text-[17px] font-semibold text-white outline-none"
        />
        <span className="mt-0.5 text-[10.5px] text-zinc-500">lotes</span>
      </label>
      <button type="button" onClick={() => passoDe(passo)} aria-label="mais volume" className="grid h-12 w-11 shrink-0 place-items-center text-zinc-300 active:text-white"><Plus className="h-5 w-5" /></button>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import type { PainelTrader } from "./trader-contexto"

/**
 * O PAINEL DE BAIXO (PRO) — a barra de separadores e o painel escolhido, seja qual for a conta.
 *
 * Não sabe o que são posições, diários ou regras: recebe a lista de painéis que a conta tem
 * (`PainelTrader[]`) e arruma-os. Uma conta MTM Funded traz sete; uma conta real da corretora traz
 * três — e é por isso que lá não aparece um separador «Diário» vazio.
 *
 * O separador escolhido fica guardado POR TIPO de conta (`chaveGuardar`): a simulada e a real não
 * se pisam uma à outra, e um valor velho que já não existe volta ao primeiro em vez de deixar o
 * painel em branco.
 */

export default function PainelInferior({ paineis, denso = true, chaveGuardar }: { paineis: PainelTrader[]; denso?: boolean; chaveGuardar: string }) {
  const [sep, setSep] = useState<string>(() => paineis[0]?.chave ?? "")
  const paineisRef = useRef(paineis)
  paineisRef.current = paineis
  useEffect(() => {
    try {
      const v = localStorage.getItem(chaveGuardar)
      if (v && paineisRef.current.some((p) => p.chave === v)) setSep(v)
    } catch { /* ok */ }
  }, [chaveGuardar])
  const escolher = (s: string) => { setSep(s); try { localStorage.setItem(chaveGuardar, s) } catch { /* ok */ } }

  const activo = paineis.find((p) => p.chave === sep) ?? paineis[0]
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#131722]">
      <div role="tablist" aria-label="Painel da conta" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-[#2A2E39] px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {paineis.map(({ chave, nome, icone: Icone, contagem }) => (
          <button key={chave} role="tab" aria-selected={activo?.chave === chave} onClick={() => escolher(chave)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-[12px] ${activo?.chave === chave ? "border-[#D2A63C] text-white" : "border-transparent text-zinc-400 hover:text-zinc-200"}`}>
            <Icone className="h-3.5 w-3.5" /> {nome}{contagem ? <span className="rounded bg-white/10 px-1 text-[10px]">{contagem}</span> : null}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#363A45_transparent]">
        {activo?.conteudo({ irPara: escolher, denso, fechar: () => {} })}
      </div>
    </div>
  )
}

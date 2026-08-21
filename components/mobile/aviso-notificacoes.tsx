"use client"

import { useEffect, useState } from "react"
import { Bell, X } from "lucide-react"

/**
 * Aviso único da mudança de 2026-08-21: as notificações passaram a ser "só o que segues".
 *
 * Aparece uma vez por dispositivo e desaparece para sempre depois de lido. Não bloqueia a app
 * — quem só quer usar fecha e segue. A alternativa (mudar em silêncio o que 87 pessoas
 * recebem) deixava-as a achar que a app se tinha estragado.
 */
const CHAVE = "mtm_aviso_notificacoes_2026_08"

export default function AvisoNotificacoes({ onAbrirDefinicoes }: { onAbrirDefinicoes?: () => void }) {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) !== "1") {
        // Pequeno atraso: o cliente entra para ver alguma coisa, não para ler um aviso.
        const id = setTimeout(() => setVisivel(true), 1200)
        return () => clearTimeout(id)
      }
    } catch {
      /* sem localStorage: não insiste */
    }
  }, [])

  const fechar = () => {
    try { localStorage.setItem(CHAVE, "1") } catch { /* ignora */ }
    setVisivel(false)
  }

  if (!visivel) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 backdrop-blur-sm p-4" onClick={fechar}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#D2A63C]/15 border border-[#D2A63C]/30 flex items-center justify-center">
              <Bell className="w-4.5 h-4.5 text-[#D2A63C]" />
            </div>
            <h3 className="text-[16px] font-bold text-white leading-tight">Menos ruído,<br />o que interessa</h3>
          </div>
          <button onClick={fechar} aria-label="Fechar" className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10">
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>

        <p className="text-[13px] leading-relaxed text-gray-300">
          Estavas a receber tudo: cada mensagem de cada canal e cada atualização de cada trade.
          Eram dezenas por dia — e o aviso que te importava ficava enterrado no meio.
        </p>
        <p className="text-[13px] leading-relaxed text-gray-300 mt-2.5">
          A partir de hoje chega-te só o essencial:
        </p>
        <ul className="mt-2 mb-3 flex flex-col gap-1.5">
          {[
            ["⚡", "Sinais que podes aceitar num toque"],
            ["🔴", "Sessões ao vivo, quando começam"],
            ["₿", "Oportunidades de DCA no portefólio"],
          ].map(([emoji, texto]) => (
            <li key={texto} className="flex items-start gap-2 text-[13px] text-gray-200">
              <span className="mt-0.5">{emoji}</span>
              <span>{texto}</span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] leading-relaxed text-gray-500">
          Não perdeste nada — o resto continua no chat e nos alertas, como sempre. Se quiseres
          voltar a ser avisado de algum, ligas nas Definições, categoria a categoria.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={fechar}
            className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-[13px] font-medium text-zinc-300 active:scale-95"
          >
            Está bem assim
          </button>
          <button
            onClick={() => { fechar(); onAbrirDefinicoes?.() }}
            className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-[13px] font-bold text-black active:scale-95"
          >
            Escolher o que recebo
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

/** As peças pequenas que os quatro ecrãs do Marketing partilham. */
export const entrada = 'w-full rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none'

export function BotaoCopiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      title="Copiar"
      onClick={async () => {
        try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1500) } catch { /* sem permissão de cópia */ }
      }}
      className="text-zinc-600 hover:text-[#E9C46A]"
    >
      {ok ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  )
}

export function Alertas({ alertas, excessos }: { alertas?: string[]; excessos?: string[] }) {
  if (!alertas?.length && !excessos?.length) return null
  return (
    <div className="flex flex-wrap gap-1">
      {excessos?.map((e) => <span key={e} className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-200">passa do limite: {e}</span>)}
      {alertas?.map((a) => <span key={a} className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">{a}</span>)}
    </div>
  )
}

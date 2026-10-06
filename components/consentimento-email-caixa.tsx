"use client"

/**
 * A caixa «lembretes e novidades por email» do checkout e do marketplace (06/10, F4).
 *
 * Opcional e DESMARCADA por omissão (RGPD — `CAIXA_PRE_MARCADA = false`). O texto é o mesmo que
 * fica gravado como prova (`TEXTO_CAIXA_CHECKOUT`): o que a pessoa leu é o que ela aceitou.
 */
import { TEXTO_CAIXA_CHECKOUT } from "@/lib/captacao-consentimento"

export function CaixaConsentimentoEmail({
  marcada,
  onMudar,
  className = "",
}: {
  marcada: boolean
  onMudar: (v: boolean) => void
  className?: string
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-left text-xs leading-snug text-gray-400 ${className}`}>
      <input
        type="checkbox"
        checked={marcada}
        onChange={(e) => onMudar(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[#D2A63C]"
      />
      <span>{TEXTO_CAIXA_CHECKOUT}</span>
    </label>
  )
}

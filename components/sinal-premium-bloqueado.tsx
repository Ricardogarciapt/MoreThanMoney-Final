"use client"

import { Lock } from "lucide-react"

/**
 * O lugar do sinal num alerta pago, para quem não tem direito a ele.
 *
 * A API já não manda entrada, stop nem alvos (lib/direito-sinais); isto só evita que o cartão
 * mostre uma fila de «—» sem explicar porquê. No iOS nativo não se abre o Stripe (regra da Apple):
 * aponta-se para a subscrição dentro da app, como em lms-playlist-section.
 */
export function SinalPremiumBloqueado({ compacto = false }: { compacto?: boolean }) {
  const abrirUpgrade = () => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
    if (/MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)) {
      alert("Faz upgrade da tua subscrição em Mais → Subscrição.")
      return
    }
    window.location.href = "/upgrade"
  }
  return (
    <div
      className={`mt-2 rounded-lg border border-[#D2A63C]/30 bg-[#D2A63C]/5 ${compacto ? "p-2 text-[11px]" : "p-3 text-sm"}`}
    >
      <p className="flex items-center gap-1.5 font-semibold text-[#D2A63C]">
        <Lock className={compacto ? "h-3 w-3" : "h-4 w-4"} /> Sinal exclusivo Premium
      </p>
      <p className="mt-1 text-gray-400">
        Direção, entrada, stop e alvos deste scanner são para membros Premium e VIP.
      </p>
      <button
        type="button"
        onClick={abrirUpgrade}
        className="mt-2 rounded-full bg-[#D2A63C] px-3 py-1 text-[11px] font-bold text-black"
      >
        Passar a Premium
      </button>
    </div>
  )
}

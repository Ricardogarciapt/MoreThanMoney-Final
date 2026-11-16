"use client"

import type { ReactNode } from "react"
import { Languages } from "lucide-react"
import { useTraducaoChat } from "@/lib/use-traducao-chat"
import { useT } from "@/components/i18n-provider"

/**
 * Mostra uma mensagem/publicação no idioma de quem lê, com «Ver original» por baixo quando foi
 * traduzida. `render` recebe o texto final (para manter MentionText / RichPostText).
 */
export function TextoTraduzido({ texto, render }: { texto: string; render: (texto: string) => ReactNode }) {
  const t = useT()
  const tr = useTraducaoChat(texto)
  return (
    // notranslate: o texto já vem no idioma certo; o Google Tradutor do browser por cima traduzia a dobrar.
    <div className="notranslate" translate="no">
      {render(tr.texto)}
      {tr.traduzido && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            tr.alternar()
          }}
          className="mt-1 flex items-center gap-1 text-[10.5px] text-gray-500 hover:text-[#D2A63C]"
        >
          <Languages className="h-3 w-3" />
          {tr.verOriginal ? t("chatTr.seeTranslation") : t("chatTr.seeOriginal")}
        </button>
      )}
    </div>
  )
}

"use client"

import { useTraducaoChat } from "@/lib/use-traducao-chat"

/**
 * Texto que vem da base de dados (ou ainda fixo em PT) mostrado no idioma de quem lê, sem o botão
 * «Ver original» — para títulos, descrições de canais, perguntas do Mentor, etiquetas curtas.
 * Usa a mesma tradução em cache do chat (`chat_traducoes`): cada texto é traduzido uma vez por
 * idioma, e quem lê em PT não faz pedido nenhum. Nomes de produtos/scanners nunca se traduzem.
 */
export function TextoAuto({ texto, className }: { texto: string | null | undefined; className?: string }) {
  const tr = useTraducaoChat(texto)
  return (
    <span className={`notranslate ${className ?? ""}`.trim()} translate="no">
      {tr.texto}
    </span>
  )
}

/** Versão em hook, para quando o texto vai para um atributo (aria-label, placeholder…). */
export function useTextoAuto(texto: string | null | undefined): string {
  return useTraducaoChat(texto).texto
}

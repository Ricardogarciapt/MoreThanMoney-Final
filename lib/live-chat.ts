import type { KeyboardEvent } from "react"

/**
 * Enter = nova linha (comportamento default do textarea). O envio faz-se pelo botão.
 * Atalho opcional para quem escreve em teclado físico: Cmd/Ctrl+Enter envia.
 */
export function handleLiveChatEnterKey(
  e: KeyboardEvent<HTMLTextAreaElement>,
  send: () => void,
  options?: { disabled?: boolean }
) {
  if (e.key !== "Enter") return
  // Enter (com ou sem Shift) → deixa inserir nova linha; só Cmd/Ctrl+Enter envia.
  if (!e.metaKey && !e.ctrlKey) return
  e.preventDefault()
  if (options?.disabled) return
  send()
}

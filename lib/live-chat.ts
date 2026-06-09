import type { KeyboardEvent } from "react"

/** Enter envia; Shift+Enter mantém nova linha no textarea. */
export function handleLiveChatEnterKey(
  e: KeyboardEvent<HTMLTextAreaElement>,
  send: () => void,
  options?: { disabled?: boolean }
) {
  if (e.key !== "Enter" || e.shiftKey) return
  e.preventDefault()
  if (options?.disabled) return
  send()
}

"use client"

interface SalesPopupProps {
  delay?: number
  showOnExit?: boolean
}

export default function SalesPopup({ delay = 45000, showOnExit = true }: SalesPopupProps) {
  // Retorna null para que o popup nunca seja exibido
  return null
}

import FreeSessionHub from "@/components/live/free-session-hub"

export const dynamic = "force-dynamic"
export const metadata = {
  title: "Sessões Gratuitas — MoreThanMoney",
  description: "Sessões ao vivo abertas a todos, com legendas traduzidas e dobragem na voz do educador.",
}

// Página PÚBLICA (sem login) — sessões ao vivo com plano de acesso "Free".
export default function FreeSessionPage() {
  return <FreeSessionHub />
}

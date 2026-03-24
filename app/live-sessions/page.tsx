import ProtectedPage from "@/components/protected-page"
import LiveSessionsLobby from "@/components/live/live-sessions-lobby"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default function LiveSessionsPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso às live sessions...">
      <LiveSessionsShell
        title="Lobby ao vivo"
        subtitle="Marketplace de especialistas — escolhe tema, educador e entra na sala. Academias MTM: Academia, Cripto, Forex, Social Media, Imobiliário, Fitness e Mindset."
      >
        <LiveSessionsLobby />
      </LiveSessionsShell>
    </ProtectedPage>
  )
}

import ProtectedPage from "@/components/protected-page"
import LiveSessionsLobby from "@/components/live/live-sessions-lobby"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default function LiveSessionsPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso às live sessions...">
      <LiveSessionsShell
        title="Lobby ao vivo"
        subtitle="Aulas em direto com os especialistas MTM."
      >
        <LiveSessionsLobby />
      </LiveSessionsShell>
    </ProtectedPage>
  )
}

import ProtectedPage from "@/components/protected-page"
import LiveSessionsLobby from "@/components/live/live-sessions-lobby"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default function LivePage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/live" loadingMessage="A validar acesso às transmissões...">
      <LiveSessionsShell
        title="Ao vivo"
        subtitle="Mesmo lobby que /live-sessions — todas as salas e educadores."
      >
        <LiveSessionsLobby />
      </LiveSessionsShell>
    </ProtectedPage>
  )
}

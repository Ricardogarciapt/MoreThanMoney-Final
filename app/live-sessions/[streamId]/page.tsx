import ProtectedPage from "@/components/protected-page"
import LiveStreamRoom from "@/components/live/live-stream-room"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default async function LiveSessionChannelPage({
  params,
}: {
  params: Promise<{ streamId: string }>
}) {
  const { streamId } = await params

  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso ao canal...">
      <LiveSessionsShell
        title="Sala ao vivo"
        subtitle="Vídeo, chat e aviso legal quando a sessão está em direto."
      >
        <LiveStreamRoom streamId={streamId} />
      </LiveSessionsShell>
    </ProtectedPage>
  )
}

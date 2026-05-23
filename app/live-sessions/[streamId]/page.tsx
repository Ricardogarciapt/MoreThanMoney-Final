import ProtectedPage from "@/components/protected-page"
import LiveSessionChannelContent from "@/components/live/live-session-channel-content"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default async function LiveSessionChannelPage({
  params,
}: {
  params: Promise<{ streamId: string }>
}) {
  const { streamId } = await params

  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso ao canal...">
      <LiveSessionsShell title="Sala ao vivo">
        <LiveSessionChannelContent streamId={streamId} />
      </LiveSessionsShell>
    </ProtectedPage>
  )
}

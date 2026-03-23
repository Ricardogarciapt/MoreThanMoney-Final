import ProtectedPage from "@/components/protected-page"
import LiveStreamRoom from "@/components/live/live-stream-room"

export default async function LiveSessionChannelPage({
  params,
}: {
  params: Promise<{ streamId: string }>
}) {
  const { streamId } = await params

  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso ao canal...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-7xl mx-auto">
          <LiveStreamRoom streamId={streamId} />
        </div>
      </main>
    </ProtectedPage>
  )
}


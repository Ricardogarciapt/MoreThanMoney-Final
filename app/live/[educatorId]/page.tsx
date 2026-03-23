"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import ProtectedPage from "@/components/protected-page"
import LiveStreamRoom from "@/components/live/live-stream-room"

export default function LiveByEducatorPage() {
  const params = useParams<{ educatorId: string }>()
  const educatorId = params?.educatorId || ""
  const [streamId, setStreamId] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!educatorId) return
    const load = async () => {
      const res = await fetch(`/api/live-sessions/streams?educatorId=${educatorId}&live=true`).then((r) => r.json())
      const first = (res.data || [])[0]
      if (first?.id) setStreamId(first.id)
      setLoading(false)
    }
    load()
  }, [educatorId])

  return (
    <ProtectedPage redirectPath="/login?redirect=/live" loadingMessage="A validar acesso ao canal...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-7xl mx-auto">
          {loading && <p className="text-gray-300">A carregar canal...</p>}
          {!loading && !streamId && <p className="text-gray-400">Este educador não está live neste momento.</p>}
          {!loading && !!streamId && <LiveStreamRoom streamId={streamId} />}
        </div>
      </main>
    </ProtectedPage>
  )
}


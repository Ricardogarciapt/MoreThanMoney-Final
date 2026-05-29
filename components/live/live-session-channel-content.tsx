"use client"

import { useEffect, useState } from "react"
import LiveStreamRoom from "@/components/live/live-stream-room"
import EducatorRatingsSection from "@/components/live/educator-ratings-section"

export default function LiveSessionChannelContent({ streamId }: { streamId: string }) {
  const [educatorId, setEducatorId] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/live-sessions/streams/${streamId}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((res) => {
        const id = res?.data?.educator?.id
        if (id) setEducatorId(String(id))
      })
      .catch(() => setEducatorId(null))
  }, [streamId])

  return (
    <div className="space-y-6">
      <LiveStreamRoom streamId={streamId} />
      {educatorId && (
        <EducatorRatingsSection educatorId={educatorId} streamId={streamId} variant="channel" />
      )}
    </div>
  )
}

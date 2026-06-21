"use client"

import { useEffect, useRef, useState } from "react"
import { getOrCreateLmsViewerKey } from "@/lib/lms-viewer-presence"
import { notifyXpFromResponse } from "@/lib/xp-client"

const PING_MS = 12_000

export type LmsViewerHeartbeatResult = {
  viewer_count: number
  is_live?: boolean
}

/**
 * Regista presença do espectador na sala (heartbeat) para o contador no studio do educador.
 * Devolve viewer_count actualizado a cada ping.
 */
export function useLmsViewerHeartbeat(
  streamId: string | null | undefined,
  enabled = true,
): { viewerCount: number } {
  const viewerKeyRef = useRef<string>("")
  const [viewerCount, setViewerCount] = useState(0)

  useEffect(() => {
    if (!enabled || !streamId) {
      setViewerCount(0)
      return
    }

    if (!viewerKeyRef.current) {
      viewerKeyRef.current = getOrCreateLmsViewerKey()
    }
    const viewerKey = viewerKeyRef.current
    if (!viewerKey) return

    let cancelled = false

    const ping = async (action: "ping" | "leave" = "ping") => {
      if (cancelled && action === "ping") return
      try {
        const res = await fetch(`/api/live-sessions/streams/${streamId}/viewers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          keepalive: action === "leave",
          body: JSON.stringify({ action, viewerKey }),
        })
        if (!res.ok || action === "leave") return
        const data = await res.json().catch(() => null)
        if (cancelled || !data) return
        if (typeof data.viewer_count === "number") {
          setViewerCount(data.viewer_count)
        }
        if (data.xp) {
          void notifyXpFromResponse(data.xp)
        }
      } catch {
        // silencioso — presença é best-effort
      }
    }

    void ping("ping")
    const interval = window.setInterval(() => void ping("ping"), PING_MS)

    const onLeave = () => {
      void ping("leave")
    }
    window.addEventListener("pagehide", onLeave)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener("pagehide", onLeave)
      void ping("leave")
      setViewerCount(0)
    }
  }, [streamId, enabled])

  return { viewerCount }
}

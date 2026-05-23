"use client"

import { useEffect, useRef } from "react"
import { getOrCreateLmsViewerKey } from "@/lib/lms-viewer-presence"

const PING_MS = 12_000

/**
 * Regista presença do espectador na sala (heartbeat) para o contador no studio do educador.
 */
export function useLmsViewerHeartbeat(streamId: string | null | undefined, enabled = true) {
  const viewerKeyRef = useRef<string>("")

  useEffect(() => {
    if (!enabled || !streamId) return

    if (!viewerKeyRef.current) {
      viewerKeyRef.current = getOrCreateLmsViewerKey()
    }
    const viewerKey = viewerKeyRef.current
    if (!viewerKey) return

    let cancelled = false

    const ping = async (action: "ping" | "leave" = "ping") => {
      if (cancelled && action === "ping") return
      try {
        await fetch(`/api/live-sessions/streams/${streamId}/viewers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          keepalive: action === "leave",
          body: JSON.stringify({ action, viewerKey }),
        })
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
    }
  }, [streamId, enabled])
}
